import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { createAccountListHelpers, type OpenClawConfig } from "openclaw/plugin-sdk/instagram";
import { resolveInstagramAppSecret, resolveInstagramToken } from "./token.js";
import type { InstagramAccountConfig, InstagramConfig, ResolvedInstagramAccount } from "./types.js";

export type { ResolvedInstagramAccount };

const {
  listAccountIds: listInstagramAccountIds,
  resolveDefaultAccountId: resolveDefaultInstagramAccountId,
} = createAccountListHelpers("instagram");
export { listInstagramAccountIds, resolveDefaultInstagramAccountId };

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): InstagramAccountConfig | undefined {
  const accounts = (cfg.channels?.instagram as InstagramConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId] as InstagramAccountConfig | undefined;
}

function mergeInstagramAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): InstagramAccountConfig {
  const raw = (cfg.channels?.instagram ?? {}) as InstagramConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveInstagramAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  allowUnresolvedSecretRef?: boolean;
}): ResolvedInstagramAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.instagram as InstagramConfig | undefined)?.enabled !== false;
  const merged = mergeInstagramAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const tokenResolution = resolveInstagramToken(
    params.cfg.channels?.instagram as InstagramConfig | undefined,
    accountId,
    { allowUnresolvedSecretRef: params.allowUnresolvedSecretRef },
  );
  const appSecret = resolveInstagramAppSecret(
    params.cfg.channels?.instagram as InstagramConfig | undefined,
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

export function listEnabledInstagramAccounts(cfg: OpenClawConfig): ResolvedInstagramAccount[] {
  return listInstagramAccountIds(cfg)
    .map((accountId) => resolveInstagramAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
