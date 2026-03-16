import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  SecretInput,
  WizardPrompter,
} from "openclaw/plugin-sdk/instagram";
import {
  buildSingleChannelSecretPromptState,
  DEFAULT_ACCOUNT_ID,
  hasConfiguredSecretInput,
  mergeAllowFromEntries,
  normalizeAccountId,
  promptSingleChannelSecretInput,
  runSingleChannelSecretStep,
  resolveAccountIdForConfigure,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "openclaw/plugin-sdk/instagram";
import {
  listInstagramAccountIds,
  resolveDefaultInstagramAccountId,
  resolveInstagramAccount,
} from "./accounts.js";

const channel = "instagram" as const;

function setInstagramDmPolicy(
  cfg: OpenClawConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
) {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel: "instagram",
    dmPolicy,
  }) as OpenClawConfig;
}

async function noteInstagramTokenHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Go to https://developers.facebook.com/apps",
      "2) Create or select your app",
      "3) Add Instagram product to your app",
      "4) Connect your Instagram Professional account",
      "5) Generate a Page Access Token with instagram_basic + instagram_manage_messages",
      "Tip: you can also set INSTAGRAM_PAGE_ACCESS_TOKEN in your env.",
    ].join("\n"),
    "Instagram Page Access Token",
  );
}

async function promptInstagramAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveInstagramAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const entry = await prompter.text({
    message: "Instagram allowFrom (IGSID)",
    placeholder: "123456789012345",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "Required";
      }
      if (!/^\d+$/.test(raw)) {
        return "Use a numeric Instagram-Scoped ID (IGSID)";
      }
      return undefined;
    },
  });
  const normalized = String(entry).trim();
  const unique = mergeAllowFromEntries(existingAllowFrom, [normalized]);

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        instagram: {
          ...cfg.channels?.instagram,
          enabled: true,
          dmPolicy: "allowlist",
          allowFrom: unique,
        },
      },
    } as OpenClawConfig;
  }

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      instagram: {
        ...cfg.channels?.instagram,
        enabled: true,
        accounts: {
          ...cfg.channels?.instagram?.accounts,
          [accountId]: {
            ...cfg.channels?.instagram?.accounts?.[accountId],
            enabled: cfg.channels?.instagram?.accounts?.[accountId]?.enabled ?? true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    },
  } as OpenClawConfig;
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Instagram",
  channel,
  policyKey: "channels.instagram.dmPolicy",
  allowFromKey: "channels.instagram.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.instagram?.dmPolicy ?? "pairing") as "pairing",
  setPolicy: (cfg, policy) => setInstagramDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? (normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID)
        : resolveDefaultInstagramAccountId(cfg);
    return promptInstagramAllowFrom({
      cfg: cfg,
      prompter,
      accountId: id,
    });
  },
};

export const instagramOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const configured = listInstagramAccountIds(cfg).some((accountId) => {
      const account = resolveInstagramAccount({
        cfg: cfg,
        accountId,
        allowUnresolvedSecretRef: true,
      });
      return (
        Boolean(account.token) ||
        hasConfiguredSecretInput(account.config.pageAccessToken) ||
        Boolean(account.config.tokenFile?.trim())
      );
    });
    return {
      channel,
      configured,
      statusLines: [`Instagram: ${configured ? "configured" : "needs page access token"}`],
      selectionHint: configured ? "recommended · configured" : "recommended",
      quickstartScore: configured ? 1 : 10,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const defaultInstagramAccountId = resolveDefaultInstagramAccountId(cfg);
    const instagramAccountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Instagram",
      accountOverride: accountOverrides.instagram,
      shouldPromptAccountIds,
      listAccountIds: listInstagramAccountIds,
      defaultAccountId: defaultInstagramAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveInstagramAccount({
      cfg: next,
      accountId: instagramAccountId,
      allowUnresolvedSecretRef: true,
    });
    const accountConfigured = Boolean(resolvedAccount.token);
    const allowEnv = instagramAccountId === DEFAULT_ACCOUNT_ID;
    const hasConfigToken = Boolean(
      hasConfiguredSecretInput(resolvedAccount.config.pageAccessToken) ||
      resolvedAccount.config.tokenFile,
    );

    // Step 1: Page access token
    const tokenStep = await runSingleChannelSecretStep({
      cfg: next,
      prompter,
      providerHint: "instagram",
      credentialLabel: "page access token",
      accountConfigured,
      hasConfigToken,
      allowEnv,
      envValue: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN,
      envPrompt: "INSTAGRAM_PAGE_ACCESS_TOKEN detected. Use env var?",
      keepPrompt: "Instagram token already configured. Keep it?",
      inputPrompt: "Enter Instagram Page Access Token",
      preferredEnvVar: "INSTAGRAM_PAGE_ACCESS_TOKEN",
      onMissingConfigured: async () => await noteInstagramTokenHelp(prompter),
      applyUseEnv: async (cfg) =>
        instagramAccountId === DEFAULT_ACCOUNT_ID
          ? ({
              ...cfg,
              channels: {
                ...cfg.channels,
                instagram: {
                  ...cfg.channels?.instagram,
                  enabled: true,
                },
              },
            } as OpenClawConfig)
          : cfg,
      applySet: async (cfg, value) =>
        instagramAccountId === DEFAULT_ACCOUNT_ID
          ? ({
              ...cfg,
              channels: {
                ...cfg.channels,
                instagram: {
                  ...cfg.channels?.instagram,
                  enabled: true,
                  pageAccessToken: value,
                },
              },
            } as OpenClawConfig)
          : ({
              ...cfg,
              channels: {
                ...cfg.channels,
                instagram: {
                  ...cfg.channels?.instagram,
                  enabled: true,
                  accounts: {
                    ...cfg.channels?.instagram?.accounts,
                    [instagramAccountId]: {
                      ...cfg.channels?.instagram?.accounts?.[instagramAccountId],
                      enabled: true,
                      pageAccessToken: value,
                    },
                  },
                },
              },
            } as OpenClawConfig),
    });
    next = tokenStep.cfg;

    // Step 2: App secret (required for webhook HMAC verification)
    const appSecretStep = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "instagram-app",
      credentialLabel: "app secret",
      ...buildSingleChannelSecretPromptState({
        accountConfigured: hasConfiguredSecretInput(resolvedAccount.config.appSecret),
        hasConfigToken: hasConfiguredSecretInput(resolvedAccount.config.appSecret),
        allowEnv: instagramAccountId === DEFAULT_ACCOUNT_ID,
      }),
      envPrompt: "FACEBOOK_APP_SECRET detected. Use env var?",
      keepPrompt: "Instagram app secret already configured. Keep it?",
      inputPrompt: "Enter App Secret (for webhook verification — same as your Facebook App Secret)",
      preferredEnvVar: "FACEBOOK_APP_SECRET",
    });
    if (appSecretStep.action === "set" && appSecretStep.value) {
      if (instagramAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            instagram: {
              ...next.channels?.instagram,
              appSecret: appSecretStep.value,
            },
          },
        } as OpenClawConfig;
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            instagram: {
              ...next.channels?.instagram,
              accounts: {
                ...next.channels?.instagram?.accounts,
                [instagramAccountId]: {
                  ...next.channels?.instagram?.accounts?.[instagramAccountId],
                  appSecret: appSecretStep.value,
                },
              },
            },
          },
        } as OpenClawConfig;
      }
    }

    // Step 3: Webhook verify token
    const verifyTokenStep = await promptSingleChannelSecretInput({
      cfg: next,
      prompter,
      providerHint: "instagram-webhook",
      credentialLabel: "webhook verify token",
      ...buildSingleChannelSecretPromptState({
        accountConfigured: hasConfiguredSecretInput(resolvedAccount.config.webhookVerifyToken),
        hasConfigToken: hasConfiguredSecretInput(resolvedAccount.config.webhookVerifyToken),
        allowEnv: false,
      }),
      envPrompt: "",
      keepPrompt: "Instagram webhook verify token already configured. Keep it?",
      inputPrompt:
        "Enter webhook verify token (you choose this — Instagram will send it back during verification)",
      preferredEnvVar: "INSTAGRAM_VERIFY_TOKEN",
    });
    if (verifyTokenStep.action === "set" && verifyTokenStep.value) {
      if (instagramAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            instagram: {
              ...next.channels?.instagram,
              webhookVerifyToken: verifyTokenStep.value,
            },
          },
        } as OpenClawConfig;
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            instagram: {
              ...next.channels?.instagram,
              accounts: {
                ...next.channels?.instagram?.accounts,
                [instagramAccountId]: {
                  ...next.channels?.instagram?.accounts?.[instagramAccountId],
                  webhookVerifyToken: verifyTokenStep.value,
                },
              },
            },
          },
        } as OpenClawConfig;
      }
    }

    // Step 4: Webhook path
    const webhookPath = String(
      await prompter.text({
        message: "Webhook path",
        initialValue: resolvedAccount.config.webhookPath ?? "/instagram-webhook",
      }),
    ).trim();
    if (instagramAccountId === DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          instagram: {
            ...next.channels?.instagram,
            webhookPath: webhookPath || undefined,
          },
        },
      } as OpenClawConfig;
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          instagram: {
            ...next.channels?.instagram,
            accounts: {
              ...next.channels?.instagram?.accounts,
              [instagramAccountId]: {
                ...next.channels?.instagram?.accounts?.[instagramAccountId],
                webhookPath: webhookPath || undefined,
              },
            },
          },
        },
      } as OpenClawConfig;
    }

    if (forceAllowFrom) {
      next = await promptInstagramAllowFrom({
        cfg: next,
        prompter,
        accountId: instagramAccountId,
      });
    }

    return { cfg: next, accountId: instagramAccountId };
  },
};
