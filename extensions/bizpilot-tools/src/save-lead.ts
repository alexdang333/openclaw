import { Type } from "@sinclair/typebox";
import type { BizPilotPluginConfig } from "./supabase.js";
import { getSupabaseClient, resolveTenantId } from "./supabase.js";

export function createSaveLeadTool(pluginConfig: BizPilotPluginConfig) {
  return {
    name: "save-lead",
    label: "Save Lead",
    description:
      "Capture a potential customer's contact information during conversation. Use this when a customer shows interest in a product or service and provides contact details.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Customer's name." })),
      phone: Type.Optional(Type.String({ description: "Customer's phone number." })),
      email: Type.Optional(Type.String({ description: "Customer's email address." })),
      source: Type.String({
        description: "Channel where the lead came from (e.g. facebook, instagram, zalo, web).",
      }),
      interest: Type.String({
        description: "What product or service the customer is interested in.",
      }),
      conversationSummary: Type.String({
        description: "Brief AI-generated summary of the conversation context.",
      }),
    }),

    async execute(
      _id: string,
      params: Record<string, unknown>,
      ctx?: { agentId?: string; requesterSenderId?: string; messageChannel?: string },
    ) {
      const source = String(params.source ?? "").trim();
      const interest = String(params.interest ?? "").trim();
      const conversationSummary = String(params.conversationSummary ?? "").trim();
      if (!source || !interest) {
        throw new Error("source and interest are required");
      }

      const client = getSupabaseClient(pluginConfig);
      const agentId = ctx?.agentId;
      if (!agentId) {
        throw new Error("agentId is required to resolve tenant");
      }
      const tenantId = await resolveTenantId(client, agentId);

      const row = {
        tenant_id: tenantId,
        name: typeof params.name === "string" ? params.name.trim() || null : null,
        phone: typeof params.phone === "string" ? params.phone.trim() || null : null,
        email: typeof params.email === "string" ? params.email.trim() || null : null,
        source,
        channel_user_id: ctx?.requesterSenderId ?? null,
        interest,
        conversation_summary: conversationSummary || null,
        status: "new",
      };

      const { data, error } = await client.from("leads").insert(row).select("id, status").single();

      if (error) {
        throw new Error(`Failed to save lead: ${error.message}`);
      }

      const result = {
        leadId: data.id,
        status: data.status,
        message: "Lead captured successfully.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
