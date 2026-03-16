import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  MarkdownTableMode,
  OpenClawConfig,
  OutboundReplyPayload,
} from "openclaw/plugin-sdk/instagram";
import {
  createTypingCallbacks,
  createScopedPairingAccess,
  createReplyPrefixOptions,
  issuePairingChallenge,
  logTypingFailure,
  resolveDirectDmAuthorizationOutcome,
  resolveSenderCommandAuthorizationWithRuntime,
  resolveOutboundMediaUrls,
  resolveInboundRouteEnvelopeBuilderWithRuntime,
  sendMediaWithLeadingCaption,
  resolveWebhookPath,
  waitForAbortSignal,
} from "openclaw/plugin-sdk/instagram";
import type { ResolvedInstagramAccount } from "./accounts.js";
import {
  sendMessage,
  sendSenderAction,
  type InstagramFetch,
  type InstagramInboundMessage,
  type InstagramMessagingEvent,
  type InstagramWebhookPayload,
} from "./api.js";
import { isInstagramSenderAllowed } from "./group-access.js";
import {
  clearInstagramWebhookSecurityStateForTest,
  getInstagramWebhookRateLimitStateSizeForTest,
  getInstagramWebhookStatusCounterSizeForTest,
  handleInstagramWebhookRequest as handleInstagramWebhookRequestInternal,
  registerInstagramWebhookTarget as registerInstagramWebhookTargetInternal,
  type InstagramWebhookTarget,
} from "./monitor.webhook.js";
import { resolveInstagramProxyFetch } from "./proxy.js";
import { getInstagramRuntime } from "./runtime.js";

export type InstagramRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export type InstagramMonitorOptions = {
  token: string;
  account: ResolvedInstagramAccount;
  config: OpenClawConfig;
  runtime: InstagramRuntimeEnv;
  abortSignal: AbortSignal;
  appSecret: string;
  webhookVerifyToken: string;
  webhookPath?: string;
  fetcher?: InstagramFetch;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

// Instagram DM has a 1000 char limit
const INSTAGRAM_TEXT_LIMIT = 1000;
const DEFAULT_MEDIA_MAX_MB = 5;
const INSTAGRAM_TYPING_TIMEOUT_MS = 5_000;

type InstagramCoreRuntime = ReturnType<typeof getInstagramRuntime>;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

function logVerbose(
  core: InstagramCoreRuntime,
  runtime: InstagramRuntimeEnv,
  message: string,
): void {
  if (core.logging.shouldLogVerbose()) {
    runtime.log?.(`[instagram] ${message}`);
  }
}

export function registerInstagramWebhookTarget(target: InstagramWebhookTarget): () => void {
  return registerInstagramWebhookTargetInternal(target, {
    route: {
      auth: "plugin",
      match: "exact",
      pluginId: "instagram",
      source: "instagram-webhook",
      accountId: target.account.accountId,
      log: target.runtime.log,
      handler: async (req, res) => {
        const handled = await handleInstagramWebhookRequest(req, res);
        if (!handled && !res.headersSent) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
        }
      },
    },
  });
}

export {
  clearInstagramWebhookSecurityStateForTest,
  getInstagramWebhookRateLimitStateSizeForTest,
  getInstagramWebhookStatusCounterSizeForTest,
};

export async function handleInstagramWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  return handleInstagramWebhookRequestInternal(req, res, async ({ payload, target }) => {
    await processWebhookPayload(
      payload,
      target.token,
      target.account,
      target.config,
      target.runtime,
      getInstagramRuntime(),
      target.mediaMaxMb,
      target.statusSink,
      target.fetcher,
    );
  });
}

async function processWebhookPayload(
  payload: InstagramWebhookPayload,
  token: string,
  account: ResolvedInstagramAccount,
  config: OpenClawConfig,
  runtime: InstagramRuntimeEnv,
  core: InstagramCoreRuntime,
  mediaMaxMb: number,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
  fetcher?: InstagramFetch,
): Promise<void> {
  for (const entry of payload.entry) {
    for (const event of entry.messaging ?? []) {
      if (event.message?.is_echo) {
        continue;
      }

      if (event.message) {
        await handleMessage(
          event,
          token,
          account,
          config,
          runtime,
          core,
          mediaMaxMb,
          statusSink,
          fetcher,
        );
      } else if (event.postback) {
        await handlePostback(event, token, account, config, runtime, core, statusSink, fetcher);
      }
    }
  }
}

async function handleMessage(
  event: InstagramMessagingEvent,
  token: string,
  account: ResolvedInstagramAccount,
  config: OpenClawConfig,
  runtime: InstagramRuntimeEnv,
  core: InstagramCoreRuntime,
  mediaMaxMb: number,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
  fetcher?: InstagramFetch,
): Promise<void> {
  const message = event.message!;
  const hasAttachments = message.attachments && message.attachments.length > 0;

  let mediaPath: string | undefined;
  let mediaType: string | undefined;

  if (hasAttachments) {
    const imageAttachment = message.attachments!.find((a) => a.type === "image" && a.payload.url);
    if (imageAttachment?.payload.url) {
      try {
        const maxBytes = mediaMaxMb * 1024 * 1024;
        const fetched = await core.channel.media.fetchRemoteMedia({
          url: imageAttachment.payload.url,
          maxBytes,
        });
        const saved = await core.channel.media.saveMediaBuffer(
          fetched.buffer,
          fetched.contentType,
          "inbound",
          maxBytes,
        );
        mediaPath = saved.path;
        mediaType = saved.contentType;
      } catch (err) {
        runtime.error?.(
          `[${account.accountId}] Failed to download Instagram image: ${String(err)}`,
        );
      }
    }
  }

  const text = message.text ?? "";
  if (!text.trim() && !mediaPath) {
    return;
  }

  await processMessageWithPipeline({
    senderId: event.sender.id,
    recipientId: event.recipient.id,
    messageId: message.mid,
    timestamp: event.timestamp,
    token,
    account,
    config,
    runtime,
    core,
    text,
    mediaPath,
    mediaType,
    statusSink,
    fetcher,
  });
}

async function handlePostback(
  event: InstagramMessagingEvent,
  token: string,
  account: ResolvedInstagramAccount,
  config: OpenClawConfig,
  runtime: InstagramRuntimeEnv,
  core: InstagramCoreRuntime,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
  fetcher?: InstagramFetch,
): Promise<void> {
  const postback = event.postback!;
  const text = postback.payload || postback.title;

  await processMessageWithPipeline({
    senderId: event.sender.id,
    recipientId: event.recipient.id,
    messageId: postback.mid,
    timestamp: event.timestamp,
    token,
    account,
    config,
    runtime,
    core,
    text,
    mediaPath: undefined,
    mediaType: undefined,
    statusSink,
    fetcher,
  });
}

async function processMessageWithPipeline(params: {
  senderId: string;
  recipientId: string;
  messageId: string;
  timestamp: number;
  token: string;
  account: ResolvedInstagramAccount;
  config: OpenClawConfig;
  runtime: InstagramRuntimeEnv;
  core: InstagramCoreRuntime;
  text?: string;
  mediaPath?: string;
  mediaType?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  fetcher?: InstagramFetch;
}): Promise<void> {
  const {
    senderId,
    recipientId,
    messageId,
    timestamp,
    token,
    account,
    config,
    runtime,
    core,
    text,
    mediaPath,
    mediaType,
    statusSink,
    fetcher,
  } = params;

  const pairing = createScopedPairingAccess({
    core,
    channel: "instagram",
    accountId: account.accountId,
  });

  const isGroup = false;
  const chatId = senderId;
  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const configAllowFrom = (account.config.allowFrom ?? []).map((v) => String(v));

  const rawBody = text?.trim() || (mediaPath ? "<media:image>" : "");
  const { senderAllowedForCommands, commandAuthorized } =
    await resolveSenderCommandAuthorizationWithRuntime({
      cfg: config,
      rawBody,
      isGroup,
      dmPolicy,
      configuredAllowFrom: configAllowFrom,
      configuredGroupAllowFrom: [],
      senderId,
      isSenderAllowed: isInstagramSenderAllowed,
      readAllowFromStore: pairing.readAllowFromStore,
      runtime: core.channel.commands,
    });

  const directDmOutcome = resolveDirectDmAuthorizationOutcome({
    isGroup,
    dmPolicy,
    senderAllowedForCommands,
  });
  if (directDmOutcome === "disabled") {
    logVerbose(core, runtime, `Blocked Instagram DM from ${senderId} (dmPolicy=disabled)`);
    return;
  }
  if (directDmOutcome === "unauthorized") {
    if (dmPolicy === "pairing") {
      await issuePairingChallenge({
        channel: "instagram",
        senderId,
        senderIdLine: `Your Instagram IGSID: ${senderId}`,
        meta: {},
        upsertPairingRequest: pairing.upsertPairingRequest,
        onCreated: () => {
          logVerbose(core, runtime, `instagram pairing request sender=${senderId}`);
        },
        sendPairingReply: async (replyText) => {
          await sendMessage(
            token,
            {
              recipient: { id: chatId },
              messaging_type: "RESPONSE",
              message: { text: replyText },
            },
            fetcher,
          );
          statusSink?.({ lastOutboundAt: Date.now() });
        },
        onReplyError: (err) => {
          logVerbose(
            core,
            runtime,
            `instagram pairing reply failed for ${senderId}: ${String(err)}`,
          );
        },
      });
    } else {
      logVerbose(
        core,
        runtime,
        `Blocked unauthorized Instagram sender ${senderId} (dmPolicy=${dmPolicy})`,
      );
    }
    return;
  }

  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg: config,
    channel: "instagram",
    accountId: account.accountId,
    peer: { kind: "direct" as const, id: chatId },
    runtime: core.channel,
    sessionStore: config.session?.store,
  });

  const fromLabel = `user:${senderId}`;
  const { storePath, body } = buildEnvelope({
    channel: "Instagram",
    from: fromLabel,
    timestamp: timestamp ? timestamp : undefined,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `instagram:${senderId}`,
    To: `instagram:${recipientId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: fromLabel,
    SenderName: undefined,
    SenderId: senderId,
    CommandAuthorized: commandAuthorized,
    Provider: "instagram",
    Surface: "instagram",
    MessageSid: messageId,
    MediaPath: mediaPath,
    MediaType: mediaType,
    MediaUrl: mediaPath,
    OriginatingChannel: "instagram",
    OriginatingTo: `instagram:${recipientId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`instagram: failed updating session meta: ${String(err)}`);
    },
  });

  const tableMode = core.channel.text.resolveMarkdownTableMode({
    cfg: config,
    channel: "instagram",
    accountId: account.accountId,
  });
  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "instagram",
    accountId: account.accountId,
  });
  const typingCallbacks = createTypingCallbacks({
    start: async () => {
      await sendSenderAction(
        token,
        { recipient: { id: chatId }, sender_action: "typing_on" },
        fetcher,
        INSTAGRAM_TYPING_TIMEOUT_MS,
      );
    },
    onStartError: (err) => {
      logTypingFailure({
        log: (message) => logVerbose(core, runtime, message),
        channel: "instagram",
        action: "start",
        target: chatId,
        error: err,
      });
    },
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      typingCallbacks,
      deliver: async (payload) => {
        await deliverInstagramReply({
          payload,
          token,
          chatId,
          runtime,
          core,
          config,
          accountId: account.accountId,
          statusSink,
          fetcher,
          tableMode,
        });
      },
      onError: (err, info) => {
        runtime.error?.(
          `[${account.accountId}] Instagram ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
    replyOptions: { onModelSelected },
  });
}

async function deliverInstagramReply(params: {
  payload: OutboundReplyPayload;
  token: string;
  chatId: string;
  runtime: InstagramRuntimeEnv;
  core: InstagramCoreRuntime;
  config: OpenClawConfig;
  accountId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  fetcher?: InstagramFetch;
  tableMode?: MarkdownTableMode;
}): Promise<void> {
  const { payload, token, chatId, runtime, core, config, accountId, statusSink, fetcher } = params;
  const tableMode = params.tableMode ?? "code";
  const text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);

  const sentMedia = await sendMediaWithLeadingCaption({
    mediaUrls: resolveOutboundMediaUrls(payload),
    caption: text,
    send: async ({ mediaUrl, caption }) => {
      await sendMessage(
        token,
        {
          recipient: { id: chatId },
          messaging_type: "RESPONSE",
          message: {
            attachment: { type: "image", payload: { url: mediaUrl, is_reusable: true } },
          },
        },
        fetcher,
      );
      if (caption?.trim()) {
        await sendMessage(
          token,
          {
            recipient: { id: chatId },
            messaging_type: "RESPONSE",
            message: { text: caption.slice(0, INSTAGRAM_TEXT_LIMIT) },
          },
          fetcher,
        );
      }
      statusSink?.({ lastOutboundAt: Date.now() });
    },
    onError: (error) => {
      runtime.error?.(`Instagram media send failed: ${String(error)}`);
    },
  });
  if (sentMedia) return;

  if (text) {
    const chunkMode = core.channel.text.resolveChunkMode(config, "instagram", accountId);
    const chunks = core.channel.text.chunkMarkdownTextWithMode(
      text,
      INSTAGRAM_TEXT_LIMIT,
      chunkMode,
    );
    for (const chunk of chunks) {
      try {
        await sendMessage(
          token,
          {
            recipient: { id: chatId },
            messaging_type: "RESPONSE",
            message: { text: chunk },
          },
          fetcher,
        );
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error?.(`Instagram message send failed: ${String(err)}`);
      }
    }
  }
}

export async function monitorInstagramProvider(options: InstagramMonitorOptions): Promise<void> {
  const {
    token,
    account,
    config,
    runtime,
    abortSignal,
    appSecret,
    webhookVerifyToken,
    webhookPath,
    statusSink,
    fetcher: fetcherOverride,
  } = options;

  const core = getInstagramRuntime();
  const effectiveMediaMaxMb = account.config.mediaMaxMb ?? DEFAULT_MEDIA_MAX_MB;
  const fetcher = fetcherOverride ?? resolveInstagramProxyFetch(account.config.proxy);

  runtime.log?.(
    `[${account.accountId}] Instagram provider init (webhook-only) mediaMaxMb=${String(effectiveMediaMaxMb)}`,
  );

  try {
    if (!appSecret) {
      throw new Error("Instagram appSecret is required for webhook signature verification");
    }
    if (!webhookVerifyToken) {
      throw new Error("Instagram webhookVerifyToken is required for webhook verification");
    }

    const path = resolveWebhookPath({
      webhookPath,
      webhookUrl: account.config.webhookUrl,
      defaultPath: "/instagram-webhook",
    });
    if (!path) {
      throw new Error("Instagram webhookPath could not be derived");
    }

    runtime.log?.(`[${account.accountId}] Instagram registering webhook handler path=${path}`);

    const unregister = registerInstagramWebhookTarget({
      token,
      account,
      config,
      runtime,
      core,
      appSecret,
      verifyToken: webhookVerifyToken,
      path,
      statusSink: (patch) => statusSink?.(patch),
      mediaMaxMb: effectiveMediaMaxMb,
      fetcher,
    });

    try {
      await waitForAbortSignal(abortSignal);
    } finally {
      unregister();
    }
  } catch (err) {
    runtime.error?.(
      `[${account.accountId}] Instagram provider startup failed: ${formatError(err)}`,
    );
    throw err;
  } finally {
    runtime.log?.(`[${account.accountId}] Instagram provider stopped`);
  }
}

export const __testing = { isInstagramSenderAllowed };
