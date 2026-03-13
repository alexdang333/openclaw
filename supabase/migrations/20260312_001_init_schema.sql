-- BizPilot Initial Schema
-- Multi-tenant architecture with Row Level Security
-- All tables isolated by tenant_id

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- trigram search for product catalog

-- ============================================================
-- Tenants (businesses using BizPilot)
-- ============================================================
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_name text,
  owner_phone text,
  owner_email text,
  owner_telegram_id text,
  agent_id text NOT NULL,
  plan text NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter', 'growth', 'pro')),
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Slug index for fast lookup
CREATE UNIQUE INDEX idx_tenants_slug ON tenants (slug);
-- Agent ID index for routing
CREATE INDEX idx_tenants_agent_id ON tenants (agent_id);

-- ============================================================
-- Products (per-tenant catalog, supports 10k+ rows)
-- ============================================================
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL CHECK (price >= 0),
  sale_price numeric CHECK (sale_price IS NULL OR sale_price >= 0),
  currency text NOT NULL DEFAULT 'USD',
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  image_urls text[] NOT NULL DEFAULT '{}',
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'out_of_stock', 'hidden')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant isolation + category filtering
CREATE INDEX idx_products_tenant_id ON products (tenant_id);
CREATE INDEX idx_products_tenant_category ON products (tenant_id, category);
CREATE INDEX idx_products_tenant_status ON products (tenant_id, status);
-- Trigram index for fuzzy product name search
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

-- ============================================================
-- Leads (captured potential customers)
-- ============================================================
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  source text NOT NULL
    CHECK (source IN ('facebook', 'instagram', 'web', 'zalo', 'whatsapp', 'telegram', 'other')),
  channel_user_id text,
  interest text,
  conversation_summary text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_tenant_id ON leads (tenant_id);
CREATE INDEX idx_leads_tenant_status ON leads (tenant_id, status);
CREATE INDEX idx_leads_tenant_source ON leads (tenant_id, source);
CREATE INDEX idx_leads_created_at ON leads (tenant_id, created_at DESC);

-- ============================================================
-- Customers (cross-channel unified profiles)
-- ============================================================
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  channel_ids jsonb NOT NULL DEFAULT '{}',
  total_orders integer NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  total_spent numeric NOT NULL DEFAULT 0 CHECK (total_spent >= 0),
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  last_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_tenant_id ON customers (tenant_id);
CREATE INDEX idx_customers_tenant_phone ON customers (tenant_id, phone);
CREATE INDEX idx_customers_tenant_email ON customers (tenant_id, email);

-- ============================================================
-- Analytics events
-- ============================================================
CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_tenant_id ON analytics_events (tenant_id);
CREATE INDEX idx_analytics_tenant_type ON analytics_events (tenant_id, event_type);
CREATE INDEX idx_analytics_created_at ON analytics_events (tenant_id, created_at DESC);

-- ============================================================
-- Conversations log (for cross-session context)
-- ============================================================
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL,
  channel_user_id text NOT NULL,
  customer_id uuid REFERENCES customers(id),
  summary text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'escalated')),
  escalated_at timestamptz,
  escalation_reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_tenant_id ON conversations (tenant_id);
CREATE INDEX idx_conversations_tenant_channel_user ON conversations (tenant_id, channel, channel_user_id);
CREATE INDEX idx_conversations_tenant_status ON conversations (tenant_id, status);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (for our backend/agent)
-- The agent uses service_role key which bypasses RLS by default

-- Application-level policies using app.tenant_id setting
-- These are used when connecting via application code with anon key

CREATE POLICY "tenant_isolation_select" ON tenants
  FOR SELECT USING (id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_select" ON products
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_insert" ON products
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_update" ON products
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_select" ON leads
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_insert" ON leads
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_update" ON leads
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_select" ON customers
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_insert" ON customers
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_update" ON customers
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_select" ON analytics_events
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_insert" ON analytics_events
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_select" ON conversations
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_insert" ON conversations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_update" ON conversations
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================================
-- Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Storage bucket for product images
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true);

-- Storage RLS: only service role can write, public can read
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY "product_images_service_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'service_role'
  );

CREATE POLICY "product_images_service_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'product-images'
    AND auth.role() = 'service_role'
  );
