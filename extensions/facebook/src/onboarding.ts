import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  OpenClawConfig,
  SecretInput,
  WizardPrompter,
} from "openclaw/plugin-sdk/facebook";
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
} from "openclaw/plugin-sdk/facebook";
import {
  listFacebookAccountIds,
  resolveDefaultFacebookAccountId,
  resolveFacebookAccount,
} from "./accounts.js";

const channel = "facebook" as const;

function setFacebookDmPolicy(
  cfg: OpenClawConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
) {
  return setTopLevelChannelDmPolicyWithAllowFrom({
    cfg,
    channel: "facebook",
    dmPolicy,
  }) as OpenClawConfig;
}

async function noteFacebookTokenHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Go to https://developers.facebook.com/apps",
      "2) Create or select your app",
      "3) Add Messenger product to your app",
      "4) Generate a Page Access Token for your page",
      "5) For long-lived tokens, exchange via the Graph API",
      "Tip: you can also set FACEBOOK_PAGE_ACCESS_TOKEN in your env.",
    ].join("\n"),
    "Facebook Page Access Token",
  );
}

async function promptFacebookAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<OpenClawConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveFacebookAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const entry = await prompter.text({
    message: "Facebook allowFrom (PSID)",
    placeholder: "123456789012345",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "Required";
      }
      if (!/^\d+$/.test(raw)) {
        return "Use a numeric Facebook PSID (Page-Scoped ID)";
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
        facebook: {
          ...cfg.channels?.facebook,
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
      facebook: {
        ...cfg.channels?.facebook,
        enabled: true,
        accounts: {
          ...cfg.channels?.facebook?.accounts,
          [accountId]: {
            ...cfg.channels?.facebook?.accounts?.[accountId],
            enabled: cfg.channels?.facebook?.accounts?.[accountId]?.enabled ?? true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    },
  } as OpenClawConfig;
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Facebook",
  channel,
  policyKey: "channels.facebook.dmPolicy",
  allowFromKey: "channels.facebook.allowFrom",
  getCurrent: (cfg) => (cfg.channels?.facebook?.dmPolicy ?? "pairing") as "pairing",
  setPolicy: (cfg, policy) => setFacebookDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? (normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID)
        : resolveDefaultFacebookAccountId(cfg);
    return promptFacebookAllowFrom({
      cfg: cfg,
      prompter,
      accountId: id,
    });
  },
};

export const facebookOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const configured = listFacebookAccountIds(cfg).some((accountId) => {
      const account = resolveFacebookAccount({
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
      statusLines: [`Facebook: ${configured ? "configured" : "needs page access token"}`],
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
    const defaultFacebookAccountId = resolveDefaultFacebookAccountId(cfg);
    const facebookAccountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Facebook",
      accountOverride: accountOverrides.facebook,
      shouldPromptAccountIds,
      listAccountIds: listFacebookAccountIds,
      defaultAccountId: defaultFacebookAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveFacebookAccount({
      cfg: next,
      accountId: facebookAccountId,
      allowUnresolvedSecretRef: true,
    });
    const accountConfigured = Boolean(resolvedAccount.token);
    const allowEnv = facebookAccountId === DEFAULT_ACCOUNT_ID;
    const hasConfigToken = Boolean(
      hasConfiguredSecretInput(resolvedAccount.config.pageAccessToken) ||
      resolvedAccount.config.tokenFile,
    );

    // Step 1: Page access token
    const tokenStep = await runSingleChannelSecretStep({
      cfg: next,
      prompter,
      providerHint: "facebook",
      credentialLabel: "page access token",
      accountConfigured,
      hasConfigToken,
      allowEnv,
      envValue: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
      envPrompt: "FACEBOOK_PAGE_ACCESS_TOKEN detected. Use env var?",
      keepPrompt: "Facebook token already configured. Keep it?",
      inputPrompt: "Enter Facebook Page Access Token",
      preferredEnvVar: "FACEBOOK_PAGE_ACCESS_TOKEN",
      onMissingConfigured: async () => await noteFacebookTokenHelp(prompter),
      applyUseEnv: async (cfg) =>
        facebookAccountId === DEFAULT_ACCOUNT_ID
          ? ({
              ...cfg,
              channels: {
                ...cfg.channels,
                facebook: {
                  ...cfg.channels?.facebook,
                  enabled: true,
                },
              },
            } as OpenClawConfig)
          : cfg,
      applySet: async (cfg, value) =>
        facebookAccountId === DEFAULT_ACCOUNT_ID
          ? ({
              ...cfg,
              channels: {
                ...cfg.channels,
                facebook: {
                  ...cfg.channels?.facebook,
                  enabled: true,
                  pageAccessToken: value,
                },
              },
            } as OpenClawConfig)
          : ({
              ...cfg,
              channels: {
                ...cfg.channels,
                facebook: {
                  ...cfg.channels?.facebook,
                  enabled: true,
                  accounts: {
                    ...cfg.channels?.facebook?.accounts,
                    [facebookAccountId]: {
                      ...cfg.channels?.facebook?.accounts?.[facebookAccountId],
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
      providerHint: "facebook-app",
      credentialLabel: "app secret",
      ...buildSingleChannelSecretPromptState({
        accountConfigured: hasConfiguredSecretInput(resolvedAccount.config.appSecret),
        hasConfigToken: hasConfiguredSecretInput(resolvedAccount.config.appSecret),
        allowEnv: facebookAccountId === DEFAULT_ACCOUNT_ID,
      }),
      envPrompt: "FACEBOOK_APP_SECRET detected. Use env var?",
      keepPrompt: "Facebook app secret already configured. Keep it?",
      inputPrompt: "Enter Facebook App Secret (for webhook verification)",
      preferredEnvVar: "FACEBOOK_APP_SECRET",
    });
    if (appSecretStep.action === "set" && appSecretStep.value) {
      if (facebookAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            facebook: {
              ...next.channels?.facebook,
              appSecret: appSecretStep.value,
            },
          },
        } as OpenClawConfig;
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            facebook: {
              ...next.channels?.facebook,
              accounts: {
                ...next.channels?.facebook?.accounts,
                [facebookAccountId]: {
                  ...next.channels?.facebook?.accounts?.[facebookAccountId],
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
      providerHint: "facebook-webhook",
      credentialLabel: "webhook verify token",
      ...buildSingleChannelSecretPromptState({
        accountConfigured: hasConfiguredSecretInput(resolvedAccount.config.webhookVerifyToken),
        hasConfigToken: hasConfiguredSecretInput(resolvedAccount.config.webhookVerifyToken),
        allowEnv: false,
      }),
      envPrompt: "",
      keepPrompt: "Facebook webhook verify token already configured. Keep it?",
      inputPrompt:
        "Enter webhook verify token (you choose this — Facebook will send it back during verification)",
      preferredEnvVar: "FACEBOOK_VERIFY_TOKEN",
    });
    if (verifyTokenStep.action === "set" && verifyTokenStep.value) {
      if (facebookAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            facebook: {
              ...next.channels?.facebook,
              webhookVerifyToken: verifyTokenStep.value,
            },
          },
        } as OpenClawConfig;
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            facebook: {
              ...next.channels?.facebook,
              accounts: {
                ...next.channels?.facebook?.accounts,
                [facebookAccountId]: {
                  ...next.channels?.facebook?.accounts?.[facebookAccountId],
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
        initialValue: resolvedAccount.config.webhookPath ?? "/facebook-webhook",
      }),
    ).trim();
    if (facebookAccountId === DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          facebook: {
            ...next.channels?.facebook,
            webhookPath: webhookPath || undefined,
          },
        },
      } as OpenClawConfig;
    } else {
      next = {
        ...next,
        channels: {
          ...next.channels,
          facebook: {
            ...next.channels?.facebook,
            accounts: {
              ...next.channels?.facebook?.accounts,
              [facebookAccountId]: {
                ...next.channels?.facebook?.accounts?.[facebookAccountId],
                webhookPath: webhookPath || undefined,
              },
            },
          },
        },
      } as OpenClawConfig;
    }

    if (forceAllowFrom) {
      next = await promptFacebookAllowFrom({
        cfg: next,
        prompter,
        accountId: facebookAccountId,
      });
    }

    return { cfg: next, accountId: facebookAccountId };
  },
};
