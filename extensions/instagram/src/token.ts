import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { tryReadSecretFileSync } from "openclaw/plugin-sdk/core";
import type { BaseTokenResolution } from "openclaw/plugin-sdk/instagram";
import { normalizeResolvedSecretInputString, normalizeSecretInputString } from "./secret-input.js";
import type { InstagramConfig } from "./types.js";

export type InstagramTokenResolution = BaseTokenResolution & {
  source: "env" | "config" | "configFile" | "none";
};

function readTokenFromFile(tokenFile: string | undefined): string {
  return tryReadSecretFileSync(tokenFile, "Instagram token file", { rejectSymlink: true }) ?? "";
}

export function resolveInstagramToken(
  config: InstagramConfig | undefined,
  accountId?: string | null,
  options?: { allowUnresolvedSecretRef?: boolean },
): InstagramTokenResolution {
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const isDefaultAccount = resolvedAccountId === DEFAULT_ACCOUNT_ID;
  const baseConfig = config;
  const resolveAccountConfig = (id: string): InstagramConfig | undefined => {
    const accounts = baseConfig?.accounts;
    if (!accounts || typeof accounts !== "object") {
      return undefined;
    }
    const direct = accounts[id] as InstagramConfig | undefined;
    if (direct) {
      return direct;
    }
    const normalized = normalizeAccountId(id);
    const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === normalized);
    return matchKey
      ? ((accounts as Record<string, InstagramConfig>)[matchKey] ?? undefined)
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
          path: `channels.instagram.accounts.${resolvedAccountId}.pageAccessToken`,
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
          path: "channels.instagram.pageAccessToken",
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
    const envToken = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim();
    if (envToken) {
      return { token: envToken, source: "env" };
    }
  }

  return { token: "", source: "none" };
}

export function resolveInstagramAppSecret(
  config: InstagramConfig | undefined,
  accountId?: string | null,
  options?: { allowUnresolvedSecretRef?: boolean },
): string {
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const isDefaultAccount = resolvedAccountId === DEFAULT_ACCOUNT_ID;

  const resolveAccountConfig = (id: string): InstagramConfig | undefined => {
    const accounts = config?.accounts;
    if (!accounts || typeof accounts !== "object") {
      return undefined;
    }
    return accounts[id] as InstagramConfig | undefined;
  };

  const accountConfig = resolveAccountConfig(resolvedAccountId);

  if (accountConfig?.appSecret) {
    const secret = options?.allowUnresolvedSecretRef
      ? normalizeSecretInputString(accountConfig.appSecret)
      : normalizeResolvedSecretInputString({
          value: accountConfig.appSecret,
          path: `channels.instagram.accounts.${resolvedAccountId}.appSecret`,
        });
    if (secret) return secret;
  }

  if (config?.appSecret) {
    const secret = options?.allowUnresolvedSecretRef
      ? normalizeSecretInputString(config.appSecret)
      : normalizeResolvedSecretInputString({
          value: config.appSecret,
          path: "channels.instagram.appSecret",
        });
    if (secret) return secret;
  }

  if (isDefaultAccount) {
    // Fall back to Facebook app secret since they share the same Facebook App
    const envSecret =
      process.env.INSTAGRAM_APP_SECRET?.trim() ?? process.env.FACEBOOK_APP_SECRET?.trim();
    if (envSecret) return envSecret;
  }

  return "";
}
