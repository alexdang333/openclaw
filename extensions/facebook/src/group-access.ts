import type { GroupPolicy, SenderGroupAccessDecision } from "openclaw/plugin-sdk/facebook";
import {
  evaluateSenderGroupAccess,
  isNormalizedSenderAllowed,
  resolveOpenProviderRuntimeGroupPolicy,
} from "openclaw/plugin-sdk/facebook";

const FACEBOOK_ALLOW_FROM_PREFIX_RE = /^(facebook|fb|messenger):/i;

export function isFacebookSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  return isNormalizedSenderAllowed({
    senderId,
    allowFrom,
    stripPrefixRe: FACEBOOK_ALLOW_FROM_PREFIX_RE,
  });
}

export function resolveFacebookRuntimeGroupPolicy(params: {
  providerConfigPresent: boolean;
  groupPolicy?: GroupPolicy;
  defaultGroupPolicy?: GroupPolicy;
}): {
  groupPolicy: GroupPolicy;
  providerMissingFallbackApplied: boolean;
} {
  return resolveOpenProviderRuntimeGroupPolicy({
    providerConfigPresent: params.providerConfigPresent,
    groupPolicy: params.groupPolicy,
    defaultGroupPolicy: params.defaultGroupPolicy,
  });
}

export function evaluateFacebookGroupAccess(params: {
  providerConfigPresent: boolean;
  configuredGroupPolicy?: GroupPolicy;
  defaultGroupPolicy?: GroupPolicy;
  groupAllowFrom: string[];
  senderId: string;
}): SenderGroupAccessDecision {
  return evaluateSenderGroupAccess({
    providerConfigPresent: params.providerConfigPresent,
    configuredGroupPolicy: params.configuredGroupPolicy,
    defaultGroupPolicy: params.defaultGroupPolicy,
    groupAllowFrom: params.groupAllowFrom,
    senderId: params.senderId,
    isSenderAllowed: isFacebookSenderAllowed,
  });
}
