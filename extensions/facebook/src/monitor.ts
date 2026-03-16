import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  MarkdownTableMode,
  OpenClawConfig,
  OutboundReplyPayload,
} from "openclaw/plugin-sdk/facebook";
import {
  createTypingCallbacks,
  createScopedPairingAccess,
  createReplyPrefixOptions,
  issuePairingChallenge,
  logTypingFailure,
  resolveDirectDmAuthorizationOutcome,
  resolveSenderCommandAuthorizationWithRuntime,
  resolveOutboundMediaUrls,
  resolveDefaultGroupPolicy,
  resolveInboundRouteEnvelopeBuilderWithRuntime,
  sendMediaWithLeadingCaption,
  resolveWebhookPath,
  waitForAbortSignal,
} from "openclaw/plugin-sdk/facebook";
import type { ResolvedFacebookAccount } from "./accounts.js";
import {
  sendMessage,
  sendSenderAction,
  type FacebookFetch,
  type FacebookInboundMessage,
  type FacebookMessagingEvent,
  type FacebookWebhookPayload,
} from "./api.js";
import { isFacebookSenderAllowed } from "./group-access.js";
import {
  clearFacebookWebhookSecurityStateForTest,
  getFacebookWebhookRateLimitStateSizeForTest,
  getFacebookWebhookStatusCounterSizeForTest,
  handleFacebookWebhookRequest as handleFacebookWebhookRequestInternal,
  registerFacebookWebhookTarget as registerFacebookWebhookTargetInternal,
  type FacebookWebhookTarget,
} from "./monitor.webhook.js";
import { resolveFacebookProxyFetch } from "./proxy.js";
import { getFacebookRuntime } from "./runtime.js";

export type FacebookRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export type FacebookMonitorOptions = {
  token: string;
  account: ResolvedFacebookAccount;
  config: OpenClawConfig;
  runtime: FacebookRuntimeEnv;
  abortSignal: AbortSignal;
  appSecret: string;
  webhookVerifyToken: string;
  webhookPath?: string;
  fetcher?: FacebookFetch;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

const FACEBOOK_TEXT_LIMIT = 2000;
const DEFAULT_MEDIA_MAX_MB = 5;
const FACEBOOK_TYPING_TIMEOUT_MS = 5_000;

type FacebookCoreRuntime = ReturnType<typeof getFacebookRuntime>;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

function logVerbose(core: FacebookCoreRuntime, runtime: FacebookRuntimeEnv, message: string): void {
  if (core.logging.shouldLogVerbose()) {
    runtime.log?.(`[facebook] ${message}`);
  }
}

export function registerFacebookWebhookTarget(target: FacebookWebhookTarget): () => void {
  return registerFacebookWebhookTargetInternal(target, {
    route: {
      auth: "plugin",
      match: "exact",
      pluginId: "facebook",
      source: "facebook-webhook",
      accountId: target.account.accountId,
      log: target.runtime.log,
      handler: async (req, res) => {
        const handled = await handleFacebookWebhookRequest(req, res);
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
  clearFacebookWebhookSecurityStateForTest,
  getFacebookWebhookRateLimitStateSizeForTest,
  getFacebookWebhookStatusCounterSizeForTest,
};

export async function handleFacebookWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  return handleFacebookWebhookRequestInternal(req, res, async ({ payload, target }) => {
    await processWebhookPayload(
      payload,
      target.token,
      target.account,
      target.config,
      target.runtime,
      getFacebookRuntime(),
      target.mediaMaxMb,
      target.statusSink,
      target.fetcher,
    );
  });
}

async function processWebhookPayload(
  payload: FacebookWebhookPayload,
  token: string,
  account: ResolvedFacebookAccount,
  config: OpenClawConfig,
  runtime: FacebookRuntimeEnv,
  core: FacebookCoreRuntime,
  mediaMaxMb: number,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
  fetcher?: FacebookFetch,
): Promise<void> {
  for (const entry of payload.entry) {
    for (const event of entry.messaging ?? []) {
      // Skip echo messages (sent by the page itself)
      if (event.message?.is_echo) {
        continue;
      }

      // Skip delivery and read receipts
      if (event.delivery || event.read) {
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
        // Treat postback payload as text message
        await handlePostback(event, token, account, config, runtime, core, statusSink, fetcher);
      }
    }
  }
}

async function handleMessage(
  event: FacebookMessagingEvent,
  token: string,
  account: ResolvedFacebookAccount,
  config: OpenClawConfig,
  runtime: FacebookRuntimeEnv,
  core: FacebookCoreRuntime,
  mediaMaxMb: number,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
  fetcher?: FacebookFetch,
): Promise<void> {
  const message = event.message!;
  const hasAttachments = message.attachments && message.attachments.length > 0;

  let mediaPath: string | undefined;
  let mediaType: string | undefined;

  // Process first image attachment if present
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
        runtime.error?.(`[${account.accountId}] Failed to download Facebook image: ${String(err)}`);
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
  event: FacebookMessagingEvent,
  token: string,
  account: ResolvedFacebookAccount,
  config: OpenClawConfig,
  runtime: FacebookRuntimeEnv,
  core: FacebookCoreRuntime,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
  fetcher?: FacebookFetch,
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
  account: ResolvedFacebookAccount;
  config: OpenClawConfig;
  runtime: FacebookRuntimeEnv;
  core: FacebookCoreRuntime;
  text?: string;
  mediaPath?: string;
  mediaType?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  fetcher?: FacebookFetch;
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
    channel: "facebook",
    accountId: account.accountId,
  });

  // Facebook Messenger is always DM (no group chats for Pages)
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
      isSenderAllowed: isFacebookSenderAllowed,
      readAllowFromStore: pairing.readAllowFromStore,
      runtime: core.channel.commands,
    });

  const directDmOutcome = resolveDirectDmAuthorizationOutcome({
    isGroup,
    dmPolicy,
    senderAllowedForCommands,
  });
  if (directDmOutcome === "disabled") {
    logVerbose(core, runtime, `Blocked Facebook DM from ${senderId} (dmPolicy=disabled)`);
    return;
  }
  if (directDmOutcome === "unauthorized") {
    if (dmPolicy === "pairing") {
      await issuePairingChallenge({
        channel: "facebook",
        senderId,
        senderIdLine: `Your Facebook PSID: ${senderId}`,
        meta: {},
        upsertPairingRequest: pairing.upsertPairingRequest,
        onCreated: () => {
          logVerbose(core, runtime, `facebook pairing request sender=${senderId}`);
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
            `facebook pairing reply failed for ${senderId}: ${String(err)}`,
          );
        },
      });
    } else {
      logVerbose(
        core,
        runtime,
        `Blocked unauthorized Facebook sender ${senderId} (dmPolicy=${dmPolicy})`,
      );
    }
    return;
  }

  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg: config,
    channel: "facebook",
    accountId: account.accountId,
    peer: {
      kind: "direct" as const,
      id: chatId,
    },
    runtime: core.channel,
    sessionStore: config.session?.store,
  });

  const fromLabel = `user:${senderId}`;
  const { storePath, body } = buildEnvelope({
    channel: "Facebook",
    from: fromLabel,
    timestamp: timestamp ? timestamp : undefined,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `facebook:${senderId}`,
    To: `facebook:${recipientId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: fromLabel,
    SenderName: undefined,
    SenderId: senderId,
    CommandAuthorized: commandAuthorized,
    Provider: "facebook",
    Surface: "facebook",
    MessageSid: messageId,
    MediaPath: mediaPath,
    MediaType: mediaType,
    MediaUrl: mediaPath,
    OriginatingChannel: "facebook",
    OriginatingTo: `facebook:${recipientId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`facebook: failed updating session meta: ${String(err)}`);
    },
  });

  const tableMode = core.channel.text.resolveMarkdownTableMode({
    cfg: config,
    channel: "facebook",
    accountId: account.accountId,
  });
  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "facebook",
    accountId: account.accountId,
  });
  const typingCallbacks = createTypingCallbacks({
    start: async () => {
      await sendSenderAction(
        token,
        {
          recipient: { id: chatId },
          sender_action: "typing_on",
        },
        fetcher,
        FACEBOOK_TYPING_TIMEOUT_MS,
      );
    },
    onStartError: (err) => {
      logTypingFailure({
        log: (message) => logVerbose(core, runtime, message),
        channel: "facebook",
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
        await deliverFacebookReply({
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
          `[${account.accountId}] Facebook ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

async function deliverFacebookReply(params: {
  payload: OutboundReplyPayload;
  token: string;
  chatId: string;
  runtime: FacebookRuntimeEnv;
  core: FacebookCoreRuntime;
  config: OpenClawConfig;
  accountId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  fetcher?: FacebookFetch;
  tableMode?: MarkdownTableMode;
}): Promise<void> {
  const { payload, token, chatId, runtime, core, config, accountId, statusSink, fetcher } = params;
  const tableMode = params.tableMode ?? "code";
  const text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);

  // Try sending media with leading caption
  const sentMedia = await sendMediaWithLeadingCaption({
    mediaUrls: resolveOutboundMediaUrls(payload),
    caption: text,
    send: async ({ mediaUrl, caption }) => {
      // Send image attachment
      await sendMessage(
        token,
        {
          recipient: { id: chatId },
          messaging_type: "RESPONSE",
          message: {
            attachment: {
              type: "image",
              payload: { url: mediaUrl, is_reusable: true },
            },
          },
        },
        fetcher,
      );
      // Send caption as follow-up text if present
      if (caption?.trim()) {
        await sendMessage(
          token,
          {
            recipient: { id: chatId },
            messaging_type: "RESPONSE",
            message: { text: caption.slice(0, FACEBOOK_TEXT_LIMIT) },
          },
          fetcher,
        );
      }
      statusSink?.({ lastOutboundAt: Date.now() });
    },
    onError: (error) => {
      runtime.error?.(`Facebook media send failed: ${String(error)}`);
    },
  });
  if (sentMedia) {
    return;
  }

  if (text) {
    const chunkMode = core.channel.text.resolveChunkMode(config, "facebook", accountId);
    const chunks = core.channel.text.chunkMarkdownTextWithMode(
      text,
      FACEBOOK_TEXT_LIMIT,
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
        runtime.error?.(`Facebook message send failed: ${String(err)}`);
      }
    }
  }
}

export async function monitorFacebookProvider(options: FacebookMonitorOptions): Promise<void> {
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

  const core = getFacebookRuntime();
  const effectiveMediaMaxMb = account.config.mediaMaxMb ?? DEFAULT_MEDIA_MAX_MB;
  const fetcher = fetcherOverride ?? resolveFacebookProxyFetch(account.config.proxy);

  runtime.log?.(
    `[${account.accountId}] Facebook provider init (webhook-only) mediaMaxMb=${String(effectiveMediaMaxMb)}`,
  );

  try {
    if (!appSecret) {
      throw new Error("Facebook appSecret is required for webhook signature verification");
    }
    if (!webhookVerifyToken) {
      throw new Error("Facebook webhookVerifyToken is required for webhook verification");
    }

    const path = resolveWebhookPath({
      webhookPath,
      webhookUrl: account.config.webhookUrl,
      defaultPath: "/facebook-webhook",
    });
    if (!path) {
      throw new Error("Facebook webhookPath could not be derived");
    }

    runtime.log?.(`[${account.accountId}] Facebook registering webhook handler path=${path}`);

    const unregister = registerFacebookWebhookTarget({
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
    runtime.error?.(`[${account.accountId}] Facebook provider startup failed: ${formatError(err)}`);
    throw err;
  } finally {
    runtime.log?.(`[${account.accountId}] Facebook provider stopped`);
  }
}

export const __testing = {
  isFacebookSenderAllowed,
};
