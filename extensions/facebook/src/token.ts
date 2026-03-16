import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { tryReadSecretFileSync } from "openclaw/plugin-sdk/core";
import type { BaseTokenResolution } from "openclaw/plugin-sdk/facebook";
import { normalizeResolvedSecretInputString, normalizeSecretInputString } from "./secret-input.js";
import type { FacebookConfig } from "./types.js";

export type FacebookTokenResolution = BaseTokenResolution & {
  source: "env" | "config" | "configFile" | "none";
};

function readTokenFromFile(tokenFile: string | undefined): string {
  return tryReadSecretFileSync(tokenFile, "Facebook token file", { rejectSymlink: true }) ?? "";
}

export function resolveFacebookToken(
  config: FacebookConfig | undefined,
  accountId?: string | null,
  options?: { allowUnresolvedSecretRef?: boolean },
): FacebookTokenResolution {
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const isDefaultAccount = resolvedAccountId === DEFAULT_ACCOUNT_ID;
  const baseConfig = config;
  const resolveAccountConfig = (id: string): FacebookConfig | undefined => {
    const accounts = baseConfig?.accounts;
    if (!accounts || typeof accounts !== "object") {
      return undefined;
    }
    const direct = accounts[id] as FacebookConfig | undefined;
    if (direct) {
      return direct;
    }
    const normalized = normalizeAccountId(id);
    const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === normalized);
    return matchKey
      ? ((accounts as Record<string, FacebookConfig>)[matchKey] ?? undefined)
      : undefined;
  };
  const accountConfig = resolveAccountConfig(resolvedAccountId);
  const accountHasToken = Boolean(
    accountConfig && Object.prototype.hasOwnProperty.call(accountConfig, "pageAccessToken"),
  );

  if (accountConfig && accountHasToken) {
    const token = options?.allowUnresolvedSecretRef
      ? normalizeSecretInputString(accountConfig.pageAccessToken)
      : normalizeResolvedSecretInputString({
          value: accountConfig.pageAccessToken,
          path: `channels.facebook.accounts.${resolvedAccountId}.pageAccessToken`,
        });
    if (token) {
      return { token, source: "config" };
    }
    const fileToken = readTokenFromFile(accountConfig.tokenFile);
    if (fileToken) {
      return { token: fileToken, source: "configFile" };
    }
  }

  if (!accountHasToken) {
    const fileToken = readTokenFromFile(accountConfig?.tokenFile);
    if (fileToken) {
      return { token: fileToken, source: "configFile" };
    }
  }

  if (!accountHasToken) {
    const token = options?.allowUnresolvedSecretRef
      ? normalizeSecretInputString(baseConfig?.pageAccessToken)
      : normalizeResolvedSecretInputString({
          value: baseConfig?.pageAccessToken,
          path: "channels.facebook.pageAccessToken",
        });
    if (token) {
      return { token, source: "config" };
    }
    const fileToken = readTokenFromFile(baseConfig?.tokenFile);
    if (fileToken) {
      return { token: fileToken, source: "configFile" };
    }
  }

  if (isDefaultAccount) {
    const envToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
    if (envToken) {
      return { token: envToken, source: "env" };
    }
  }

  return { token: "", source: "none" };
}

export function resolveFacebookAppSecret(
  config: FacebookConfig | undefined,
  accountId?: string | null,
  options?: { allowUnresolvedSecretRef?: boolean },
): string {
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const isDefaultAccount = resolvedAccountId === DEFAULT_ACCOUNT_ID;

  const resolveAccountConfig = (id: string): FacebookConfig | undefined => {
    const accounts = config?.accounts;
    if (!accounts || typeof accounts !== "object") {
      return undefined;
    }
    return accounts[id] as FacebookConfig | undefined;
  };

  const accountConfig = resolveAccountConfig(resolvedAccountId);

  // Account-level appSecret
  if (accountConfig?.appSecret) {
    const secret = options?.allowUnresolvedSecretRef
      ? normalizeSecretInputString(accountConfig.appSecret)
      : normalizeResolvedSecretInputString({
          value: accountConfig.appSecret,
          path: `channels.facebook.accounts.${resolvedAccountId}.appSecret`,
        });
    if (secret) return secret;
  }

  // Base-level appSecret
  if (config?.appSecret) {
    const secret = options?.allowUnresolvedSecretRef
      ? normalizeSecretInputString(config.appSecret)
      : normalizeResolvedSecretInputString({
          value: config.appSecret,
          path: "channels.facebook.appSecret",
        });
    if (secret) return secret;
  }

  // Env fallback (default account only)
  if (isDefaultAccount) {
    const envSecret = process.env.FACEBOOK_APP_SECRET?.trim();
    if (envSecret) return envSecret;
  }

  return "";
}
