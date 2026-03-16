import type { OpenClawPluginApi } from "openclaw/plugin-sdk/facebook";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/facebook";
import { facebookDock, facebookPlugin } from "./src/channel.js";
import { setFacebookRuntime } from "./src/runtime.js";

const plugin = {
  id: "facebook",
  name: "Facebook Messenger",
  description: "Facebook Messenger channel plugin (Graph API)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setFacebookRuntime(api.runtime);
    api.registerChannel({ plugin: facebookPlugin, dock: facebookDock });
  },
};

export default plugin;
