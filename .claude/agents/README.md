# Agent team for mediamixmodeling

These are Claude Code subagents (`.claude/agents/*.md`) modeling a development team for this app. Each has a scoped system prompt, tool access, and clear file/directory ownership so work can be delegated without agents stepping on each other.

## Roles

| Agent | Owns | Model |
|---|---|---|
| `product-owner` | Scope, priorities, cross-agent conflicts. Read-only — decides what, not how. | opus |
| `mmm-statistician` | `packages/mmm-core`, `worker/mmm_worker` — the Bayesian MMM (PyMC), adstock/saturation, ROI/attribution, scenario math | opus |
| `ai-chat-engineer` | `lib/anthropic/*`, `lib/wizard/*`, `components/wizard` — conversational wizard, Claude API prompts, client-facing summaries | opus |
| `frontend-engineer` | `app/*`, dashboard/chart components, `lib/chartTheme.ts` — turning model output into a usable UI | sonnet |
| `backend-platform-engineer` | `lib/supabase`, `supabase/migrations`, `lib/jobs.ts`, `app/api`, worker deployment/adapters | sonnet |
| `data-engineer` | `lib/dataProfile.ts`, `lib/eda.ts`, ingestion & data-quality checks, `demo_data/*` | sonnet |
| `qa-devops` | Test coverage (`worker/tests`, typecheck/lint), regression review, especially at agent boundaries | sonnet |

## Why a product owner with no write access

With several specialist agents working on the same app, the biggest risk isn't bad code from any one of them — it's scope drift and un-coordinated contract changes between them (e.g. the statistician changes what the worker returns and breaks the dashboard silently). `product-owner` has read-only tools on purpose: its job is to scope requests, catch drift, and arbitrate conflicts, not to implement. Route ambiguous or cross-cutting requests through it first; route small, concrete, single-owner tasks straight to the relevant specialist.

## Handoff pattern

Each agent's file ends with a **Handoffs** section naming which other agent owns adjacent concerns. When a change touches a shared contract (worker output shape, API route response, wizard phase state, column-mapping output), the owning agent should flag it explicitly rather than let the consuming agent discover it broken.
