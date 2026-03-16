import type { OpenClawPluginApi } from "openclaw/plugin-sdk/instagram";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/instagram";
import { instagramDock, instagramPlugin } from "./src/channel.js";
import { setInstagramRuntime } from "./src/runtime.js";

const plugin = {
  id: "instagram",
  name: "Instagram DM",
  description: "Instagram Direct Messages channel plugin (Graph API)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setInstagramRuntime(api.runtime);
    api.registerChannel({ plugin: instagramPlugin, dock: instagramDock });
  },
};

export default plugin;
