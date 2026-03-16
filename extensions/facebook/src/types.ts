import type { SecretInput } from "openclaw/plugin-sdk/facebook";

export type FacebookAccountConfig = {
  /** Optional display name for this account (used in CLI/UI lists). */
  name?: string;
  /** If false, do not start this Facebook account. Default: true. */
  enabled?: boolean;
  /** Facebook Page access token (long-lived). */
  pageAccessToken?: SecretInput;
  /** Path to file containing the page access token. */
  tokenFile?: string;
  /** Facebook App secret for webhook signature verification. */
  appSecret?: SecretInput;
  /** Webhook URL for receiving updates (HTTPS required). */
  webhookUrl?: string;
  /** Webhook verify token for hub.challenge verification. */
  webhookVerifyToken?: SecretInput;
  /** Webhook path for the gateway HTTP server (defaults to webhook URL path). */
  webhookPath?: string;
  /** Direct message access policy (default: pairing). */
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  /** Allowlist for DM senders (Facebook PSIDs). */
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

export type FacebookConfig = {
  /** Optional per-account Facebook configuration (multi-account). */
  accounts?: Record<string, FacebookAccountConfig>;
  /** Default account ID when multiple accounts are configured. */
  defaultAccount?: string;
} & FacebookAccountConfig;

export type FacebookTokenSource = "env" | "config" | "configFile" | "none";

export type ResolvedFacebookAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  token: string;
  tokenSource: FacebookTokenSource;
  appSecret: string;
  config: FacebookAccountConfig;
};
