import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { createAccountListHelpers, type OpenClawConfig } from "openclaw/plugin-sdk/facebook";
import { resolveFacebookAppSecret, resolveFacebookToken } from "./token.js";
import type { FacebookAccountConfig, FacebookConfig, ResolvedFacebookAccount } from "./types.js";

export type { ResolvedFacebookAccount };

const {
  listAccountIds: listFacebookAccountIds,
  resolveDefaultAccountId: resolveDefaultFacebookAccountId,
} = createAccountListHelpers("facebook");
export { listFacebookAccountIds, resolveDefaultFacebookAccountId };

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): FacebookAccountConfig | undefined {
  const accounts = (cfg.channels?.facebook as FacebookConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId] as FacebookAccountConfig | undefined;
}

function mergeFacebookAccountConfig(cfg: OpenClawConfig, accountId: string): FacebookAccountConfig {
  const raw = (cfg.channels?.facebook ?? {}) as FacebookConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveFacebookAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  allowUnresolvedSecretRef?: boolean;
}): ResolvedFacebookAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.facebook as FacebookConfig | undefined)?.enabled !== false;
  const merged = mergeFacebookAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const tokenResolution = resolveFacebookToken(
    params.cfg.channels?.facebook as FacebookConfig | undefined,
    accountId,
    { allowUnresolvedSecretRef: params.allowUnresolvedSecretRef },
  );
  const appSecret = resolveFacebookAppSecret(
    params.cfg.channels?.facebook as FacebookConfig | undefined,
    accountId,
    { allowUnresolvedSecretRef: params.allowUnresolvedSecretRef },
  );

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    token: tokenResolution.token,
    tokenSource: tokenResolution.source,
    appSecret,
    config: merged,
  };
}

export function listEnabledFacebookAccounts(cfg: OpenClawConfig): ResolvedFacebookAccount[] {
  return listFacebookAccountIds(cfg)
    .map((accountId) => resolveFacebookAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
