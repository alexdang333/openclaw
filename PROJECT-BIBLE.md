# BizPilot - Project Bible

> AI Autopilot for Small & Medium Businesses
> Last updated: 2026-03-12

---

## 1. Project Overview

### Vision

BizPilot is an AI agent platform that helps small and medium businesses automate customer care and page management across multiple channels (Facebook Page, Instagram, Website Chat, WhatsApp, Zalo...) at a fraction of the cost of hiring staff. Built for any market, with initial focus on US SMEs.

### Value Proposition

- **For SMEs**: One AI agent working 24/7, handling 60-70% of page admin work, cheaper than hiring a person
- **For us**: Build once, deploy to any market, high margin, scales globally

### Target Markets

| Priority      | Market                        | Key Channels                                | Language       | Notes                                          |
| ------------- | ----------------------------- | ------------------------------------------- | -------------- | ---------------------------------------------- |
| **Primary**   | United States                 | Facebook, Instagram, Website Chat, WhatsApp | English        | Largest SME market, highest willingness to pay |
| **Secondary** | Vietnam                       | Facebook, Zalo, Website Chat, WhatsApp      | Vietnamese     | Existing network, initial pilot customers      |
| **Future**    | Southeast Asia, LATAM, Europe | Market-dependent                            | Multi-language | Expand as platform matures                     |

### Target Customers

- SMEs with active social media pages (Facebook, Instagram) selling products or services online
- 50-10,000 products/services
- Industries: e-commerce, beauty/cosmetics, fashion, F&B, home services, fitness, real estate, professional services
- Currently using: manual inbox management, basic chatbots (ManyChat/Chatfuel), or no automation at all
- Pain point: spending 4-8 hours/day on page management, missing leads, inconsistent response times

### US Market Opportunity

- ~33.2 million small businesses in the US (SBA, 2024)
- 93% of SMBs use social media for marketing
- Average cost of a social media manager: $4,000-6,000/month
- BizPilot at $200-500/month = massive cost savings
- Competitors (ManyChat, Tidio, Intercom) are rule-based or expensive at scale

### Goal

- **100 customers within 6 months** (starting March 2026)
- Initial pilots with Vietnamese SMEs (existing network) to validate product
- Shift primary acquisition to US market by Month 3
- Solo dev (Thang) + Claude Code as co-builder

---

## 2. Product Definition

### What Each Business (Customer) Gets

1. **1 Dedicated AI Agent** - unique brain, knowledge, and brand voice
2. **Multi-channel connections** (market-dependent):
   - Facebook Messenger (inbox auto-reply) - all markets
   - Facebook/Instagram Comments (monitor + reply) - all markets
   - Instagram DM (inbox auto-reply) - US priority
   - Website Chat widget (built-in OpenClaw web provider) - all markets
   - WhatsApp Business (built-in) - US, LATAM, Europe
   - Zalo OA (existing extension) - Vietnam only
   - Google Business Messages (future) - US priority
3. **Lead capture** - automatically collects customer info, saves to DB, notifies admin
4. **Content assistant** - drafts posts, admin approves via Telegram
5. **Daily reports** - sent via Telegram every evening
6. **Escalation** - detects complex issues, alerts admin
7. **Admin control** - manage everything via Telegram

### Automation Levels (Honest Assessment)

| Activity                                 | Automated | Needs Human    |
| ---------------------------------------- | --------- | -------------- |
| Reply inbox FAQ (price, stock, shipping) | 90%       | 10%            |
| Reply comments (simple)                  | 85%       | 15%            |
| Hide spam/toxic comments                 | 95%       | 5%             |
| Draft content/captions                   | 70%       | 30% (approval) |
| Post on schedule                         | 90%       | 10%            |
| Product photography/video                | 0%        | 100%           |
| Handle complaints/refunds                | 20%       | 80%            |
| Run ads/boost posts                      | 30%       | 70%            |
| Analytics reporting                      | 90%       | 10%            |
| Crisis management (bad PR)               | 0%        | 100%           |
| KOL/wholesale partnerships               | 10%       | 90%            |
| Update catalog (new products)            | 20%       | 80%            |

**Overall: Agent automates ~60-65% of workload, reduces admin time from 8h to 2-3h/day**

### Positioning

- **DO NOT pitch**: "AI replaces your employee"
- **DO pitch**: "AI assistant that makes your admin 3-4x more productive"
- 1 person + BizPilot = productivity of 3-4 people

---

## 3. Architecture

### Core Platform

- **OpenClaw** (open-source) as agent runtime
- BizPilot = OpenClaw + Facebook extension + custom tools + multi-tenant config

### System Architecture

```
GitHub (code)
  | push
  v
GitHub Actions (CI/CD)
  | auto deploy
  v
Railway (hosting)
  |
  |-- OpenClaw Gateway (Docker container)
  |   |
  |   |-- Agent "shop-a" --> FB Page A + Web Chat A + Zalo A
  |   |-- Agent "shop-b" --> FB Page B + Web Chat B
  |   |-- Agent "shop-c" --> FB Page C + Web Chat C + WhatsApp C
  |   |-- ... (10-15 agents per instance)
  |   |
  |   |-- Admin channels:
  |       |-- Telegram @admin_a (shop A owner)
  |       |-- Telegram @admin_b (shop B owner)
  |       |-- Telegram @admin_c (shop C owner)
  |
  |-- Supabase (external, managed)
  |   |-- PostgreSQL
  |   |   |-- tenants (business profiles)
  |   |   |-- products (per tenant, supports 10k+ rows)
  |   |   |-- leads (captured from all channels)
  |   |   |-- customers (cross-channel profiles)
  |   |   |-- analytics_events
  |   |   |-- conversations_log
  |   |-- Storage
  |   |   |-- product-images/{tenant_id}/
  |   |-- Row Level Security (automatic tenant isolation)
  |
  |-- Cloudflare
      |-- DNS (custom domains)
      |-- CDN (cache static assets)
      |-- Pages (web chat widget hosting)
      |-- R2 (backup/overflow storage)
```

### Per-Business Architecture

```
┌──────────────────────────────────────────────────────┐
│                 1 Business = 1 Agent                  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Agent "Business Name"                  │ │
│  │                                                   │ │
│  │  Brain:     LLM (Claude/GPT)                     │ │
│  │  Knowledge: products, pricing, FAQ, policies     │ │
│  │  Voice:     unique brand tone & personality      │ │
│  │  Tools:     catalog, lead capture, analytics...  │ │
│  │  Memory:    conversation history, customer data  │ │
│  │  Cron:      content schedule, reports, monitors  │ │
│  └──────────┬──────────────────────────────────┬────┘ │
│             |                                   |      │
│    ┌────────▼─────────┐            ┌───────────▼────┐ │
│    │  Customer-facing  │            │  Admin-facing  │ │
│    │                   │            │                │ │
│    │  Facebook Inbox   │            │  Telegram      │ │
│    │  Facebook Comment │            │  - Approve     │ │
│    │  Website Chat     │            │  - Reports     │ │
│    │  Zalo OA          │            │  - Direct      │ │
│    │  WhatsApp         │            │  - Alerts      │ │
│    │  Instagram DM     │            │  - Override    │ │
│    │                   │            │                │ │
│    │  --> Reply        │            │  Or Web UI     │ │
│    │  --> Capture lead │            │  (OpenClaw)    │ │
│    │  --> Escalate     │            │                │ │
│    └───────────────────┘            └────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Multi-Tenant Model

```
1 Railway instance = 10-15 businesses
100 customers = 7-10 instances

Each business gets:
  - 1 OpenClaw Agent (isolated agentDir, model, tools, memory)
  - 1 set of channel connections (FB token, Zalo token, web chat embed)
  - Data isolated via Supabase RLS (tenant_id column)
  - Routing: channel account --> agent (binding-based)
```

### Scaling Plan

| Stage  | Customers | Infrastructure                | Monthly Cost |
| ------ | --------- | ----------------------------- | ------------ |
| Pilot  | 1-5       | 1 Railway instance            | ~$20         |
| Growth | 5-20      | 1 Railway instance (upgraded) | ~$40-60      |
| Scale  | 20-50     | 2-3 instances                 | ~$100-150    |
| Target | 50-100    | 5-7 instances                 | ~$200-350    |

---

## 4. Tech Stack (Decided)

### Core Stack

| Layer          | Technology            | Claude Code Access | Why This Choice                                               |
| -------------- | --------------------- | ------------------ | ------------------------------------------------------------- |
| Agent platform | OpenClaw              | CLI `openclaw`     | Multi-agent, multi-channel, plugin system, open-source        |
| Database       | Supabase (PostgreSQL) | MCP server         | Direct query/migrate/manage, RLS, Storage, generous free tier |
| Image storage  | Supabase Storage      | MCP/API            | Built-in CDN, RLS-protected, integrated with DB               |
| Hosting        | Railway               | CLI `railway`      | Deploy from terminal, log streaming, auto-scaling             |
| DNS/CDN        | Cloudflare            | CLI `wrangler`     | Domain management, SSL, edge caching                          |
| Source control | GitHub                | CLI `gh`           | PRs, issues, CI/CD, collaboration                             |
| Monitoring     | Better Stack          | CLI + webhooks     | Uptime monitoring, alerting                                   |
| CI/CD          | GitHub Actions        | `gh` CLI           | Auto deploy on push, test pipeline                            |

### MCP Servers (Claude Code Integration)

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": { "SUPABASE_ACCESS_TOKEN": "..." }
    },
    "postgres": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-postgres", "postgresql://..."]
    }
  }
}
```

### OpenClaw Platform Capabilities (Verified from Codebase)

| Capability                            | Status             | Details                                                      |
| ------------------------------------- | ------------------ | ------------------------------------------------------------ |
| Multi-agent on 1 gateway              | Ready              | Unlimited agents, each with isolated agentDir                |
| Per-agent system prompt, model, tools | Ready              | Full isolation across agents                                 |
| Channel-to-agent routing              | Ready              | Binding-based: channel + accountId --> agentId               |
| Multi-account per channel type        | Ready              | `accounts: { "shop-a": {...}, "shop-b": {...} }`             |
| Per-agent cron jobs                   | Ready              | Schedule, channel delivery, failure alerts                   |
| Custom tools via plugins              | Ready              | `registerTool()` with full agent/session context             |
| Webhook HTTP endpoints                | Ready              | `registerHttpRoute()` + rate limiting + signature validation |
| Per-agent memory                      | Ready              | SQLite + vector search, isolated per agent                   |
| Web Chat                              | Ready              | Built-in web provider (`src/provider-web.ts`)                |
| Zalo channel                          | Ready              | `extensions/zalo/`                                           |
| WhatsApp                              | Ready              | Built-in (Baileys library)                                   |
| Telegram                              | Ready              | Built-in (grammY library)                                    |
| Facebook Messenger                    | **Needs Building** | Follow pattern from `extensions/zalo/`                       |

### Rejected Alternatives

| Option                  | Reason for Rejection                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| Cloudflare MoltWorker   | Proof-of-concept only, not production-ready, channels need always-on process |
| AWS (EC2/ECS)           | Over-engineered for solo dev, higher cost, more ops overhead                 |
| Self-managed PostgreSQL | Unnecessary ops burden; Supabase provides managed DB + extras                |

---

## 5. Data Architecture

### Supabase Schema (Planned)

```sql
-- Tenant (business) management
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_name text,
  owner_phone text,
  owner_telegram_id text,
  agent_id text NOT NULL,         -- OpenClaw agent ID
  plan text DEFAULT 'basic',      -- basic | standard | premium
  status text DEFAULT 'trial',    -- trial | active | suspended | cancelled
  config jsonb DEFAULT '{}',      -- brand voice, policies, custom settings
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Product catalog
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  sale_price numeric,
  category text,
  tags text[] DEFAULT '{}',
  image_urls text[] DEFAULT '{}',
  stock integer DEFAULT 0,
  status text DEFAULT 'active',   -- active | out_of_stock | hidden
  metadata jsonb DEFAULT '{}',    -- variants, specs, custom fields
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Lead capture
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text,
  phone text,
  email text,
  source text NOT NULL,           -- facebook | web | zalo | whatsapp | instagram
  channel_user_id text,           -- platform-specific user ID
  interest text,                  -- what product/service they asked about
  conversation_summary text,      -- AI-generated summary of conversation
  status text DEFAULT 'new',      -- new | contacted | converted | lost
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Customer profiles (cross-channel unified)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text,
  phone text,
  email text,
  channel_ids jsonb DEFAULT '{}', -- { "facebook": "id", "zalo": "id", ... }
  total_orders integer DEFAULT 0,
  total_spent numeric DEFAULT 0,
  tags text[] DEFAULT '{}',
  notes text,
  last_contact_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Analytics events
CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_type text NOT NULL,       -- inbox_reply | comment_reply | lead_captured | ...
  channel text,                   -- facebook | web | zalo | whatsapp
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Row Level Security (all tables)
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "tenant_isolation" ON products
--   USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Data Responsibility Split

```
OpenClaw Memory (built-in)              Supabase (external DB)
-----------------------------           ----------------------------
- Brand voice & tone guide              - Products (structured, queryable)
- FAQ & common responses                - Leads (captured contacts)
- Policies & guidelines                 - Customers (cross-channel profiles)
- Conversation history (sessions)       - Analytics events
- Agent bootstrap context               - Product images (Storage)
                                        - Tenant configuration
Suitable for:                           Suitable for:
  <= few hundred documents                10k+ rows per tenant
  Semantic/keyword search                 Exact queries, filtering, aggregation
  Unstructured knowledge                  Structured business data
```

### Product Catalog Performance

| Scale                 | DB Approach                             | Expected Latency |
| --------------------- | --------------------------------------- | ---------------- |
| <= 200 products       | PostgreSQL (basic queries)              | < 100ms          |
| 200-2,000 products    | PostgreSQL + B-tree indexes             | < 100ms          |
| 2,000-10,000 products | PostgreSQL + pg_trgm (trigram search)   | < 200ms          |
| 10,000+ products      | PostgreSQL + pgvector (semantic search) | < 500ms          |

---

## 6. Custom Tools (To Build)

### Tool: product-search

```
Purpose: Search product catalog for customer inquiries
Input:   { query: string, category?: string, maxPrice?: number, minPrice?: number, inStock?: boolean }
Output:  { products: [{ name, price, salePrice, stock, imageUrl, description }], total: number }
Action:  Query Supabase products table with filters
```

### Tool: save-lead

```
Purpose: Capture potential customer information during conversation
Input:   { name?: string, phone?: string, email?: string, source: string, interest: string, conversationSummary: string }
Output:  { leadId: string, status: string }
Action:  INSERT into Supabase leads table + send notification to admin via Telegram
```

### Tool: fb-comments

```
Purpose: Monitor and manage Facebook Page comments
Input:   { action: "list" | "reply" | "hide", postId?: string, commentId?: string, text?: string }
Output:  { success: boolean, data: any }
Action:  Facebook Graph API comment operations
```

### Tool: fb-publish

```
Purpose: Publish or schedule posts to Facebook Page
Input:   { message: string, imageUrl?: string, scheduledTime?: string }
Output:  { postId: string, url: string }
Action:  Facebook Graph API page publish
```

### Tool: fb-insights

```
Purpose: Retrieve Facebook Page analytics
Input:   { period: "day" | "week" | "month", metrics?: string[] }
Output:  { reach: number, engagement: number, impressions: number, ... }
Action:  Facebook Insights API
```

### Tool: daily-report

```
Purpose: Generate and deliver daily business summary
Input:   { tenantId: string, period: "day" | "week" }
Output:  { formatted report text with metrics }
Action:  Aggregate from analytics_events + leads + products in Supabase
```

### Tool: escalate

```
Purpose: Alert business admin about issues requiring human attention
Input:   { reason: string, customerInfo: object, urgency: "low" | "medium" | "high", conversationSummary: string }
Output:  { notified: boolean }
Action:  Send formatted alert to admin's Telegram with full context and action link
```

### Tool: check-order (Phase 2+)

```
Purpose: Look up order status for customer inquiries
Input:   { orderId?: string, phone?: string }
Output:  { orderStatus: string, tracking: string, estimatedDelivery: string }
Action:  Query external order/shipping system
```

---

## 7. Message Flow Details

### Flow 1: Customer Inbox Reply (Reactive)

```
Customer sends "How much is Product X?" on Messenger
  |
  v
Facebook Messenger extension receives webhook
  |
  v
Gateway routes to correct agent (by FB Page account ID)
  |
  v
Agent checks Memory (returning customer? load history)
  |
  v
Agent calls Tool: product-search { query: "Product X" }
  --> Returns: price, description, stock, image URL
  |
  v
Agent composes reply in brand voice:
  "Hi! Product X is currently 350,000 VND.
   [product image]
   We have free shipping for orders over 500,000 VND.
   Would you like to order?"
  |
  v
Reply sent via Messenger
  |
  v
Memory updated: customer asked about Product X, interested in price
```

### Flow 2: Website Chat + Lead Capture (Reactive)

```
Visitor on website clicks chat widget
  |
  v
WebSocket connects to OpenClaw Gateway --> Routes to agent
  |
  v
Customer: "Do you ship to Da Nang?"
  |
  v
Agent calls Tool: product-search (checks shipping policy in memory)
  --> "Yes, shipping to Da Nang: 30k VND, 2-3 days"
  |
  v
Agent detects purchase intent, initiates lead capture:
  "I'd love to help you order! May I have your name and phone number?"
  |
  v
Customer provides info
  |
  v
Agent calls Tool: save-lead
  { name: "Nguyen Van A", phone: "0901234567",
    source: "web", interest: "Product X, shipping to Da Nang" }
  |
  v
Admin receives Telegram notification:
  "New lead from website:
   Nguyen Van A - 0901234567
   Interest: Product X, Da Nang shipping"
```

### Flow 3: Comment Management (Reactive via Cron)

```
Cron job runs every 2 minutes: check new comments
  |
  v
Agent calls Tool: fb-comments { action: "list" }
  --> Returns new comments on recent posts
  |
  v
Agent classifies each comment:
  |-- [Info question] --> Reply with answer
  |-- [Complaint]     --> Reply + escalate to admin
  |-- [Spam/toxic]    --> Hide + report
  |-- [Positive]      --> React + thank reply
  |
  v
Example reply: "Still in stock! DM us for quick ordering"
```

### Flow 4: Daily Report (Proactive via Cron)

```
Cron trigger: 9:00 PM daily
  |
  v
Agent calls Tool: daily-report { period: "day" }
  --> Aggregates: inbox count, comments, leads, page insights
  |
  v
Agent sends to admin via Telegram:
  "Daily Report 03/12:
   - Inbox: 47 messages (43 auto-replied, 4 escalated)
   - Web chat: 12 messages (10 auto-replied, 2 new leads)
   - Comments: 23 replied, 2 spam hidden
   - New leads today: 6 (3 FB, 2 Web, 1 Zalo)
   - Page reach: 2,300 (+15% vs yesterday)

   Pending items:
   - Customer A: product defect complaint (needs your response)
   - Customer B: wholesale inquiry"
```

### Flow 5: Content Scheduling (Proactive via Cron)

```
Cron trigger: 8:00 AM daily
  |
  v
Agent checks content calendar + product catalog
  |
  v
Agent drafts post: caption + hashtags + selects product image
  |
  v
Sends draft to admin via Telegram:
  "Today's post draft:
   [Preview with image]
   Reply 'ok' to publish at 10 AM
   Reply 'edit ...' to modify"
  |
  v
Admin replies "ok"
  |
  v
Agent calls Tool: fb-publish { message, imageUrl, scheduledTime: "10:00" }
  --> Post published/scheduled on Facebook Page
```

### Flow 6: Escalation (Auto-triggered)

```
Customer: "Your product gave me an allergic reaction! I want a refund!"
  |
  v
Agent detects: negative sentiment + complaint + refund request
  --> Exceeds agent's authority (per guidelines)
  |
  v
Agent replies to customer (stalling):
  "I'm very sorry about your experience.
   I've escalated this to our support team.
   Someone will contact you within 30 minutes."
  |
  v
Agent calls Tool: escalate {
  reason: "Product complaint + refund request",
  urgency: "high",
  customerInfo: { name, history: "VIP, 5 previous orders" }
}
  |
  v
Admin receives Telegram alert:
  "URGENT - Refund Request
   Customer: Nguyen Van A (Messenger)
   Issue: allergic reaction, requesting refund
   History: VIP customer, 5 orders, 2.5M VND total
   Direct link: [messenger conversation link]"
```

### Flow 7: Cross-Channel Context

```
Day 1: Customer asks on website about Product X (price 350k)
  --> Agent remembers in memory

Day 3: Same customer messages on Facebook: "I asked about some cream before..."
  --> Agent searches memory by phone/email match
  --> "You asked about Product X (350k VND)!
       We actually have a 10% discount this week..."
```

Note: Cross-channel memory only works if the customer can be identified across channels (phone, email, or login). Anonymous web sessions remain separate.

---

## 8. Admin Experience (Via Telegram)

### What the business owner sees on Telegram

```
[Agent] Daily Report 03/12:
        - Inbox: 47 messages (43 auto, 4 escalated)
        - Web chat: 12 messages (2 new leads)
        - Leads today: 6 (3 FB, 2 Web, 1 Zalo)
        - Reach: 2,300 (+15% vs yesterday)

[Agent] New Lead - Website:
        Tran Thi B - 0912345678
        Interest: Skincare combo set
        Budget: ~500k VND

[Agent] Content draft for tomorrow:
        [Post preview with image]
        Reply 'ok' to publish at 8 AM
        Reply 'edit ...' to modify

[Admin] "reply to lead Tran Thi B that we have a 450k combo with free shipping"
[Agent] --> Sends message to customer on the original channel

[Admin] "what sold best this week?"
[Agent] "Skincare combo: 23 sets, revenue 10.3M VND
         Top channel: Facebook (15), Web (5), Zalo (3)"
```

---

## 9. Pricing Model

### Service Tiers (USD - US Market)

| Tier        | Scope                                                            | Monthly Fee |
| ----------- | ---------------------------------------------------------------- | ----------- |
| **Starter** | 1 channel (FB or Web Chat) + inbox auto-reply + FAQ + escalation | $149/month  |
| **Growth**  | 2-3 channels + comments + reports + lead capture                 | $299/month  |
| **Pro**     | All channels + content scheduling + analytics + priority support | $499/month  |

No setup fee for US market (SaaS model, self-service onboarding goal).

### Service Tiers (VND - Vietnam Market)

| Tier         | Scope                                                     | Setup Fee (One-time) | Monthly Fee |
| ------------ | --------------------------------------------------------- | -------------------- | ----------- |
| **Basic**    | Inbox auto-reply + FAQ + escalation                       | 15-25M VND           | 3-5M VND    |
| **Standard** | Basic + comments + reports + web chat + lead capture      | 25-40M VND           | 5-8M VND    |
| **Premium**  | Standard + content scheduling + multi-channel + analytics | 40-70M VND           | 8-15M VND   |

### Our Operating Costs (at 100 customers)

| Service                                               | Monthly Cost          |
| ----------------------------------------------------- | --------------------- |
| Railway (hosting, 5-7 instances)                      | $200-350              |
| Supabase (managed PostgreSQL + Storage)               | $50-100               |
| Cloudflare (DNS/CDN/Pages)                            | $0-5                  |
| LLM API (Claude Haiku for simple, Sonnet for complex) | $200-500              |
| **Total infrastructure**                              | **~$500-1,000/month** |
| **Revenue** (100 customers x $300 avg)                | **~$30,000/month**    |
| **Gross margin**                                      | **~96%**              |

### Competitive Comparison (US Market)

| Solution                  | Monthly Cost | AI Quality           | Multi-Channel    | 24/7                |
| ------------------------- | ------------ | -------------------- | ---------------- | ------------------- |
| Hire social media manager | $4,000-6,000 | Human                | Multi            | No (business hours) |
| ManyChat Pro              | $15-65       | Rule-based flows     | FB/IG only       | Yes                 |
| Tidio+                    | $29-394      | Basic AI + rules     | Web + FB         | Yes                 |
| Intercom                  | $39-139/seat | AI copilot           | Web + email      | Yes                 |
| Drift                     | $2,500+      | AI chatbot           | Web              | Yes                 |
| **BizPilot**              | **$149-499** | **LLM (contextual)** | **All channels** | **Yes**             |

**Key differentiators vs US competitors**:

- **vs ManyChat**: True AI understanding vs rigid flow builders; multi-channel beyond just FB/IG
- **vs Tidio/Intercom**: Full page management (comments, content, reports), not just chat widget
- **vs Drift**: 10x cheaper, designed for SMBs not enterprise
- **vs hiring**: 10-30x cheaper than a social media manager, works 24/7, never calls in sick

---

## 10. Build Roadmap (6 Months)

### Phase 1: MVP (Month 1 - 4 weeks)

**Goal: 2-3 pilot customers (VN network, free or discounted)**

```
Week 1-2: Facebook Messenger Extension
  - Webhook receiver (Graph API verification + callback handling)
  - Send messages (text, images, quick replies)
  - Multi-account resolution (multiple FB Pages)
  - Onboarding flow (Page token setup)
  - Reference: extensions/zalo/ pattern

Week 2-3: Core Tools + Instagram DM
  - product-search tool (Supabase query)
  - save-lead tool (capture + Telegram/email notification)
  - escalate tool (alert admin)
  - Instagram DM support (shares Graph API with Facebook)

Week 3-4: Integration & Testing
  - Multi-tenant OpenClaw config setup
  - Web chat embed script (JS snippet for customer websites)
  - Supabase schema deployment + seed data
  - End-to-end testing with real FB Page + Instagram
  - Deploy to Railway
```

### Phase 2: Stabilize + US Prep (Month 2 - 3 weeks)

**Goal: 5-10 customers (mix of VN pilots + first US customers)**

```
  - Facebook/Instagram comment monitoring (Graph API polling via cron)
  - Daily report tool (Insights API --> format --> delivery)
  - Landing page + sign-up flow (bizpilot.ai or similar)
  - Stripe billing integration (US market requires self-service payment)
  - Automated onboarding script (faster new customer setup)
  - Bug fixes from pilot feedback
```

### Phase 3: US Market Launch (Month 3 - 3 weeks)

**Goal: 15-25 customers (US-focused acquisition)**

```
  - Self-service onboarding (connect FB Page, import products, go live)
  - Content scheduling (cron + Graph API publish)
  - WhatsApp Business API integration (important for US SMBs)
  - Cross-channel customer matching (phone/email lookup)
  - Improved lead capture conversational flow
  - Marketing: Product Hunt launch, SMB communities, cold outreach
```

### Phase 4: Growth (Month 4 - 4 weeks)

**Goal: 30-50 customers**

```
  - Web dashboard for customers (view leads, analytics, manage catalog)
  - CSV/Google Sheet product catalog upload
  - Multi-language support (LLM handles natively, but UI/onboarding i18n)
  - Admin mobile notifications (beyond Telegram - email, push)
  - Zalo OA for VN customers (existing extension, configure per tenant)
```

### Phase 5: Scale (Month 5 - 3 weeks)

**Goal: 60-80 customers**

```
  - Google Business Messages channel (US priority)
  - Multi-instance deployment automation
  - Performance optimization (LLM cost, response latency)
  - Monitoring & alerting (Better Stack)
  - SOC 2 / security compliance prep (US enterprise customers)
```

### Phase 6: Polish & Expand (Month 6 - 3 weeks)

**Goal: 100 customers**

```
  - Customer referral program
  - Case studies from successful US customers
  - Advanced analytics dashboard
  - API for third-party integrations (Shopify, WooCommerce, etc.)
  - Explore: LATAM market (Spanish), Europe (multi-language)
```

---

## 11. Customer Onboarding Flow

### Per-Customer Setup Process

```
Day 1: Contract signed
  |
  v
Day 2-3: Technical Setup (Claude Code assisted)
  |- Create new OpenClaw agent (config + agentDir)
  |- Connect Facebook Page (obtain Page Access Token)
  |- Embed web chat widget on customer's website (1 line of JS)
  |- Connect Zalo OA / WhatsApp (if applicable)
  |- Connect admin's Telegram account
  |- Import product catalog (CSV upload to Supabase)
  |- Customize system prompt (brand voice, FAQ, policies)
  |
  v
Day 4-5: Testing & Tuning
  |- Test conversations on every connected channel
  |- Tune reply quality (add FAQ entries, adjust tone)
  |- Train admin on Telegram commands
  |
  v
Day 6: Go Live
```

**After product layer stabilizes: new customer onboarding takes only 2-3 days.**

---

## 12. Claude Code Collaboration Workflow

### How We Work Together

Thang directs, Claude Code executes via CLI and MCP:

```bash
# Adding a new customer
Claude Code:
  1. MCP --> Supabase: INSERT INTO tenants (name, agent_id, ...) VALUES (...)
  2. Edit openclaw config.json5 (add agent + channel routing)
  3. $ railway up (redeploy gateway)
  4. Verify: test webhook, send test message
  --> Done in ~10 minutes

# Debugging a customer issue
Claude Code:
  1. $ railway logs --filter "shop-abc"
  2. MCP --> Supabase: SELECT * FROM products WHERE tenant_id = 'shop-abc'
  3. Identify issue (wrong data, prompt issue, etc.)
  4. Fix code or config
  5. $ railway up
  --> Done

# Generating weekly business report
Claude Code:
  1. MCP --> Supabase:
     SELECT tenant_id, COUNT(*) as leads,
            COUNT(DISTINCT source) as channels
     FROM leads
     WHERE created_at > now() - interval '7 days'
     GROUP BY tenant_id
  2. Format and present results
  --> Instant

# Deploying new features
Claude Code:
  1. Write code (tools, extensions, configs)
  2. $ git add && git commit && git push
  3. GitHub Actions auto-deploys to Railway
  4. Verify: $ railway logs
  --> Continuous delivery
```

### Required MCP Server Configuration

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "<your-access-token>"
      }
    },
    "postgres": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-postgres",
        "postgresql://<user>:<pass>@<host>:5432/<db>"
      ]
    }
  }
}
```

Note: Thang already has `@modelcontextprotocol/server-postgres` installed globally.

---

## 13. Risk Assessment & Mitigation

| Risk                                         | Impact | Probability | Mitigation Strategy                                                                                             |
| -------------------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------- |
| Facebook API changes or restrictions         | High   | Medium      | Abstraction layer between agent tools and Graph API; monitor changelog; version-pin API calls                   |
| LLM hallucination (wrong price/product info) | High   | Medium      | Product catalog tool is single source of truth; system prompt guard rails; never generate prices from memory    |
| Customer expects 100% accuracy               | Medium | High        | Clear SLA: ~90% automated, ~10% escalated; set expectations during onboarding                                   |
| LLM API costs spike with volume              | Medium | Medium      | Use Claude Haiku for simple queries, Sonnet for complex; implement response caching; set per-tenant rate limits |
| Competition (other AI chatbot services)      | Medium | Medium      | Move fast; focus on vertical niches; accumulate domain knowledge; build switching costs via data                |
| Railway/Supabase downtime                    | Medium | Low         | Docker-based (portable to any cloud); Supabase has backups; Railway has multi-region                            |
| Tenant data leakage                          | High   | Low         | Supabase RLS on all tables; per-agent isolation in OpenClaw; audit logging; regular security review             |
| Solo dev burnout / bottleneck                | High   | Medium      | Claude Code handles routine ops; automate onboarding; prioritize self-service features (Phase 4)                |

---

## 14. Key Decisions Log

| Date       | Decision                                    | Reasoning                                                                               |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2026-03-12 | Project name: **BizPilot**                  | Broad scope (not just pages), professional, works internationally                       |
| 2026-03-12 | Platform: **OpenClaw**                      | Open-source, proven multi-agent + multi-channel + plugin architecture                   |
| 2026-03-12 | Database: **Supabase PostgreSQL**           | MCP server support, RLS for tenant isolation, Storage for images, generous free tier    |
| 2026-03-12 | Hosting: **Railway**                        | CLI-based deployment, Docker support, auto-scaling, log streaming                       |
| 2026-03-12 | Multi-tenant approach: **shared gateway**   | 10-15 agents per instance, scale by adding instances                                    |
| 2026-03-12 | Product catalog in **external DB**          | OpenClaw memory system not suitable for 10k+ structured product records                 |
| 2026-03-12 | **Rejected** Cloudflare MoltWorker          | Proof-of-concept only, not production-ready, channels need always-on processes          |
| 2026-03-12 | Pricing US: **$149-499/month** (SaaS)       | 10-30x cheaper than hiring, premium over rule-based bots, no setup fee                  |
| 2026-03-12 | Pricing VN: **3-15M VND/month** + setup fee | Localized pricing for Vietnam market                                                    |
| 2026-03-12 | Target: **100 customers in 6 months**       | Aggressive but achievable with product-led approach and low marginal cost per customer  |
| 2026-03-12 | Positioning: **force multiplier**           | Not replacing people, making people 3-4x more productive; honest about limitations      |
| 2026-03-12 | **Primary market: US SMEs**                 | Largest market, highest willingness to pay, SaaS-friendly; VN as pilot/secondary market |
| 2026-03-12 | **Multi-market architecture**               | Language-agnostic agent (LLM handles any language), market-specific channel mix         |

---

## 15. Team

| Member          | Role              | Capabilities                                                            |
| --------------- | ----------------- | ----------------------------------------------------------------------- |
| **Thang**       | Solo dev, founder | Product vision, engineering, sales, customer relationships              |
| **Claude Code** | AI co-builder     | Code, deploy, debug, query DB, manage infra via CLI/MCP, available 24/7 |

---

## 16. References

| Resource                           | URL / Path                                              |
| ---------------------------------- | ------------------------------------------------------- |
| OpenClaw repository                | https://github.com/openclaw/openclaw                    |
| OpenClaw documentation             | https://docs.openclaw.ai                                |
| Zalo extension (reference pattern) | `openclaw/extensions/zalo/`                             |
| Facebook Graph API docs            | https://developers.facebook.com/docs/graph-api          |
| Facebook Messenger Platform        | https://developers.facebook.com/docs/messenger-platform |
| Supabase documentation             | https://supabase.com/docs                               |
| Railway documentation              | https://docs.railway.app                                |
| Cloudflare Workers/Pages           | https://developers.cloudflare.com                       |
| Better Stack                       | https://betterstack.com/docs                            |

---

## Appendix A: OpenClaw Codebase Key Paths

| Area                     | Path                                                      | Relevance                                     |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------- |
| Agent config types       | `src/config/types.agents.ts`                              | Agent schema definition                       |
| Routing engine           | `src/routing/resolve-route.ts`                            | Message-to-agent routing logic                |
| Channel plugin types     | `src/channels/`                                           | Channel adapter interfaces                    |
| Plugin registration      | `src/plugins/types.ts`                                    | `registerTool()`, `registerHttpRoute()`, etc. |
| Cron system              | `src/cron/types.ts`, `src/cron/service.ts`                | Scheduled task execution                      |
| Memory system            | `src/memory/manager.ts`, `src/memory/types.ts`            | Per-agent memory with vector search           |
| Web provider             | `src/provider-web.ts`                                     | Built-in web chat                             |
| Tool truncation limits   | `src/agents/pi-embedded-runner/tool-result-truncation.ts` | Max 400K chars per tool result                |
| Bootstrap context limits | `src/agents/pi-embedded-helpers/bootstrap.ts`             | 20K chars/file, 150K total                    |
| Zalo extension           | `extensions/zalo/`                                        | **Primary reference for Facebook extension**  |
| Plugin SDK               | `src/plugin-sdk/index.ts`                                 | 446 exports available to extensions           |

---

## Appendix B: Glossary

| Term           | Definition                                                                |
| -------------- | ------------------------------------------------------------------------- |
| **Agent**      | An OpenClaw AI agent instance configured for one business                 |
| **Tenant**     | A business customer using BizPilot                                        |
| **Channel**    | A messaging platform (Facebook, Zalo, Web, WhatsApp, etc.)                |
| **Binding**    | A routing rule mapping a channel account to an agent                      |
| **Escalation** | Transferring a conversation from AI agent to human admin                  |
| **Lead**       | A potential customer whose contact info has been captured                 |
| **Tool**       | A function the AI agent can call (search products, save leads, etc.)      |
| **Cron**       | A scheduled task that runs automatically (reports, comment monitoring)    |
| **Gateway**    | The OpenClaw server process that manages all agents and channels          |
| **RLS**        | Row Level Security - Supabase feature for automatic tenant data isolation |

---

_This document is updated whenever important decisions, changes, or milestones occur._
_Last update: 2026-03-12 - Initial version_
