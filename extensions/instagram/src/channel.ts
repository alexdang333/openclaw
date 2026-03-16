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
} from "openclaw/plugin-sdk/instagram";
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
} from "openclaw/plugin-sdk/instagram";
import {
  listInstagramAccountIds,
  resolveDefaultInstagramAccountId,
  resolveInstagramAccount,
  type ResolvedInstagramAccount,
} from "./accounts.js";
import { instagramMessageActions } from "./actions.js";
import { InstagramConfigSchema } from "./config-schema.js";
import { instagramOnboardingAdapter } from "./onboarding.js";
import { probeInstagram } from "./probe.js";
import { resolveInstagramProxyFetch } from "./proxy.js";
import { normalizeSecretInputString } from "./secret-input.js";
import { sendMessageInstagram } from "./send.js";
import { collectInstagramStatusIssues } from "./status-issues.js";

const meta = {
  id: "instagram",
  label: "Instagram DM",
  selectionLabel: "Instagram DM (Graph API)",
  docsPath: "/channels/instagram",
  docsLabel: "instagram",
  blurb: "Instagram Direct Messages via Graph API.",
  aliases: ["ig", "insta"],
  order: 35,
  quickstartAllowFrom: true,
};

function normalizeInstagramMessagingTarget(raw: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^(instagram|ig|insta):/i, "");
}

export const instagramDock: ChannelDock = {
  id: "instagram",
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 1000 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      mapAllowFromEntries(resolveInstagramAccount({ cfg, accountId }).config.allowFrom),
    formatAllowFrom: ({ allowFrom }) =>
      formatAllowFromLowercase({ allowFrom, stripPrefixRe: /^(instagram|ig|insta):/i }),
  },
  groups: { resolveRequireMention: () => true },
  threading: { resolveReplyToMode: () => "off" },
};

export const instagramPlugin: ChannelPlugin<ResolvedInstagramAccount> = {
  id: "instagram",
  meta,
  onboarding: instagramOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.instagram"] },
  configSchema: buildChannelConfigSchema(InstagramConfigSchema),
  config: {
    listAccountIds: (cfg) => listInstagramAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveInstagramAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultInstagramAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "instagram",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "instagram",
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
      mapAllowFromEntries(resolveInstagramAccount({ cfg, accountId }).config.allowFrom),
    formatAllowFrom: ({ allowFrom }) =>
      formatAllowFromLowercase({ allowFrom, stripPrefixRe: /^(instagram|ig|insta):/i }),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) =>
      buildAccountScopedDmSecurityPolicy({
        cfg,
        channelKey: "instagram",
        accountId,
        fallbackAccountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
        policy: account.config.dmPolicy,
        allowFrom: account.config.allowFrom ?? [],
        policyPathSuffix: "dmPolicy",
        normalizeEntry: (raw) => raw.replace(/^(instagram|ig|insta):/i, ""),
      }),
    collectWarnings: () => [],
  },
  groups: { resolveRequireMention: () => true },
  threading: { resolveReplyToMode: () => "off" },
  actions: instagramMessageActions,
  messaging: {
    normalizeTarget: normalizeInstagramMessagingTarget,
    targetResolver: { looksLikeId: isNumericTargetId, hint: "<igsid>" },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveInstagramAccount({ cfg, accountId });
      return listDirectoryUserEntriesFromAllowFrom({
        allowFrom: account.config.allowFrom,
        query,
        limit,
        normalizeId: (entry) => entry.replace(/^(instagram|ig|insta):/i, ""),
      });
    },
    listGroups: async () => [],
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({ cfg, channelKey: "instagram", accountId, name }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "INSTAGRAM_PAGE_ACCESS_TOKEN can only be used for the default account.";
      }
      if (!input.useEnv && !input.token && !input.tokenFile) {
        return "Instagram requires a page access token or --token-file (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "instagram",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({ cfg: namedConfig, channelKey: "instagram" })
          : namedConfig;
      const patch = input.useEnv
        ? {}
        : input.tokenFile
          ? { tokenFile: input.tokenFile }
          : input.token
            ? { pageAccessToken: input.token }
            : {};
      return applySetupAccountConfigPatch({ cfg: next, channelKey: "instagram", accountId, patch });
    },
  },
  pairing: {
    idLabel: "instagramIgsid",
    normalizeAllowEntry: (entry) => entry.replace(/^(instagram|ig|insta):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveInstagramAccount({ cfg });
      if (!account.token) throw new Error("Instagram page access token not configured");
      await sendMessageInstagram(id, PAIRING_APPROVED_MESSAGE, { token: account.token });
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: chunkTextForOutbound,
    chunkerMode: "text",
    textChunkLimit: 1000,
    sendPayload: async (ctx) =>
      await sendPayloadWithChunkedTextAndMedia({
        ctx,
        textChunkLimit: instagramPlugin.outbound!.textChunkLimit,
        chunker: instagramPlugin.outbound!.chunker,
        sendText: (nextCtx) => instagramPlugin.outbound!.sendText!(nextCtx),
        sendMedia: (nextCtx) => instagramPlugin.outbound!.sendMedia!(nextCtx),
        emptyResult: { channel: "instagram", messageId: "" },
      }),
    sendText: async ({ to, text, accountId, cfg }) => {
      const result = await sendMessageInstagram(to, text, {
        accountId: accountId ?? undefined,
        cfg,
      });
      return buildChannelSendResult("instagram", result);
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      const result = await sendMessageInstagram(to, text, {
        accountId: accountId ?? undefined,
        mediaUrl,
        cfg,
      });
      return buildChannelSendResult("instagram", result);
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
    collectStatusIssues: collectInstagramStatusIssues,
    buildChannelSummary: ({ snapshot }) => buildTokenChannelStatusSummary(snapshot),
    probeAccount: async ({ account, timeoutMs }) =>
      probeInstagram(account.token, timeoutMs, resolveInstagramProxyFetch(account.config.proxy)),
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
      let accountLabel = "";
      const fetcher = resolveInstagramProxyFetch(account.config.proxy);
      try {
        const probe = await probeInstagram(token, 2500, fetcher, account.config.apiVersion);
        const name = probe.ok ? (probe.account?.username ?? probe.account?.name)?.trim() : null;
        if (name) accountLabel = ` (@${name})`;
        if (!probe.ok) {
          ctx.log?.warn?.(
            `[${account.accountId}] Instagram probe failed (${String(probe.elapsedMs)}ms): ${probe.error}`,
          );
        }
        ctx.setStatus({ accountId: account.accountId, bot: probe.account });
      } catch (err) {
        ctx.log?.warn?.(
          `[${account.accountId}] Instagram probe threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
        );
      }
      const statusSink = createAccountStatusSink({
        accountId: ctx.accountId,
        setStatus: ctx.setStatus,
      });
      const appSecret = account.appSecret;
      const webhookVerifyToken =
        normalizeSecretInputString(account.config.webhookVerifyToken) ?? "";

      ctx.log?.info(
        `[${account.accountId}] starting Instagram provider${accountLabel} mode=webhook`,
      );
      const { monitorInstagramProvider } = await import("./monitor.js");
      return monitorInstagramProvider({
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
