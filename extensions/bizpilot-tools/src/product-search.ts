import { Type } from "@sinclair/typebox";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BizPilotPluginConfig } from "./supabase.js";
import { getSupabaseClient, resolveTenantId } from "./supabase.js";

export function createProductSearchTool(pluginConfig: BizPilotPluginConfig) {
  return {
    name: "product-search",
    label: "Product Search",
    description:
      "Search the product catalog for customer inquiries. Returns matching products with name, price, stock, and description.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query (product name, keyword, or description fragment).",
      }),
      category: Type.Optional(Type.String({ description: "Filter by product category." })),
      maxPrice: Type.Optional(Type.Number({ description: "Maximum price filter." })),
      minPrice: Type.Optional(Type.Number({ description: "Minimum price filter." })),
      inStock: Type.Optional(
        Type.Boolean({ description: "If true, only return products with stock > 0." }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>, ctx?: { agentId?: string }) {
      const query = String(params.query ?? "").trim();
      if (!query) {
        throw new Error("query is required");
      }

      const client = getSupabaseClient(pluginConfig);
      const agentId = ctx?.agentId;
      if (!agentId) {
        throw new Error("agentId is required to resolve tenant");
      }
      const tenantId = await resolveTenantId(client, agentId);

      const results = await searchProducts(client, {
        tenantId,
        query,
        category: typeof params.category === "string" ? params.category : undefined,
        maxPrice: typeof params.maxPrice === "number" ? params.maxPrice : undefined,
        minPrice: typeof params.minPrice === "number" ? params.minPrice : undefined,
        inStock: typeof params.inStock === "boolean" ? params.inStock : undefined,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  };
}

type SearchParams = {
  tenantId: string;
  query: string;
  category?: string;
  maxPrice?: number;
  minPrice?: number;
  inStock?: boolean;
};

async function searchProducts(
  client: SupabaseClient,
  params: SearchParams,
): Promise<{ products: ProductResult[]; total: number }> {
  let q = client
    .from("products")
    .select("id, name, description, price, sale_price, category, image_urls, stock, status", {
      count: "exact",
    })
    .eq("tenant_id", params.tenantId)
    .eq("status", "active")
    .or(`name.ilike.%${params.query}%,description.ilike.%${params.query}%`)
    .order("name")
    .limit(10);

  if (params.category) {
    q = q.ilike("category", params.category);
  }
  if (params.maxPrice !== undefined) {
    q = q.lte("price", params.maxPrice);
  }
  if (params.minPrice !== undefined) {
    q = q.gte("price", params.minPrice);
  }
  if (params.inStock) {
    q = q.gt("stock", 0);
  }

  const { data, error, count } = await q;
  if (error) {
    throw new Error(`Product search failed: ${error.message}`);
  }

  const products: ProductResult[] = (data ?? []).map((row) => ({
    name: row.name,
    price: row.price,
    salePrice: row.sale_price ?? null,
    stock: row.stock ?? 0,
    imageUrl: Array.isArray(row.image_urls) && row.image_urls.length > 0 ? row.image_urls[0] : null,
    description: row.description ?? "",
    category: row.category ?? "",
  }));

  return { products, total: count ?? products.length };
}

type ProductResult = {
  name: string;
  price: number;
  salePrice: number | null;
  stock: number;
  imageUrl: string | null;
  description: string;
  category: string;
};
