# BizPilot — Decision Register

> All architectural and strategic decisions in one place.
> Format: ADR-lite (decision, context, alternatives, outcome).

---

## D001: Project Name — BizPilot

- **Date**: 2026-03-12
- **Context**: Needed a name that works internationally, not limited to "page management"
- **Decision**: BizPilot — broad scope, professional, works in any market
- **Status**: Final

## D002: Platform — OpenClaw

- **Date**: 2026-03-12
- **Context**: Need multi-agent, multi-channel, plugin system for building AI agents
- **Decision**: OpenClaw (open-source, MIT license)
- **Alternatives rejected**: Custom-built (too slow), Langchain (not multi-channel), AutoGPT (not production-ready)
- **Status**: Final

## D003: Database — Supabase PostgreSQL

- **Date**: 2026-03-12
- **Context**: Need structured data store for products (10k+), leads, customers with tenant isolation
- **Decision**: Supabase — managed PostgreSQL + RLS + Storage + MCP server support
- **Alternatives rejected**: Self-managed PostgreSQL (ops burden), Firebase (no SQL), PlanetScale (no RLS)
- **Status**: Final

## D004: Hosting — Railway

- **Date**: 2026-03-12
- **Context**: Need Docker hosting with CLI deployment, log streaming, auto-scaling
- **Decision**: Railway — deploy from terminal, affordable, Docker support
- **Alternatives rejected**: AWS EC2/ECS (over-engineered for solo dev), Cloudflare Workers (needs always-on process), Fly.io (viable but Railway preferred)
- **Status**: Final

## D005: Fork Strategy — Fork + Controlled Merge

- **Date**: 2026-03-12
- **Context**: OpenClaw is actively developed (daily updates). Need to stay current while maintaining stability for production customers
- **Decision**: Fork repo, weekly upstream review, security checklist before merge, tag stable versions
- **Alternatives rejected**:
  - Pin to commit (miss security patches)
  - Git submodule (awkward for building extensions inside the repo)
  - Track main daily (breakage risk)
- **Status**: Final

## D006: Code Separation — Dedicated Directories

- **Date**: 2026-03-12
- **Context**: Need to minimize merge conflicts when pulling upstream changes
- **Decision**: All BizPilot code lives in `extensions/facebook/`, `extensions/bizpilot-tools/`, `bizpilot/` — no modifications to OpenClaw core files
- **Status**: Final

## D007: Primary Market — US SMEs

- **Date**: 2026-03-12
- **Context**: Largest SME market, highest willingness to pay, SaaS-friendly
- **Decision**: US primary ($149-499/mo SaaS), Vietnam secondary (3-15M VND/mo + setup fee)
- **Status**: Final

## D008: Pricing Model — SaaS Tiers

- **Date**: 2026-03-12
- **Context**: Need pricing that's 10-30x cheaper than hiring while premium over rule-based bots
- **Decision**: Starter $149/mo, Growth $299/mo, Pro $499/mo (US). No setup fee for US
- **Status**: Final, subject to market feedback

## D009: Multi-Tenant Architecture — Shared Gateway

- **Date**: 2026-03-12
- **Context**: Need cost-efficient hosting that scales
- **Decision**: 10-15 agents per Railway instance, scale by adding instances
- **Status**: Final

## D010: Positioning — Force Multiplier

- **Date**: 2026-03-12
- **Context**: "AI replaces your employee" creates resistance. Need honest, positive framing
- **Decision**: "AI assistant that makes your admin 3-4x more productive" — 1 person + BizPilot = productivity of 3-4 people
- **Status**: Final

## D011: Security — First-Class Priority

- **Date**: 2026-03-12
- **Context**: BizPilot handles sensitive business data (customer PII, Facebook tokens, product catalogs, leads). A breach would destroy trust and the business
- **Decision**: Security is considered at every step — code, architecture, dependencies, deployment
- **Principles**:
  - Least privilege for all API tokens and permissions
  - Secrets in environment variables, never in code or logs
  - Supabase RLS on every table, no exceptions
  - Facebook/channel tokens encrypted at rest, scoped minimally
  - Dependency audit before adding, upstream review before merging
  - OWASP top 10 checks on every code change
  - Input validation at all system boundaries
  - Proactively flag security concerns, don't wait to be asked
- **Status**: Permanent — applies to all future decisions

## D012: Separate Supabase Project

- **Date**: 2026-03-12
- **Context**: Already had an existing Supabase project (bdsx). Could reuse or create new
- **Decision**: Create separate `bizpilot` project — separate credentials, clean schema, no data leakage risk
- **Alternatives rejected**: Reuse existing project (shared credentials, risk of accidental data exposure)
- **Status**: Final

## D013: Agent Uses Service Role Key

- **Date**: 2026-03-12
- **Context**: Need to decide how the OpenClaw agent accesses Supabase — anon key (with RLS) or service role (bypasses RLS)
- **Decision**: Service role key for the agent backend (it manages all tenants). Anon key reserved for future web dashboard (per-tenant access)
- **Risk mitigation**: Service role key stored in env vars only, never in code or logs
- **Status**: Final
