import type { GroupPolicy, SenderGroupAccessDecision } from "openclaw/plugin-sdk/instagram";
import {
  evaluateSenderGroupAccess,
  isNormalizedSenderAllowed,
  resolveOpenProviderRuntimeGroupPolicy,
} from "openclaw/plugin-sdk/instagram";

const INSTAGRAM_ALLOW_FROM_PREFIX_RE = /^(instagram|ig|insta):/i;

export function isInstagramSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  return isNormalizedSenderAllowed({
    senderId,
    allowFrom,
    stripPrefixRe: INSTAGRAM_ALLOW_FROM_PREFIX_RE,
  });
}

export function resolveInstagramRuntimeGroupPolicy(params: {
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

export function evaluateInstagramGroupAccess(params: {
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
    isSenderAllowed: isInstagramSenderAllowed,
  });
}
