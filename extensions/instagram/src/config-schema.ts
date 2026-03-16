import {
  AllowFromListSchema,
  buildCatchallMultiAccountChannelSchema,
  DmPolicySchema,
} from "openclaw/plugin-sdk/compat";
import { MarkdownConfigSchema } from "openclaw/plugin-sdk/instagram";
import { z } from "zod";
import { buildSecretInputSchema } from "./secret-input.js";

const instagramAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  markdown: MarkdownConfigSchema,
  pageAccessToken: buildSecretInputSchema().optional(),
  tokenFile: z.string().optional(),
  appSecret: buildSecretInputSchema().optional(),
  webhookUrl: z.string().optional(),
  webhookVerifyToken: buildSecretInputSchema().optional(),
  webhookPath: z.string().optional(),
  dmPolicy: DmPolicySchema.optional(),
  allowFrom: AllowFromListSchema,
  mediaMaxMb: z.number().optional(),
  proxy: z.string().optional(),
  responsePrefix: z.string().optional(),
  apiVersion: z.string().optional(),
});

export const InstagramConfigSchema = buildCatchallMultiAccountChannelSchema(instagramAccountSchema);
