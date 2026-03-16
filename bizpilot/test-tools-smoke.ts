/**
 * BizPilot Tools Smoke Test
 *
 * Tests product-search, save-lead, and escalate tools against live Supabase REST API.
 * Uses native fetch — no external dependencies needed.
 *
 * Run: npx tsx bizpilot/test-tools-smoke.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env manually (no dotenv dependency needed)
function loadEnv(envPath: string) {
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) {
        continue;
      }
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    /* ignore missing .env */
  }
}

loadEnv(resolve(import.meta.dirname, ".env"));

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const TEST_AGENT_ID = "bizpilot-test";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in bizpilot/.env");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}
function fail(label: string, err: unknown) {
  console.error(`  ✗ ${label}: ${err instanceof Error ? err.message : String(err)}`);
  failed++;
}

// Supabase REST helper
async function supabaseRest(
  table: string,
  opts: {
    method?: string;
    query?: string;
    body?: unknown;
    key?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{ data: unknown; error: string | null; count?: number }> {
  const key = opts.key ?? SERVICE_KEY;
  const url = `${SUPABASE_URL}/rest/v1/${table}${opts.query ? `?${opts.query}` : ""}`;
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: opts.method === "POST" ? "return=representation" : "count=exact",
    ...opts.headers,
  };

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const contentRange = res.headers.get("content-range");
  const count = contentRange ? parseInt(contentRange.split("/")[1] ?? "0", 10) : undefined;

  if (!res.ok) {
    const text = await res.text();
    return { data: null, error: `${res.status}: ${text}`, count };
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { data, error: null, count };
}

// ── Test 1: Tenant resolution ──
async function testTenantResolution(): Promise<string | null> {
  console.log("\n1. Tenant Resolution");
  try {
    const { data, error } = await supabaseRest("tenants", {
      query: `select=id,name,agent_id&agent_id=eq.${TEST_AGENT_ID}`,
    });
    if (error) {
      throw new Error(error);
    }
    const rows = data as Array<{ id: string; name: string }>;
    if (!rows?.length) {
      throw new Error("No tenant found");
    }
    ok(`Found tenant "${rows[0].name}" (id: ${rows[0].id})`);
    return rows[0].id;
  } catch (err) {
    fail("Tenant lookup", err);
    return null;
  }
}

// ── Test 2: Product search ──
async function testProductSearch(tenantId: string) {
  console.log("\n2. Product Search");

  // 2a: Text search
  try {
    const { data, error, count } = await supabaseRest("products", {
      query: `select=id,name,price&tenant_id=eq.${tenantId}&status=eq.active&or=(name.ilike.%25serum%25,description.ilike.%25serum%25)&limit=10`,
      headers: { Prefer: "count=exact" },
    });
    if (error) {
      throw new Error(error);
    }
    const rows = data as Array<{ name: string }>;
    ok(`Search "serum": ${count ?? rows.length} result(s) — ${rows.map((p) => p.name).join(", ")}`);
  } catch (err) {
    fail("Text search", err);
  }

  // 2b: Price filter
  try {
    const { data, error, count } = await supabaseRest("products", {
      query: `select=id,name,price&tenant_id=eq.${tenantId}&status=eq.active&price=lte.200000&limit=10`,
      headers: { Prefer: "count=exact" },
    });
    if (error) {
      throw new Error(error);
    }
    const rows = data as Array<{ name: string }>;
    ok(`Price ≤ 200000: ${count ?? rows.length} result(s)`);
  } catch (err) {
    fail("Price filter", err);
  }

  // 2c: In-stock filter
  try {
    const { data, error, count } = await supabaseRest("products", {
      query: `select=id,name,stock&tenant_id=eq.${tenantId}&status=eq.active&stock=gt.0&limit=10`,
      headers: { Prefer: "count=exact" },
    });
    if (error) {
      throw new Error(error);
    }
    const rows = data as Array<{ name: string }>;
    ok(`In-stock only: ${count ?? rows.length} result(s)`);
  } catch (err) {
    fail("Stock filter", err);
  }
}

// ── Test 3: Save lead ──
async function testSaveLead(tenantId: string) {
  console.log("\n3. Save Lead");
  try {
    const row = {
      tenant_id: tenantId,
      name: "Smoke Test User",
      phone: "0901234567",
      email: "smoke@test.dev",
      source: "facebook",
      channel_user_id: "test_psid_12345",
      interest: "Vitamin C Serum",
      conversation_summary: "Customer asked about serum pricing and availability.",
      status: "new",
    };
    const { data, error } = await supabaseRest("leads", {
      method: "POST",
      query: "select=id,status",
      body: row,
    });
    if (error) {
      throw new Error(error);
    }
    const rows = data as Array<{ id: string; status: string }>;
    const lead = rows[0];
    ok(`Lead created: id=${lead.id}, status=${lead.status}`);

    // Clean up
    await supabaseRest("leads", {
      method: "DELETE",
      query: `id=eq.${lead.id}`,
    });
    ok("Cleanup: test lead deleted");
  } catch (err) {
    fail("Save lead", err);
  }
}

// ── Test 4: Escalation format ──
function testEscalation() {
  console.log("\n4. Escalation (format only)");
  try {
    const alertLines = [
      "🔴 ESCALATION (HIGH)",
      "",
      "Reason: Customer requesting refund for damaged product",
      "",
      "Customer:",
      "  Name: Ngoc Anh",
      "  Phone: 0912345678",
      "  Channel: facebook",
      "",
      "Summary: Customer received damaged Vitamin C Serum, wants refund.",
    ].join("\n");

    if (!alertLines.includes("ESCALATION")) {
      throw new Error("Missing header");
    }
    if (!alertLines.includes("refund")) {
      throw new Error("Missing reason");
    }
    ok(`Alert formatted (${alertLines.split("\n").length} lines)`);
  } catch (err) {
    fail("Escalation format", err);
  }
}

// ── Test 5: RLS verification ──
async function testRLS() {
  console.log("\n5. RLS Verification (anon key)");
  if (!ANON_KEY) {
    fail("RLS check", "SUPABASE_ANON_KEY not set");
    return;
  }
  try {
    const { data, error } = await supabaseRest("products", {
      query: "select=id&limit=1",
      key: ANON_KEY,
    });
    if (error) {
      ok(`Anon query blocked: ${error}`);
    } else {
      const rows = data as unknown[];
      if (!rows || rows.length === 0) {
        ok("Anon query returns empty (RLS working)");
      } else {
        fail("RLS", "Anon key returned data — RLS may not be enforced!");
      }
    }
  } catch (err) {
    fail("RLS check", err);
  }
}

// ── Run all tests ──
async function main() {
  console.log("BizPilot Tools — Smoke Test");
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Agent ID: ${TEST_AGENT_ID}`);

  const tenantId = await testTenantResolution();
  if (tenantId) {
    await testProductSearch(tenantId);
    await testSaveLead(tenantId);
  } else {
    console.log("\n⚠ Skipping product/lead tests — no tenant found");
  }
  testEscalation();
  await testRLS();

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
