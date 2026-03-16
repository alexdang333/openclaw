import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "openclaw/plugin-sdk/facebook";
import {
  createDedupeCache,
  createFixedWindowRateLimiter,
  createWebhookAnomalyTracker,
  readJsonWebhookBodyOrReject,
  applyBasicWebhookRequestGuards,
  registerWebhookTargetWithPluginRoute,
  type RegisterWebhookPluginRouteOptions,
  type RegisterWebhookTargetOptions,
  registerWebhookTarget,
  resolveWebhookTargetWithAuthOrRejectSync,
  withResolvedWebhookRequestPipeline,
  WEBHOOK_ANOMALY_COUNTER_DEFAULTS,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
} from "openclaw/plugin-sdk/facebook";
import { resolveClientIp } from "../../../src/gateway/net.js";
import type { ResolvedFacebookAccount } from "./accounts.js";
import type { FacebookFetch, FacebookWebhookPayload } from "./api.js";
import type { FacebookRuntimeEnv } from "./monitor.js";

const FACEBOOK_WEBHOOK_REPLAY_WINDOW_MS = 5 * 60_000;

export type FacebookWebhookTarget = {
  token: string;
  account: ResolvedFacebookAccount;
  config: OpenClawConfig;
  runtime: FacebookRuntimeEnv;
  core: unknown;
  appSecret: string;
  verifyToken: string;
  path: string;
  mediaMaxMb: number;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  fetcher?: FacebookFetch;
};

export type FacebookWebhookProcessUpdate = (params: {
  payload: FacebookWebhookPayload;
  target: FacebookWebhookTarget;
}) => Promise<void>;

const webhookTargets = new Map<string, FacebookWebhookTarget[]>();
const webhookRateLimiter = createFixedWindowRateLimiter({
  windowMs: WEBHOOK_RATE_LIMIT_DEFAULTS.windowMs,
  maxRequests: WEBHOOK_RATE_LIMIT_DEFAULTS.maxRequests,
  maxTrackedKeys: WEBHOOK_RATE_LIMIT_DEFAULTS.maxTrackedKeys,
});
const recentWebhookEvents = createDedupeCache({
  ttlMs: FACEBOOK_WEBHOOK_REPLAY_WINDOW_MS,
  maxSize: 5000,
});
const webhookAnomalyTracker = createWebhookAnomalyTracker({
  maxTrackedKeys: WEBHOOK_ANOMALY_COUNTER_DEFAULTS.maxTrackedKeys,
  ttlMs: WEBHOOK_ANOMALY_COUNTER_DEFAULTS.ttlMs,
  logEvery: WEBHOOK_ANOMALY_COUNTER_DEFAULTS.logEvery,
});

export function clearFacebookWebhookSecurityStateForTest(): void {
  webhookRateLimiter.clear();
  webhookAnomalyTracker.clear();
}

export function getFacebookWebhookRateLimitStateSizeForTest(): number {
  return webhookRateLimiter.size();
}

export function getFacebookWebhookStatusCounterSizeForTest(): number {
  return webhookAnomalyTracker.size();
}

/**
 * Verify Facebook webhook signature using HMAC-SHA256.
 * Facebook sends x-hub-signature-256 header with sha256=<hex_digest>.
 */
function verifySignature(appSecret: string, rawBody: string, signatureHeader: string): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const [algo, signature] = signatureHeader.split("=");
  if (algo !== "sha256" || !signature) {
    return false;
  }

  const expectedSignature = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(sigBuffer, expectedBuffer);
}

function isReplayEvent(messageId: string, nowMs: number): boolean {
  if (!messageId) {
    return false;
  }
  return recentWebhookEvents.check(messageId, nowMs);
}

function recordWebhookStatus(
  runtime: FacebookRuntimeEnv | undefined,
  path: string,
  statusCode: number,
): void {
  webhookAnomalyTracker.record({
    key: `${path}:${statusCode}`,
    statusCode,
    log: runtime?.log,
    message: (count) =>
      `[facebook] webhook anomaly path=${path} status=${statusCode} count=${String(count)}`,
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function registerFacebookWebhookTarget(
  target: FacebookWebhookTarget,
  opts?: {
    route?: RegisterWebhookPluginRouteOptions;
  } & Pick<
    RegisterWebhookTargetOptions<FacebookWebhookTarget>,
    "onFirstPathTarget" | "onLastPathTargetRemoved"
  >,
): () => void {
  if (opts?.route) {
    return registerWebhookTargetWithPluginRoute({
      targetsByPath: webhookTargets,
      target,
      route: opts.route,
      onLastPathTargetRemoved: opts.onLastPathTargetRemoved,
    }).unregister;
  }
  return registerWebhookTarget(webhookTargets, target, opts).unregister;
}

/**
 * Handle Facebook webhook verification (GET request with hub.challenge).
 */
function handleVerificationRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return false;
  }

  // Find a target on this path that matches the verify token
  const path = url.pathname;
  const targets = webhookTargets.get(path);
  if (!targets || targets.length === 0) {
    return false;
  }

  const matchingTarget = targets.find((t) => t.verifyToken === token);
  if (!matchingTarget) {
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }

  matchingTarget.runtime.log?.(`[${matchingTarget.account.accountId}] Facebook webhook verified`);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end(challenge);
  return true;
}

export async function handleFacebookWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  processUpdate: FacebookWebhookProcessUpdate,
): Promise<boolean> {
  // Handle GET requests for webhook verification
  if (req.method === "GET") {
    return handleVerificationRequest(req, res);
  }

  return await withResolvedWebhookRequestPipeline({
    req,
    res,
    targetsByPath: webhookTargets,
    allowMethods: ["POST"],
    handle: async ({ targets, path }) => {
      const trustedProxies = targets[0]?.config.gateway?.trustedProxies;
      const allowRealIpFallback = targets[0]?.config.gateway?.allowRealIpFallback === true;
      const clientIp =
        resolveClientIp({
          remoteAddr: req.socket.remoteAddress,
          forwardedFor: headerValue(req.headers["x-forwarded-for"]),
          realIp: headerValue(req.headers["x-real-ip"]),
          trustedProxies,
          allowRealIpFallback,
        }) ??
        req.socket.remoteAddress ??
        "unknown";
      const rateLimitKey = `${path}:${clientIp}`;
      const nowMs = Date.now();
      if (
        !applyBasicWebhookRequestGuards({
          req,
          res,
          rateLimiter: webhookRateLimiter,
          rateLimitKey,
          nowMs,
        })
      ) {
        recordWebhookStatus(targets[0]?.runtime, path, res.statusCode);
        return true;
      }

      // Read the raw body for HMAC verification
      if (
        !applyBasicWebhookRequestGuards({
          req,
          res,
          requireJsonContentType: true,
        })
      ) {
        recordWebhookStatus(targets[0]?.runtime, path, res.statusCode);
        return true;
      }

      const body = await readJsonWebhookBodyOrReject({
        req,
        res,
        maxBytes: 1024 * 1024,
        timeoutMs: 30_000,
        emptyObjectOnEmpty: false,
        invalidJsonMessage: "Bad Request",
        returnRawBody: true,
      });
      if (!body.ok) {
        recordWebhookStatus(targets[0]?.runtime, path, res.statusCode);
        return true;
      }

      const rawBody =
        (body as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(body.value);
      const signatureHeader = String(req.headers["x-hub-signature-256"] ?? "");

      // Find matching target by verifying HMAC signature
      const target = targets.find((t) => verifySignature(t.appSecret, rawBody, signatureHeader));
      if (!target) {
        res.statusCode = 403;
        res.end("Forbidden");
        recordWebhookStatus(targets[0]?.runtime, path, 403);
        return true;
      }

      const raw = body.value;
      const payload = raw as unknown as FacebookWebhookPayload;

      if (!payload?.object || payload.object !== "page" || !payload.entry) {
        res.statusCode = 400;
        res.end("Bad Request");
        recordWebhookStatus(target.runtime, path, 400);
        return true;
      }

      // Deduplicate messages
      for (const entry of payload.entry) {
        for (const event of entry.messaging ?? []) {
          const mid = event.message?.mid;
          if (mid && isReplayEvent(mid, nowMs)) {
            // Skip duplicate — but don't reject the whole request
            continue;
          }
        }
      }

      target.statusSink?.({ lastInboundAt: Date.now() });
      processUpdate({ payload, target }).catch((err) => {
        target.runtime.error?.(
          `[${target.account.accountId}] Facebook webhook failed: ${String(err)}`,
        );
      });

      res.statusCode = 200;
      res.end("EVENT_RECEIVED");
      return true;
    },
  });
}
