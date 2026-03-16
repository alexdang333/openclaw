import { createPluginRuntimeStore } from "openclaw/plugin-sdk/compat";
import type { PluginRuntime } from "openclaw/plugin-sdk/facebook";

const { setRuntime: setFacebookRuntime, getRuntime: getFacebookRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Facebook runtime not initialized");
export { getFacebookRuntime, setFacebookRuntime };
