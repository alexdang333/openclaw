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
