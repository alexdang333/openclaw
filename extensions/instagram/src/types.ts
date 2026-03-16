import type { SecretInput } from "openclaw/plugin-sdk/instagram";

export type InstagramAccountConfig = {
  /** Optional display name for this account (used in CLI/UI lists). */
  name?: string;
  /** If false, do not start this Instagram account. Default: true. */
  enabled?: boolean;
  /** Instagram Page access token (from linked Facebook Page). */
  pageAccessToken?: SecretInput;
  /** Path to file containing the page access token. */
  tokenFile?: string;
  /** Facebook App secret for webhook signature verification. */
  appSecret?: SecretInput;
  /** Webhook URL for receiving updates (HTTPS required). */
  webhookUrl?: string;
  /** Webhook verify token for hub.challenge verification. */
  webhookVerifyToken?: SecretInput;
  /** Webhook path for the gateway HTTP server. */
  webhookPath?: string;
  /** Direct message access policy (default: pairing). */
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  /** Allowlist for DM senders (Instagram-Scoped IDs). */
  allowFrom?: Array<string | number>;
  /** Max inbound media size in MB. */
  mediaMaxMb?: number;
  /** Proxy URL for API requests. */
  proxy?: string;
  /** Outbound response prefix override for this channel/account. */
  responsePrefix?: string;
  /** Graph API version (default: "v21.0"). */
  apiVersion?: string;
};

export type InstagramConfig = {
  /** Optional per-account Instagram configuration (multi-account). */
  accounts?: Record<string, InstagramAccountConfig>;
  /** Default account ID when multiple accounts are configured. */
  defaultAccount?: string;
} & InstagramAccountConfig;

export type InstagramTokenSource = "env" | "config" | "configFile" | "none";

export type ResolvedInstagramAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  token: string;
  tokenSource: InstagramTokenSource;
  appSecret: string;
  config: InstagramAccountConfig;
};
