import { Type } from "@sinclair/typebox";
import type { BizPilotPluginConfig } from "./supabase.js";

export function createEscalateTool(pluginConfig: BizPilotPluginConfig) {
  const adminChannel =
    pluginConfig.adminNotifyChannel ?? process.env.BIZPILOT_ADMIN_NOTIFY_CHANNEL ?? "";
  const adminTarget =
    pluginConfig.adminNotifyTarget ?? process.env.BIZPILOT_ADMIN_NOTIFY_TARGET ?? "";

  return {
    name: "escalate",
    label: "Escalate to Human",
    description:
      "Alert the business admin about an issue that requires human attention. Use this when you cannot resolve a customer's request, when a complaint is serious, or when a customer explicitly asks to speak with a human.",
    parameters: Type.Object({
      reason: Type.String({ description: "Why this conversation needs human attention." }),
      customerInfo: Type.Object(
        {
          name: Type.Optional(Type.String()),
          phone: Type.Optional(Type.String()),
          channelUserId: Type.Optional(Type.String()),
          channel: Type.Optional(Type.String()),
        },
        { description: "Known customer details." },
      ),
      urgency: Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
        description: "Urgency level of the escalation.",
      }),
      conversationSummary: Type.String({
        description: "Brief summary of the conversation so far.",
      }),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const reason = String(params.reason ?? "").trim();
      const urgency = String((params as { urgency?: string }).urgency ?? "medium");
      const conversationSummary = String(params.conversationSummary ?? "").trim();
      const customerInfo = (params.customerInfo ?? {}) as Record<string, unknown>;

      if (!reason) {
        throw new Error("reason is required");
      }

      const urgencyEmoji = urgency === "high" ? "🔴" : urgency === "medium" ? "🟡" : "🟢";

      const alertLines = [
        `${urgencyEmoji} ESCALATION (${urgency.toUpperCase()})`,
        "",
        `Reason: ${reason}`,
        "",
        "Customer:",
        customerInfo.name ? `  Name: ${String(customerInfo.name)}` : null,
        customerInfo.phone ? `  Phone: ${String(customerInfo.phone)}` : null,
        customerInfo.channel ? `  Channel: ${String(customerInfo.channel)}` : null,
        customerInfo.channelUserId ? `  ID: ${String(customerInfo.channelUserId)}` : null,
        "",
        `Summary: ${conversationSummary}`,
      ]
        .filter((line) => line !== null)
        .join("\n");

      const result = {
        notified: Boolean(adminChannel && adminTarget),
        alertMessage: alertLines,
        adminChannel: adminChannel || null,
        adminTarget: adminTarget || null,
        instruction:
          adminChannel && adminTarget
            ? `Send this alert to ${adminChannel}:${adminTarget}`
            : "No admin notification channel configured. Please inform the customer that their request has been noted and a human will follow up.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
