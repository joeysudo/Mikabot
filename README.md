# Mika ✳

**Your agent. On your side.**

Mika is an independent marketing and communication agent workspace. It monitors connected conversations, reads context, checks approved knowledge, prepares or sends eligible replies, and brings exceptions back to the owner. A content calendar, multi-channel composer and explicit publishing workflow sit alongside the agent.

![Mika — Your social, together.](public/og.png)

## What works in this MVP

- **Mika overview:** manual monitoring checks, run history, bounded coverage, exceptions and local audience-interest signals.
- **Setup-first onboarding:** the workspace starts by connecting an existing account or asking Mika to prepare a consistent account kit across all nine channels. Account verification and terms remain with the owner.
- **Attention inbox:** inspect each message, parent context, executed skills, evidence, decision and proposed reply. Revise with Mika when AI is configured, or edit manually.
- **Account rules:** paused, observe, draft-and-review, or explicitly approved FAQ auto-replies; per-account daily limits and conversation cooldowns.
- **Skills & knowledge:** an inspectable seven-step skill pipeline and an owner-approved FAQ library.
- **Content workspace:** weekly calendar, search, draft editing, platform captions, reviews, revision-specific approval and JSON export.
- **Account onboarding:** in-app developer setup for Instagram/Facebook/LinkedIn/X, exact OAuth callbacks and scopes, encrypted account connections, profile/recent-content sync, plus Gemini-assisted names, bios and checklists for every supported channel. Bot, Twilio and Gmail adapters use deployment-side configuration.
- **Durable data:** SQLite/D1-backed state, encrypted social access tokens, signed workspace sessions, same-origin mutation checks and durable delivery claims.
- **Daily job:** a separate scheduled Cloudflare Worker invoking the same monitoring loop as the UI.

## Channel support

| Channel   | Content publishing                      | Monitoring and replies                                                           |
| --------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| Instagram | Single-image professional-account posts | Recent post comments + replies; incomplete context requires owner review         |
| Facebook  | Page text posts                         | Recent Page comments + replies                                                   |
| LinkedIn  | Member text posts                       | **Not enabled** with self-serve permissions; additional approved access required |
| X         | Text posts                              | Recent mentions + reply posts; partial threads require review                    |
| Discord   | —                                       | Allowlisted channels through a bot                                               |
| Telegram  | —                                       | Allowlisted bot chats through polling                                            |
| WhatsApp  | —                                       | Twilio inbound messages and replies inside the service window                    |
| SMS       | —                                       | Twilio inbound messages and replies                                              |
| Email     | —                                       | Gmail inbox monitoring and threaded replies                                      |

These are implemented adapters, **not preconnected accounts**. Live provider flows require developer credentials, account eligibility, user consent and sometimes platform review or a paid API plan. Consumer platforms do not provide a general API for creating personal accounts; Mika prepares the profile and guides the user through the platform-owned signup and verification. Code-level tests use synthetic fixtures; live provider certification remains to be done with an authorized test account.

## Run locally

Use Node 22.13+ (Node 24 LTS recommended) and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5180. The local Workers runtime persists data under ignored `.wrangler/`. The initial workspace is empty: no personal data, fictional performance metrics or simulated connected accounts. Use **Try the decision trail** to run a clearly marked synthetic scenario.

Local development permits anonymous access only on loopback when the dev runtime flag is present and no hosted origin/password is configured. Production builds do not enable that flag. Do not expose the development server publicly.

## Configure real connections

Copy `.env.example` to **`.dev.vars`** for the local Cloudflare runtime, then configure your own values. Hosted values belong in secret management, not Git.

- `APP_ORIGIN`: exact trusted origin; HTTPS outside loopback.
- `WORKSPACE_PASSWORD`: at least 16 characters for the private single-owner workspace.
- `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`: separate random values, at least 32 characters each.
- Social app credentials: see [platform setup](docs/PLATFORMS.md).
- Discord/Telegram/Twilio/Gmail: see [agent setup](docs/AGENT.md).
- `GEMINI_API_KEY`: preferred server-only AI configuration. Set `GEMINI_BACKEND=gemini-api` for an AI Studio Gemini API key or `vertex-express` for an Agent Platform Express Mode key, and choose an available `GEMINI_MODEL`.
- `OPENAI_API_KEY` and `OPENAI_MODEL`: optional fallback AI configuration when Gemini is absent. The UI explicitly identifies templates when no model is configured. Review your provider's data controls before sending business context.

Changing the encryption key makes old connected tokens unreadable; reconnect those accounts. One deployment is one private workspace, not a public multi-tenant SaaS. Full user membership, roles, OAuth onboarding for Gmail and operational observability are future work.

## Agentic behavior and approval boundary

The loop is `observe → context → risk → knowledge → interests → reply → policy → execute/evidence`. An automatic reply must match an approved FAQ exactly after normalization, be recent, have adequate context, stay within the account's explicit mode and quota, and pass suppression/cooldown checks. All generated replies require review. Sensitive cases are escalated. Drafts and external messages cannot grant themselves permission to send.

The **decision trail** shows observable skill execution, source references and concise reasons. It does not expose or claim to expose private model chain of thought. Audience signals describe repeated English words in a bounded recent message sample, not global trends.

Uncertain delivery is held for reconciliation. Do not retry blindly after a network timeout. Provider acknowledgement means accepted, not necessarily delivered or read. Real sends can incur provider costs.

Calendar dates are **editorial plans**, not an automatic publishing queue. The daily monitoring job is separate from content scheduling. Register the included worker against the same database to run daily; a local preview does not run in the background. See [scheduler instructions](docs/AGENT.md#daily-monitoring).

## Validate

```sh
npm run typecheck
npm test
npm run build
```

Tests exercise persistence, stale-write protection, approval invalidation, disconnected publication, same-origin access, signed sessions, encrypted tokens, OAuth state binding/replay rejection, FAQ gating, opt-outs, simulation isolation and concurrent delivery claims.

The web app is built with React, Vinext/Vite and Cloudflare-compatible Workers. Raw SQLite prepared statements define the schema in `db/schema.ts`; SQL snapshots are under `db/migrations/`. The same schema is initialized idempotently at runtime. For deployment, provision a D1 database, apply that schema and supply its binding as `DB`. The separate monitoring Worker config intentionally contains a placeholder database ID.

## Project map

- `app/components/AgentHub.tsx`: overview, attention inbox, rules and skills.
- `app/components/AccountOnboarding.tsx`: setup-first connect-or-create flow.
- `lib/ai.ts` and `lib/accountKit.ts`: AI provider routing and Gemini account-kit generation.
- `lib/agent/`: independent decision engine, monitoring loop and communication adapters.
- `lib/providers.ts`: social OAuth and original-post publishing adapters.
- `lib/api.ts`: authenticated workspace API and revision-based publishing pipeline.
- `db/`: durable schema and SQL snapshots.
- `workers/monitor.ts`: scheduled agent execution.
- [MVP scope](docs/MVP.md) · [Agent details](docs/AGENT.md) · [Platform setup](docs/PLATFORMS.md)

Mika can later be integrated into Chopper through these same task and artifact boundaries. No Chopper or Uxi files are required to run this repository.
