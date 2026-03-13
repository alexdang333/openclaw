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
