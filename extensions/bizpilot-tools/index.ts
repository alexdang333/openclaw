import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createEscalateTool } from "./src/escalate.js";
import { createProductSearchTool } from "./src/product-search.js";
import { createSaveLeadTool } from "./src/save-lead.js";
import type { BizPilotPluginConfig } from "./src/supabase.js";

export default function register(api: OpenClawPluginApi) {
  const pluginConfig = (api.pluginConfig ?? {}) as BizPilotPluginConfig;

  // product-search: needs agentId for tenant resolution
  api.registerTool(
    ((ctx) => {
      const tool = createProductSearchTool(pluginConfig);
      const originalExecute = tool.execute;
      return {
        ...tool,
        async execute(id: string, params: Record<string, unknown>) {
          return originalExecute(id, params, {
            agentId: ctx?.agentId,
          });
        },
      };
    }) as unknown as AnyAgentTool,
    { optional: true },
  );

  // save-lead: needs agentId + requesterSenderId + messageChannel
  api.registerTool(
    ((ctx) => {
      const tool = createSaveLeadTool(pluginConfig);
      const originalExecute = tool.execute;
      return {
        ...tool,
        async execute(id: string, params: Record<string, unknown>) {
          return originalExecute(id, params, {
            agentId: ctx?.agentId,
            requesterSenderId: ctx?.requesterSenderId,
            messageChannel: ctx?.messageChannel,
          });
        },
      };
    }) as unknown as AnyAgentTool,
    { optional: true },
  );

  // escalate: stateless (no Supabase needed)
  api.registerTool(createEscalateTool(pluginConfig) as unknown as AnyAgentTool, { optional: true });
}
