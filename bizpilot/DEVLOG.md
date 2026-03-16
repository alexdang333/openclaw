# BizPilot Development Log

> Chronological record of decisions, discussions, and progress.
> Updated every session so we can pick up from any point.

---

## 2026-03-12 — Session 1: Project Setup

### What We Did

1. **Created PROJECT-BIBLE.md** — full project specification covering vision, architecture, tech stack, data schema, tools, message flows, pricing, roadmap, risks
2. **Evaluated the project** — identified strengths (positioning, economics, tech stack) and risks (Facebook API dependency, solo dev scaling, self-service onboarding timing)
3. **Decided fork strategy** — Fork + Controlled Merge approach for managing OpenClaw upstream updates
4. **Set up the repository**:
   - Forked OpenClaw to `github.com/alexdang333/openclaw`
   - Cloned with upstream remote configured
   - Tagged base: `bizpilot-base-v0.0.1`
   - Created BizPilot directories (`extensions/facebook/`, `extensions/bizpilot-tools/`, `bizpilot/`)
   - Added BizPilot section to CLAUDE.md (AGENTS.md)
   - Verified: `pnpm install` + `pnpm build` pass

### Key Decisions

| #   | Decision                                      | Why                                                                             | Alternatives Rejected                                                                     |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Fork + Controlled Merge for OpenClaw          | Full control over updates, can cherry-pick urgent fixes, minimize breakage risk | Pin to commit (miss patches), submodule (awkward for extensions), track daily (too risky) |
| 2   | Weekly upstream review cadence                | Balance between staying current and stability                                   | Daily (too much churn), monthly (fall too far behind)                                     |
| 3   | BizPilot code in separate directories only    | Minimize merge conflicts with upstream                                          | Modifying core files (merge hell)                                                         |
| 4   | Security checklist before each upstream merge | Protect production customers from supply chain risks                            | Trust upstream blindly (too risky)                                                        |

### Upstream Update Procedure (Decided)

```bash
# Weekly review
git fetch upstream
git log --oneline main..upstream/main          # What changed?
git diff main..upstream/main -- package.json   # Check dep changes

# If looks good
git merge upstream/main
npm audit                                       # Security check
# Test our extensions
# Tag: git tag bizpilot-v0.X.Y
```

### Project Evaluation Summary

**Strengths:**

- Smart positioning ("force multiplier" not "replacement")
- Compelling economics ($149-499/mo vs $4-6k/mo human, ~96% margin)
- Pragmatic tech stack (OpenClaw + Supabase + Railway)
- Dual-market strategy (VN pilots, US revenue)

**Risks to watch:**

- Facebook API dependency (existential risk)
- 100 customers in 6 months is aggressive for solo dev
- Self-service onboarding is Phase 4 but critical for US market
- No moat yet — competitors will add LLM features
- Support burden at scale

**Recommendations:**

- Consider 30-50 customers as more realistic first target
- Pull self-service onboarding earlier
- Get one killer US case study before scaling

### Current Status

- **Phase**: Pre-development (setup complete)
- **Next**: Commit setup, then start Supabase schema + Facebook Messenger extension
- **Blockers**: None

---

## 2026-03-12 — Session 1 (cont): Foundation Running

### What We Did

1. **Set up documentation system**:
   - `bizpilot/DEVLOG.md` — chronological development log
   - `bizpilot/DECISIONS.md` — decision register (ADR-lite)
   - Memory system for cross-session context

2. **Established security as priority** — Decision D011: security is first-class at every step (OWASP, dependency audit, RLS, token encryption, least privilege)

3. **Got OpenClaw gateway running locally**:
   - Gateway was stopped since Feb 24 (LaunchAgent PATH issue)
   - Started in foreground mode successfully on port 18789
   - Dashboard accessible at `http://127.0.0.1:18789/`
   - Existing `main` agent + Telegram channel configured

4. **Created BizPilot test agent**:
   - Agent ID: `bizpilot-test`
   - Workspace: `~/.openclaw/workspace-bizpilot-test/`
   - Model: Claude Haiku 4.5 (cost-efficient for testing)
   - SOUL.md with customer service personality
   - Added to `~/.openclaw/openclaw.json` agents list
   - Verified running via `openclaw agents list --bindings`

5. **Zalo extension deep-dive** (research in progress):
   - Mapping full pattern: channel.ts, send.ts, accounts.ts, config-schema.ts, onboarding.ts
   - Will use as template for Facebook Messenger extension

### Security Notes

- **Flagged**: Telegram bot token stored in plaintext in `~/.openclaw/openclaw.json` — acceptable for local dev, needs env vars or SecretRef for production
- **Flagged**: Gateway auth token also in plaintext — same mitigation needed for production

### Key Decisions

| #   | Decision                            | Why                                                                |
| --- | ----------------------------------- | ------------------------------------------------------------------ |
| 5   | Use Claude Haiku 4.5 for test agent | Cost-efficient during development, switch to Sonnet for production |
| 6   | Run gateway in foreground for now   | LaunchAgent has PATH issues, foreground works reliably             |

### Current Status

- **Phase**: Foundation running
- **Gateway**: Running locally on port 18789
- **Agents**: main (default) + bizpilot-test (BizPilot Test)
- **Next**: Set up Supabase schema, then start Facebook Messenger extension
- **Blockers**: None

---

## 2026-03-12 — Session 1 (cont): Supabase + Blueprint

### What We Did

1. **Zalo extension deep-dive completed** — comprehensive blueprint for Facebook extension:
   - 16 source files mapped with exact responsibilities
   - Key differences identified (OAuth tokens, webhook-only, Graph API, HMAC verification)
   - Message processing pipeline documented
   - Saved to `bizpilot/FACEBOOK-EXTENSION-BLUEPRINT.md`

2. **Supabase project created**:
   - Project: `bizpilot` (ref: `snzoeqapezoydidicvlp`)
   - Region: West US (Oregon)
   - Separate from existing `bdsx` project (security: data isolation)

3. **Database schema deployed** (`supabase/migrations/20260312_001_init_schema.sql`):
   - 6 tables: `tenants`, `products`, `leads`, `customers`, `analytics_events`, `conversations`
   - RLS enabled on all tables with tenant isolation policies
   - Trigram index on products.name for fuzzy search
   - `updated_at` triggers on mutable tables
   - Storage bucket `product-images` with RLS (public read, service-role write)
   - CHECK constraints on all enum columns

4. **RLS verified**:
   - Anon key returns `[]` — tenant isolation working
   - Service role returns all data — bypasses RLS as expected

5. **Test data seeded**:
   - 1 tenant: "Test Beauty Shop" (agent_id: bizpilot-test)
   - 5 products: Vitamin C Serum, Moisturizer, Lipstick, Night Cream, Combo Set

6. **Secrets management**:
   - `bizpilot/.env` created with Supabase keys (gitignored)
   - `bizpilot/.env.example` committed as template

### Security Measures Applied

- Separate Supabase project for BizPilot (not sharing with other projects)
- RLS on every table, no exceptions
- CHECK constraints on all enum fields (prevent invalid data)
- Storage bucket: public read only, service_role required for writes
- Secrets in `.env` file (gitignored), `.env.example` committed as template
- Database password generated with `openssl rand -base64 24`

### Key Decisions

| #   | Decision                               | Why                                                                         |
| --- | -------------------------------------- | --------------------------------------------------------------------------- |
| 7   | Separate Supabase project for BizPilot | Security: data isolation, separate credentials, clean slate                 |
| 8   | pg_trgm for product search             | Handles fuzzy matching up to 10k products without pgvector overhead         |
| 9   | Service role key for agent backend     | Bypasses RLS (agent manages all tenants), anon key for future web dashboard |

### Current Status

- **Phase**: Foundation + database ready
- **Gateway**: Running locally on port 18789
- **Supabase**: Schema deployed, RLS verified, test data seeded
- **Next**: Start building Facebook Messenger extension
- **Blockers**: None

---

## 2026-03-12 — Session 2: Facebook Messenger Extension

### What We Did

1. **Deep-dived Zalo extension pattern** (16 source files):
   - Mapped every file's responsibility, imports, and patterns
   - Documented the ChannelPlugin interface, adapters, SDK surface
   - Understood plugin discovery, build registration, and runtime loading

2. **Built complete Facebook Messenger extension** (`extensions/facebook/`):
   - 20 files total following the exact Zalo pattern
   - Full ChannelPlugin implementation with all adapters
   - Graph API v21.0 client with typed request/response
   - HMAC-SHA256 webhook signature verification (x-hub-signature-256)
   - Hub.challenge webhook verification (GET request)
   - Message processing pipeline: text, images, postbacks
   - Typing indicator support (sender_action: "typing_on")
   - Replay/dedup protection (5-minute window by message ID)
   - Rate limiting on webhook endpoint
   - Multi-account support with token/appSecret resolution
   - Onboarding wizard (page access token, app secret, verify token, webhook path)
   - DM policy (pairing/allowlist/open/disabled)

3. **Registered plugin-sdk entry** in 3 build system files:
   - `src/plugin-sdk/facebook.ts` — narrow SDK surface (same exports as zalo.ts)
   - `tsconfig.plugin-sdk.dts.json` — added facebook.ts to include list
   - `tsdown.config.ts` — added "facebook" to pluginSdkEntrypoints
   - `package.json` — added `./plugin-sdk/facebook` export mapping

4. **Build verified**: `pnpm build` passes cleanly, `dist/plugin-sdk/facebook.js` + `.d.ts` generated

### Files Created

| File                                         | Purpose                                        |
| -------------------------------------------- | ---------------------------------------------- |
| `extensions/facebook/package.json`           | npm metadata + openclaw.channel block          |
| `extensions/facebook/openclaw.plugin.json`   | Plugin manifest                                |
| `extensions/facebook/index.ts`               | Entry point: register channel plugin           |
| `extensions/facebook/src/types.ts`           | FacebookAccountConfig, ResolvedFacebookAccount |
| `extensions/facebook/src/config-schema.ts`   | Zod schema with multi-account support          |
| `extensions/facebook/src/runtime.ts`         | Runtime store singleton                        |
| `extensions/facebook/src/secret-input.ts`    | SDK secret helpers re-export                   |
| `extensions/facebook/src/api.ts`             | Graph API client (sendMessage, getMe, etc.)    |
| `extensions/facebook/src/token.ts`           | Page access token + app secret resolution      |
| `extensions/facebook/src/accounts.ts`        | Account resolution with multi-account          |
| `extensions/facebook/src/probe.ts`           | Probe via /me endpoint                         |
| `extensions/facebook/src/proxy.ts`           | Proxy fetch support                            |
| `extensions/facebook/src/send.ts`            | sendMessageFacebook() + sendMediaFacebook()    |
| `extensions/facebook/src/actions.ts`         | Message actions adapter                        |
| `extensions/facebook/src/group-access.ts`    | DM access control                              |
| `extensions/facebook/src/status-issues.ts`   | Config warnings                                |
| `extensions/facebook/src/monitor.webhook.ts` | HMAC verification, hub.challenge, dedup        |
| `extensions/facebook/src/monitor.ts`         | monitorFacebookProvider() + message pipeline   |
| `extensions/facebook/src/channel.ts`         | Full ChannelPlugin + facebookDock              |
| `extensions/facebook/src/onboarding.ts`      | Setup wizard (4 steps)                         |
| `src/plugin-sdk/facebook.ts`                 | Narrow SDK surface for facebook plugin         |

### Key Differences from Zalo Extension

| Aspect         | Zalo                                | Facebook                                  |
| -------------- | ----------------------------------- | ----------------------------------------- |
| API            | Bot API (bot-api.zaloplatforms.com) | Graph API v21.0 (graph.facebook.com)      |
| Auth           | Bot token in URL path               | Bearer token in Authorization header      |
| Webhook verify | Secret token header                 | Hub.challenge (GET) + HMAC-SHA256 (POST)  |
| Signature      | x-bot-api-secret-token header       | x-hub-signature-256 HMAC-SHA256           |
| Send           | POST /bot{token}/sendMessage        | POST /me/messages with Bearer auth        |
| Payload        | { event_name, message }             | { object: "page", entry: [...messaging] } |
| Modes          | Webhook + polling                   | Webhook only                              |
| Chat types     | DM + group                          | DM only (Page Messaging)                  |
| Typing         | sendChatAction (typing)             | sender_action: "typing_on"                |
| Extra config   | webhookSecret                       | appSecret + webhookVerifyToken            |

### Security Measures Applied

- **HMAC-SHA256**: Webhook signature verification using app secret (timing-safe comparison)
- **Hub.challenge**: GET request verification with verify token matching
- **Replay protection**: 5-minute dedup cache by message ID
- **Rate limiting**: Per-IP rate limiting on webhook endpoint
- **Anomaly tracking**: Status code anomaly detection
- **Token security**: Page access tokens and app secrets via SecretInput (env/config/file)
- **Echo filtering**: Skips is_echo messages to prevent loops
- **Bearer auth**: Token sent in Authorization header (not URL)

### Current Status

- **Phase**: Facebook extension built, build verified
- **Next**: Test with real Facebook Page, then build BizPilot custom tools
- **Blockers**: Need Facebook App + Page for end-to-end testing

---

## 2026-03-12 — Session 3: Instagram DM Extension + BizPilot Tools

### What We Did

1. **Fixed Facebook extension gap** — added quick reply support:
   - `FacebookQuickReply` type in `api.ts`
   - `quickReplies` parameter in `send.ts`

2. **Built complete Instagram DM extension** (`extensions/instagram/`):
   - 21 files total, separate extension from Facebook (Option B — independent enable/disable, different user IDs)
   - Full ChannelPlugin following same pattern as Facebook
   - Key differences from Facebook: `object: "instagram"`, IGSID user IDs, 1000 char text limit, `story_mention`/`story_reply` attachment types
   - Default webhook path `/instagram-webhook`
   - App secret env fallback to `FACEBOOK_APP_SECRET` (shared Facebook App)
   - Registered in build system (tsconfig, tsdown, package.json)
   - Build verified clean

3. **Built BizPilot agent tools extension** (`extensions/bizpilot-tools/`):
   - 7 files, tool-only plugin (no channels)
   - `product-search` — queries Supabase `products` table with text search + filters (category, price, stock)
   - `save-lead` — inserts into `leads` table, captures `requesterSenderId` as `channel_user_id`
   - `escalate` — formats structured alert with urgency levels, returns admin notification instructions
   - Shared Supabase client with tenant resolution (`agentId` → `tenants.agent_id`)
   - Tool factory pattern injects OpenClaw context (agentId, requesterSenderId, messageChannel)
   - Config via `openclaw.plugin.json`: supabaseUrl, supabaseKey, adminNotifyChannel, adminNotifyTarget
   - Build verified clean

### Files Created (Instagram)

| File                                          | Purpose                                             |
| --------------------------------------------- | --------------------------------------------------- |
| `extensions/instagram/package.json`           | npm metadata, aliases: ig, insta                    |
| `extensions/instagram/openclaw.plugin.json`   | Plugin manifest                                     |
| `extensions/instagram/index.ts`               | Entry point: register channel plugin                |
| `extensions/instagram/src/types.ts`           | InstagramAccountConfig, ResolvedInstagramAccount    |
| `extensions/instagram/src/config-schema.ts`   | Zod schema with multi-account                       |
| `extensions/instagram/src/runtime.ts`         | Runtime store singleton                             |
| `extensions/instagram/src/secret-input.ts`    | SDK helpers re-export                               |
| `extensions/instagram/src/api.ts`             | Graph API client + Instagram-specific types         |
| `extensions/instagram/src/token.ts`           | Token resolution (env: INSTAGRAM_PAGE_ACCESS_TOKEN) |
| `extensions/instagram/src/accounts.ts`        | Account resolution                                  |
| `extensions/instagram/src/probe.ts`           | Probe via /me (id,name,username)                    |
| `extensions/instagram/src/proxy.ts`           | Proxy fetch support                                 |
| `extensions/instagram/src/send.ts`            | sendMessageInstagram() — 1000 char limit            |
| `extensions/instagram/src/actions.ts`         | Message actions adapter                             |
| `extensions/instagram/src/group-access.ts`    | DM access control                                   |
| `extensions/instagram/src/status-issues.ts`   | Config warnings                                     |
| `extensions/instagram/src/monitor.webhook.ts` | HMAC verification, validates object=instagram       |
| `extensions/instagram/src/monitor.ts`         | monitorInstagramProvider() + message pipeline       |
| `extensions/instagram/src/channel.ts`         | Full ChannelPlugin + instagramDock                  |
| `extensions/instagram/src/onboarding.ts`      | Setup wizard (4 steps)                              |
| `src/plugin-sdk/instagram.ts`                 | Narrow SDK surface                                  |

### Files Created (BizPilot Tools)

| File                                              | Purpose                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| `extensions/bizpilot-tools/package.json`          | deps: @sinclair/typebox, @supabase/supabase-js       |
| `extensions/bizpilot-tools/openclaw.plugin.json`  | configSchema: supabaseUrl, supabaseKey, admin notify |
| `extensions/bizpilot-tools/index.ts`              | Registers 3 tools via factory pattern                |
| `extensions/bizpilot-tools/src/supabase.ts`       | Cached client + resolveTenantId()                    |
| `extensions/bizpilot-tools/src/product-search.ts` | Search products table with filters                   |
| `extensions/bizpilot-tools/src/save-lead.ts`      | Insert into leads table                              |
| `extensions/bizpilot-tools/src/escalate.ts`       | Format escalation alert                              |

### Key Decisions

| #   | Decision                                                | Why                                                                                                                |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 10  | Separate Instagram extension (not embedded in Facebook) | Independent enable/disable, different user IDs (IGSID vs PSID), different permissions, follows OpenClaw convention |
| 11  | Tool factory pattern for bizpilot-tools                 | Injects agentId/requesterSenderId from OpenClaw context into each tool execution                                   |
| 12  | Service-role Supabase key for tools                     | Tools manage multi-tenant data, RLS bypassed but tenant isolation enforced in code via agentId→tenant_id mapping   |
| 13  | Escalation returns alert text (not direct-send)         | OpenClaw runtime doesn't expose simple send-to-channel API; agent's system prompt handles notification routing     |

### Current Status

- **Phase**: All Phase 1 extensions built, builds verified
- **Extensions**: facebook (20 files), instagram (21 files), bizpilot-tools (7 files)
- **Next**: Supabase schema verification, end-to-end testing, deploy to Railway
- **Blockers**: Need Facebook App + Page + Instagram Professional account for E2E testing

---
