import { createPluginRuntimeStore } from "openclaw/plugin-sdk/compat";
import type { PluginRuntime } from "openclaw/plugin-sdk/instagram";

const { setRuntime: setInstagramRuntime, getRuntime: getInstagramRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Instagram runtime not initialized");
export { getInstagramRuntime, setInstagramRuntime };
