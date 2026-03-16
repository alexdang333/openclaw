import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "openclaw/plugin-sdk/instagram";
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
  withResolvedWebhookRequestPipeline,
  WEBHOOK_ANOMALY_COUNTER_DEFAULTS,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
} from "openclaw/plugin-sdk/instagram";
import { resolveClientIp } from "../../../src/gateway/net.js";
import type { ResolvedInstagramAccount } from "./accounts.js";
import type { InstagramFetch, InstagramWebhookPayload } from "./api.js";
import type { InstagramRuntimeEnv } from "./monitor.js";

const INSTAGRAM_WEBHOOK_REPLAY_WINDOW_MS = 5 * 60_000;

export type InstagramWebhookTarget = {
  token: string;
  account: ResolvedInstagramAccount;
  config: OpenClawConfig;
  runtime: InstagramRuntimeEnv;
  core: unknown;
  appSecret: string;
  verifyToken: string;
  path: string;
  mediaMaxMb: number;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  fetcher?: InstagramFetch;
};

export type InstagramWebhookProcessUpdate = (params: {
  payload: InstagramWebhookPayload;
  target: InstagramWebhookTarget;
}) => Promise<void>;

const webhookTargets = new Map<string, InstagramWebhookTarget[]>();
const webhookRateLimiter = createFixedWindowRateLimiter({
  windowMs: WEBHOOK_RATE_LIMIT_DEFAULTS.windowMs,
  maxRequests: WEBHOOK_RATE_LIMIT_DEFAULTS.maxRequests,
  maxTrackedKeys: WEBHOOK_RATE_LIMIT_DEFAULTS.maxTrackedKeys,
});
const recentWebhookEvents = createDedupeCache({
  ttlMs: INSTAGRAM_WEBHOOK_REPLAY_WINDOW_MS,
  maxSize: 5000,
});
const webhookAnomalyTracker = createWebhookAnomalyTracker({
  maxTrackedKeys: WEBHOOK_ANOMALY_COUNTER_DEFAULTS.maxTrackedKeys,
  ttlMs: WEBHOOK_ANOMALY_COUNTER_DEFAULTS.ttlMs,
  logEvery: WEBHOOK_ANOMALY_COUNTER_DEFAULTS.logEvery,
});

export function clearInstagramWebhookSecurityStateForTest(): void {
  webhookRateLimiter.clear();
  webhookAnomalyTracker.clear();
}

export function getInstagramWebhookRateLimitStateSizeForTest(): number {
  return webhookRateLimiter.size();
}

export function getInstagramWebhookStatusCounterSizeForTest(): number {
  return webhookAnomalyTracker.size();
}

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
  runtime: InstagramRuntimeEnv | undefined,
  path: string,
  statusCode: number,
): void {
  webhookAnomalyTracker.record({
    key: `${path}:${statusCode}`,
    statusCode,
    log: runtime?.log,
    message: (count) =>
      `[instagram] webhook anomaly path=${path} status=${statusCode} count=${String(count)}`,
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function registerInstagramWebhookTarget(
  target: InstagramWebhookTarget,
  opts?: {
    route?: RegisterWebhookPluginRouteOptions;
  } & Pick<
    RegisterWebhookTargetOptions<InstagramWebhookTarget>,
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

function handleVerificationRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return false;
  }

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

  matchingTarget.runtime.log?.(`[${matchingTarget.account.accountId}] Instagram webhook verified`);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end(challenge);
  return true;
}

export async function handleInstagramWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  processUpdate: InstagramWebhookProcessUpdate,
): Promise<boolean> {
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

      const target = targets.find((t) => verifySignature(t.appSecret, rawBody, signatureHeader));
      if (!target) {
        res.statusCode = 403;
        res.end("Forbidden");
        recordWebhookStatus(targets[0]?.runtime, path, 403);
        return true;
      }

      const raw = body.value;
      const payload = raw as unknown as InstagramWebhookPayload;

      // Instagram webhooks send object: "instagram"
      if (!payload?.object || payload.object !== "instagram" || !payload.entry) {
        res.statusCode = 400;
        res.end("Bad Request");
        recordWebhookStatus(target.runtime, path, 400);
        return true;
      }

      for (const entry of payload.entry) {
        for (const event of entry.messaging ?? []) {
          const mid = event.message?.mid;
          if (mid && isReplayEvent(mid, nowMs)) {
            continue;
          }
        }
      }

      target.statusSink?.({ lastInboundAt: Date.now() });
      processUpdate({ payload, target }).catch((err) => {
        target.runtime.error?.(
          `[${target.account.accountId}] Instagram webhook failed: ${String(err)}`,
        );
      });

      res.statusCode = 200;
      res.end("EVENT_RECEIVED");
      return true;
    },
  });
}
