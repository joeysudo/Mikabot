# Mika agent runtime (v0.2 MVP)

Mika is a monitoring and response agent with a content workspace attached. Its main loop is:

1. Poll explicitly enabled accounts using official adapters.
2. Normalize and deduplicate messages by account + external message ID.
3. Retrieve the parent context and up to 12 recent stored messages in the conversation.
4. Screen for opt-outs, complaints, sensitive requests and instruction injection.
5. Retrieve an exact owner-approved FAQ; inspect recurring local audience topics.
6. Prepare a grounded answer. AI-assisted drafts always require human review.
7. Enforce per-account mode, fresh context, a rolling 24-hour reply budget and conversation cooldown.
8. Send eligible approved FAQ replies; escalate exceptions into the attention inbox.
9. Record observable skill steps, evidence references and provider acknowledgements.

The decision trail contains actions, observations, policy checks and concise explanations. It is not a model's private chain of thought. There is no claim that a keyword rule is a complete safety classifier.

## Accounts and modes

Every account starts **paused**. `observe` reads and records without replying. `assist` prepares reviewed replies. `auto` can send exact approved FAQ answers only, after explicit per-account opt-in. Generated answers are never automatically sent in this MVP. Daily limits range from 1 to 10 sends; automatic replies have a 24-hour per-conversation cooldown. Opt-outs suppress the conversation. Do not enable unattended use before checking your own policies and provider permissions.

| Channel   | Implemented adapter                                       | Requirements / limits                                                                                                  |
| --------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Instagram | Read own recent post comments; reply to a comment         | Professional account linked to Page; Meta comment permissions; partial/truncated context goes to owner                 |
| Facebook  | Read recent Page comments; reply to a comment             | Page permission incl. `pages_manage_engagement`; partial context goes to owner                                         |
| LinkedIn  | OAuth + text publishing                                   | Comment monitoring is explicitly unavailable with the self-serve access used here; additional approved access required |
| X         | Recent mentions + reply posts                             | OAuth, API access tier; incomplete public threads require review                                                       |
| Discord   | Poll allowlisted channels and reply as bot                | Bot token, Message Content access, read/send permissions; up to 5 channels × 50 recent messages                        |
| Telegram  | `getUpdates` for allowlisted chats; `sendMessage` replies | Bot token + chat allowlist; no competing webhook or poller; up to 100 pending updates                                  |
| WhatsApp  | Twilio inbound polling + reply                            | Approved Twilio WhatsApp sender, correct `whatsapp:` sender; free-form replies limited to 24h after inbound            |
| SMS       | Twilio inbound polling + reply                            | Twilio number; replies only to inbound conversation; STOP/opt-outs suppressed                                          |
| Email     | Gmail inbox polling + threaded replies                    | OAuth app with Gmail read/send scopes and refresh token; bulk/automated mail excluded; max 20 recent messages          |

Connector readiness means required configuration exists, not that live authorization was tested. Run coverage records disclose bounded sampling and errors; this is not an exhaustive archive of every account. Existing social tokens must be reauthorized after adding comment permissions. Incoming messages are treated as untrusted data, never execution instructions.

## Daily monitoring

`workers/monitor.ts` contains the scheduled handler. `wrangler.agent.jsonc` contains a daily `0 23 * * *` UTC cron (09:00 Melbourne standard time, 10:00 daylight time). It must point to the **same D1 database as the web application** and receive the same relevant secrets. The included placeholder database ID deliberately prevents accidental deployment to an unrelated database.

After configuring your own Cloudflare deployment:

```sh
npx wrangler deploy --config wrangler.agent.jsonc
```

Set `AGENT_SCHEDULER_ENABLED=true` on the web app only after successful scheduler deployment. That flag is a declaration, not a health check; inspect run timestamps. Local preview does not schedule anything. The authenticated `POST /api/agent/run` runs the same loop manually. A global lease prevents overlapping runs; per-account delivery leases and persistent claims prevent concurrent duplicate sends. Up to 30 unprocessed messages are analyzed per check; at most 3 new AI drafts are requested per run. Telegram retains pending updates for a limited period; a daily check can miss updates during downtime. Frequent polling and durable queue ingestion are the next production step.

## New adapter configuration

- Discord: create an application/bot, enable appropriate intents, install it only in intended servers, set `DISCORD_BOT_TOKEN` and comma-separated `DISCORD_CHANNEL_IDS`.
- Telegram: create a bot through the official BotFather flow, set `TELEGRAM_BOT_TOKEN` and explicit comma-separated `TELEGRAM_CHAT_IDS`. Registering a bot is a user action; Mika does not create personal Telegram accounts.
- SMS/WhatsApp: set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `SMS_FROM` and/or `WHATSAPP_FROM`. Polling uses authenticated Twilio APIs, not an unsigned inbound webhook. Messaging can incur provider charges.
- Email: obtain a Gmail OAuth refresh token with `gmail.readonly` and `gmail.send` scopes and configure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. v0.2 supports one configured mailbox. Full in-app Gmail OAuth onboarding is follow-up work.
- Provider credentials are environment secrets; never commit them, paste them into brand context or include them in fixtures. Bot and mailbox setup currently uses deployment configuration, not a simulated Connect button.

## Recovery and evidence

Provider acknowledgement means accepted, not read or necessarily delivered. Ambiguous network outcomes remain uncertain and cannot be resent automatically. A crash after sending leaves a durable claim, intentionally blocking duplicate delivery. For agent replies this MVP requires operator reconciliation outside the automated loop; no reset endpoint is exposed. Draft publication has a separate explicit owner-reconciliation flow.

Simulation messages are synthetic, marked in the UI, and blocked at the outbound adapter even if a request is forged. No connected accounts, real messages or secrets are seeded.

## Audience interests and knowledge

Audience signals count repeated English words in up to 200 stored messages from the last 7 days, with source references. They are not a global trends feed, sentiment measurement, or evidence that a topic causes engagement. Non-English semantic topic discovery and authenticated external trend sources are future work.

Approved FAQ matching is deliberately exact after punctuation/case normalization. It provides a dependable narrow automated path while larger language-model decisions stay reviewable. Skill implementations are inspectable modules, not arbitrary untrusted code plugins.

## Official references checked during implementation

- Discord messages/intents: https://docs.discord.com/developers/resources/message
- Telegram Bot API: https://core.telegram.org/bots/api
- Twilio messages: https://www.twilio.com/docs/messaging/api/message-resource
- Gmail list: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- Gmail replies: https://developers.google.com/workspace/gmail/api/guides/sending
- X OAuth: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- Meta API collections: https://www.postman.com/meta/instagram/overview
