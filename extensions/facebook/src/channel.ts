import {
  buildAccountScopedDmSecurityPolicy,
  createAccountStatusSink,
  mapAllowFromEntries,
} from "openclaw/plugin-sdk/compat";
import type {
  ChannelAccountSnapshot,
  ChannelDock,
  ChannelPlugin,
  OpenClawConfig,
} from "openclaw/plugin-sdk/facebook";
import {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  buildBaseAccountStatusSnapshot,
  buildChannelConfigSchema,
  buildTokenChannelStatusSummary,
  buildChannelSendResult,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  chunkTextForOutbound,
  formatAllowFromLowercase,
  migrateBaseNameToDefaultAccount,
  listDirectoryUserEntriesFromAllowFrom,
  normalizeAccountId,
  isNumericTargetId,
  PAIRING_APPROVED_MESSAGE,
  resolveOutboundMediaUrls,
  sendPayloadWithChunkedTextAndMedia,
  setAccountEnabledInConfigSection,
} from "openclaw/plugin-sdk/facebook";
import {
  listFacebookAccountIds,
  resolveDefaultFacebookAccountId,
  resolveFacebookAccount,
  type ResolvedFacebookAccount,
} from "./accounts.js";
import { facebookMessageActions } from "./actions.js";
import { FacebookConfigSchema } from "./config-schema.js";
import { facebookOnboardingAdapter } from "./onboarding.js";
import { probeFacebook } from "./probe.js";
import { resolveFacebookProxyFetch } from "./proxy.js";
import { normalizeSecretInputString } from "./secret-input.js";
import { sendMessageFacebook } from "./send.js";
import { collectFacebookStatusIssues } from "./status-issues.js";

const meta = {
  id: "facebook",
  label: "Facebook Messenger",
  selectionLabel: "Facebook Messenger (Page)",
  docsPath: "/channels/facebook",
  docsLabel: "facebook",
  blurb: "Facebook Messenger channel via Graph API for Pages.",
  aliases: ["fb", "messenger"],
  order: 30,
  quickstartAllowFrom: true,
};

function normalizeFacebookMessagingTarget(raw: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^(facebook|fb|messenger):/i, "");
}

export const facebookDock: ChannelDock = {
  id: "facebook",
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 2000 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      mapAllowFromEntries(resolveFacebookAccount({ cfg: cfg, accountId }).config.allowFrom),
    formatAllowFrom: ({ allowFrom }) =>
      formatAllowFromLowercase({ allowFrom, stripPrefixRe: /^(facebook|fb|messenger):/i }),
  },
  groups: {
    resolveRequireMention: () => true,
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
};

export const facebookPlugin: ChannelPlugin<ResolvedFacebookAccount> = {
  id: "facebook",
  meta,
  onboarding: facebookOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.facebook"] },
  configSchema: buildChannelConfigSchema(FacebookConfigSchema),
  config: {
    listAccountIds: (cfg) => listFacebookAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveFacebookAccount({ cfg: cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultFacebookAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg,
        sectionKey: "facebook",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg,
        sectionKey: "facebook",
        accountId,
        clearBaseFields: ["pageAccessToken", "tokenFile", "appSecret", "name"],
      }),
    isConfigured: (account) => Boolean(account.token?.trim()),
    describeAccount: (account): ChannelAccountSnapshot => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim()),
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      mapAllowFromEntries(resolveFacebookAccount({ cfg: cfg, accountId }).config.allowFrom),
    formatAllowFrom: ({ allowFrom }) =>
      formatAllowFromLowercase({ allowFrom, stripPrefixRe: /^(facebook|fb|messenger):/i }),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      return buildAccountScopedDmSecurityPolicy({
        cfg,
        channelKey: "facebook",
        accountId,
        fallbackAccountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
        policy: account.config.dmPolicy,
        allowFrom: account.config.allowFrom ?? [],
        policyPathSuffix: "dmPolicy",
        normalizeEntry: (raw) => raw.replace(/^(facebook|fb|messenger):/i, ""),
      });
    },
    collectWarnings: () => {
      // Facebook Messenger is DM-only (no group chats for Pages)
      return [];
    },
  },
  groups: {
    resolveRequireMention: () => true,
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
  actions: facebookMessageActions,
  messaging: {
    normalizeTarget: normalizeFacebookMessagingTarget,
    targetResolver: {
      looksLikeId: isNumericTargetId,
      hint: "<psid>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveFacebookAccount({ cfg: cfg, accountId });
      return listDirectoryUserEntriesFromAllowFrom({
        allowFrom: account.config.allowFrom,
        query,
        limit,
        normalizeId: (entry) => entry.replace(/^(facebook|fb|messenger):/i, ""),
      });
    },
    listGroups: async () => [],
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg,
        channelKey: "facebook",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "FACEBOOK_PAGE_ACCESS_TOKEN can only be used for the default account.";
      }
      if (!input.useEnv && !input.token && !input.tokenFile) {
        return "Facebook requires a page access token or --token-file (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg,
        channelKey: "facebook",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "facebook",
            })
          : namedConfig;
      const patch = input.useEnv
        ? {}
        : input.tokenFile
          ? { tokenFile: input.tokenFile }
          : input.token
            ? { pageAccessToken: input.token }
            : {};
      return applySetupAccountConfigPatch({
        cfg: next,
        channelKey: "facebook",
        accountId,
        patch,
      });
    },
  },
  pairing: {
    idLabel: "facebookPsid",
    normalizeAllowEntry: (entry) => entry.replace(/^(facebook|fb|messenger):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveFacebookAccount({ cfg: cfg });
      if (!account.token) {
        throw new Error("Facebook page access token not configured");
      }
      await sendMessageFacebook(id, PAIRING_APPROVED_MESSAGE, { token: account.token });
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: chunkTextForOutbound,
    chunkerMode: "text",
    textChunkLimit: 2000,
    sendPayload: async (ctx) =>
      await sendPayloadWithChunkedTextAndMedia({
        ctx,
        textChunkLimit: facebookPlugin.outbound!.textChunkLimit,
        chunker: facebookPlugin.outbound!.chunker,
        sendText: (nextCtx) => facebookPlugin.outbound!.sendText!(nextCtx),
        sendMedia: (nextCtx) => facebookPlugin.outbound!.sendMedia!(nextCtx),
        emptyResult: { channel: "facebook", messageId: "" },
      }),
    sendText: async ({ to, text, accountId, cfg }) => {
      const result = await sendMessageFacebook(to, text, {
        accountId: accountId ?? undefined,
        cfg: cfg,
      });
      return buildChannelSendResult("facebook", result);
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      const result = await sendMessageFacebook(to, text, {
        accountId: accountId ?? undefined,
        mediaUrl,
        cfg: cfg,
      });
      return buildChannelSendResult("facebook", result);
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: collectFacebookStatusIssues,
    buildChannelSummary: ({ snapshot }) => buildTokenChannelStatusSummary(snapshot),
    probeAccount: async ({ account, timeoutMs }) =>
      probeFacebook(account.token, timeoutMs, resolveFacebookProxyFetch(account.config.proxy)),
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = Boolean(account.token?.trim());
      const base = buildBaseAccountStatusSnapshot({
        account: {
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured,
        },
        runtime,
      });
      return {
        ...base,
        tokenSource: account.tokenSource,
        mode: "webhook",
        dmPolicy: account.config.dmPolicy ?? "pairing",
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const token = account.token.trim();
      let pageLabel = "";
      const fetcher = resolveFacebookProxyFetch(account.config.proxy);
      try {
        const probe = await probeFacebook(token, 2500, fetcher, account.config.apiVersion);
        const name = probe.ok ? probe.page?.name?.trim() : null;
        if (name) {
          pageLabel = ` (${name})`;
        }
        if (!probe.ok) {
          ctx.log?.warn?.(
            `[${account.accountId}] Facebook probe failed before provider start (${String(probe.elapsedMs)}ms): ${probe.error}`,
          );
        }
        ctx.setStatus({
          accountId: account.accountId,
          bot: probe.page,
        });
      } catch (err) {
        ctx.log?.warn?.(
          `[${account.accountId}] Facebook probe threw before provider start: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
        );
      }
      const statusSink = createAccountStatusSink({
        accountId: ctx.accountId,
        setStatus: ctx.setStatus,
      });

      const appSecret = account.appSecret;
      const webhookVerifyToken =
        normalizeSecretInputString(account.config.webhookVerifyToken) ?? "";

      ctx.log?.info(`[${account.accountId}] starting Facebook provider${pageLabel} mode=webhook`);
      const { monitorFacebookProvider } = await import("./monitor.js");
      return monitorFacebookProvider({
        token,
        account,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        appSecret,
        webhookVerifyToken,
        webhookPath: account.config.webhookPath,
        fetcher,
        statusSink,
      });
    },
  },
};
