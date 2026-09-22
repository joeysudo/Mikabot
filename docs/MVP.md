# Mika MVP

Mika is an independently runnable marketing agent workspace. Chopper can later submit a brief and review Mika's artifacts through the same API used by this UI.

## First user and promise

One business owner manages Instagram, Facebook, LinkedIn and X in one private workspace: turn a marketing goal into a weekly plan, adapt each caption, review the exact destination and content, then publish explicitly.

## Included

- Weekly calendar, searchable content library and review queue.
- Editable brand brief: offering, audience, tone, goal and approved facts.
- Mika plan generation: optional server-side model; clearly labelled structured starter templates when no model is configured.
- Separate captions for all four channels; image URL for Instagram; text publishing for Facebook Pages, LinkedIn members and X.
- Persistent drafts, target dates, revision-based approvals and activity history.
- OAuth account connection, connection readiness, expiry visibility and local disconnect.
- Guided account creation: draft a profile bio, open the official signup page, return to connect. No passwords, identity details or verification codes collected by Mika.
- Publish one destination at a time, with explicit confirmation. Persist provider acknowledgement and prevent duplicate submissions of the same approved revision.
- Export content as JSON for portability.

## Explicit boundaries

- One private workspace per deployment, not a public multi-tenant SaaS.
- Calendar dates are editorial plans, not background scheduled publishing. UI must say this.
- No automatic signups, CAPTCHA handling, identity verification or credential collection.
- No paid ads, inbox, replies, follower analytics or invented performance metrics.
- No video, carousel, Stories or LinkedIn organization publishing in v0.1.
- No automatic retry after an ambiguous publishing response. Check the platform before resolving an uncertain attempt.
- Provider app credentials and necessary access approvals are deployment prerequisites, not included accounts.
- No real personal data or credentials are committed to this repository.

## Acceptance criteria

1. Create a draft, reload, edit and retrieve the same content.
2. Create a plan for selected platforms; generated drafts remain unapproved.
3. Editing approved content invalidates approval.
4. A disconnected/unconfigured destination never reports a successful publish.
5. Forged, expired or reused OAuth state is rejected.
6. Repeated publish requests cannot create two concurrent sends for one revision/destination.
7. API routes require workspace access and same-origin writes.
8. Publication is successful only after the provider returns a remote post ID.

## Implementation sequence

1. Independent workspace and persistent domain model.
2. Content planning, calendar, editor, channel preview and review workflow.
3. OAuth provider adapters and explicit publication pipeline.
4. Focused workflow/security tests, production build, documentation and GitHub publication.

## Later

Background scheduling with token refresh and reconciliation; media library; analytics; multi-business membership and roles; Chopper orchestration. Preserve the `brief -> plan -> drafts -> approval -> execution -> evidence` boundary.

## Updated priority: agentic Mika (v0.2)

The owner clarified that the primary product is a daily marketing/communication agent, not a content planner. The implementation now leads with account monitoring, context-aware decisions, inspectable skills/evidence, routine FAQ auto-replies and an exception inbox. Discord, Telegram, WhatsApp, SMS and Email join the original four social channels through the adapters documented in AGENT.md.

Content planning remains available. Its original publishing boundary is unchanged. Agent replies have a separate explicit per-account automatic mode; default is paused. The daily scheduler is shipped as code, not activated against any live account. LinkedIn comment monitoring remains unavailable under the self-serve permissions used in this MVP.
