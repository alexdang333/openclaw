import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BizPilotPluginConfig = {
  supabaseUrl?: string;
  supabaseKey?: string;
  adminNotifyChannel?: string;
  adminNotifyTarget?: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedUrl = "";
let cachedKey = "";

export function getSupabaseClient(config: BizPilotPluginConfig): SupabaseClient {
  const url = config.supabaseUrl ?? process.env.SUPABASE_URL ?? "";
  const key = config.supabaseKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "BizPilot: supabaseUrl and supabaseKey are required (config or env SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  if (cachedClient && cachedUrl === url && cachedKey === key) {
    return cachedClient;
  }
  cachedClient = createClient(url, key);
  cachedUrl = url;
  cachedKey = key;
  return cachedClient;
}

export async function resolveTenantId(client: SupabaseClient, agentId: string): Promise<string> {
  const { data, error } = await client
    .from("tenants")
    .select("id")
    .eq("agent_id", agentId)
    .single();
  if (error || !data?.id) {
    throw new Error(
      `BizPilot: tenant not found for agent_id="${agentId}". Ensure tenant is registered in Supabase.`,
    );
  }
  return data.id as string;
}
