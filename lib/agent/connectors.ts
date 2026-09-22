import type { Env } from "../db";
import { providerFetch, ProviderError } from "../providers";
import { unseal, encode } from "../security";
import {
  channels,
  channelNames,
  type Connection,
  type Inbound,
  type Channel,
  type AgentPolicy,
} from "./types";
export const setting = (env: Env, key: string) => String(env[key] || "");
// Platform response shapes differ; use only the checked fields below and never log raw responses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(url: string, init: RequestInit = {}): Promise<any> {
  return (await providerFetch(url, init)).json();
}
function auth(token: string) {
  return { Authorization: "Bearer " + token };
}
function bot(env: Env) {
  return "https://api.telegram.org/bot" + setting(env, "TELEGRAM_BOT_TOKEN");
}
function twilio(env: Env) {
  return {
    root: `https://api.twilio.com/2010-04-01/Accounts/${setting(env, "TWILIO_ACCOUNT_SID")}`,
    headers: {
      Authorization:
        "Basic " +
        btoa(
          setting(env, "TWILIO_ACCOUNT_SID") +
            ":" +
            setting(env, "TWILIO_AUTH_TOKEN"),
        ),
    },
  };
}
async function gmailToken(env: Env) {
  const data = await get("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: setting(env, "GMAIL_CLIENT_ID"),
      client_secret: setting(env, "GMAIL_CLIENT_SECRET"),
      refresh_token: setting(env, "GMAIL_REFRESH_TOKEN"),
    }),
  });
  if (!data.access_token)
    throw new Error("Gmail authorization is unavailable.");
  return String(data.access_token);
}
export async function connections(env: Env): Promise<Connection[]> {
  const policies = await env.DB.prepare(
    "SELECT account_key,data FROM agent_policies",
  ).all<{ account_key: string; data: string }>();
  const policy = (key: string): AgentPolicy => {
    const v = policies.results.find((x) => x.account_key === key);
    return v
      ? JSON.parse(v.data)
      : { accountKey: key, mode: "paused", maxReplies: 5 };
  };
  const social = await env.DB.prepare(
    "SELECT id,platform,label,expires_at FROM accounts",
  ).all<{ id: string; platform: Channel; label: string; expires_at: number }>();
  const out: Connection[] = social.results.map((a) => ({
    key: a.id,
    channel: a.platform,
    label: a.label,
    ready: a.platform !== "linkedin" && a.expires_at > Date.now(),
    capability:
      a.platform === "linkedin"
        ? "Publishing only. Comment monitoring requires separately approved LinkedIn access."
        : a.platform === "x"
          ? "Recent mentions · API access required"
          : "Recent post comments · comment permissions required",
    policy: policy(a.id),
  }));
  for (const p of channels.slice(0, 4))
    if (!social.results.some((s) => s.platform === p))
      out.push({
        key: p + ":unconnected",
        channel: p,
        label: channelNames[p],
        ready: false,
        capability: "Connect this account in Publishing channels.",
        policy: policy(p + ":unconnected"),
      });
  const extras: Array<[Channel, boolean, string]> = [
    [
      "discord",
      Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_IDS),
      "Allowlisted server channels · bot access",
    ],
    [
      "telegram",
      Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_IDS),
      "Allowlisted bot chats · polling (no webhook)",
    ],
    [
      "whatsapp",
      Boolean(
        env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.WHATSAPP_FROM,
      ),
      "Twilio WhatsApp Business · inbound replies within 24h",
    ],
    [
      "sms",
      Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.SMS_FROM),
      "Twilio number · reply to inbound messages",
    ],
    [
      "email",
      Boolean(
        env.GMAIL_CLIENT_ID &&
        env.GMAIL_CLIENT_SECRET &&
        env.GMAIL_REFRESH_TOKEN,
      ),
      "Gmail mailbox · inbound thread replies",
    ],
  ];
  for (const [p, ready, capability] of extras)
    out.push({
      key: p + ":default",
      channel: p,
      label: channelNames[p],
      ready,
      capability,
      policy: policy(p + ":default"),
    });
  return out;
}
export type PollResult = {
  messages: Inbound[];
  coverage: string;
  offset?: { key: string; value: string };
};
export async function poll(c: Connection, env: Env): Promise<PollResult> {
  const messages: Inbound[] = [];
  const add = (
    externalId: string,
    threadId: string,
    text: string,
    time: string,
    context: string,
    route: Record<string, string>,
  ) => {
    if (!externalId || !text || !Number.isFinite(Date.parse(time))) return;
    messages.push({
      id: c.key + ":" + externalId,
      accountKey: c.key,
      channel: c.channel,
      externalId,
      threadId,
      text: text.slice(0, 12000),
      context:
        context.length > 8000
          ? "Partial truncated context. " + context.slice(0, 7900)
          : context,
      occurredAt: time,
      route,
    });
  };
  if (c.channel === "discord") {
    for (const id of setting(env, "DISCORD_CHANNEL_IDS")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => /^\d+$/.test(x))
      .slice(0, 5)) {
      const data = await get(
        `https://discord.com/api/v10/channels/${id}/messages?limit=50`,
        {
          headers: {
            Authorization: "Bot " + setting(env, "DISCORD_BOT_TOKEN"),
          },
        },
      );
      for (const m of data.reverse()) {
        if (m.author?.bot || m.webhook_id) continue;
        add(
          String(m.id),
          id,
          m.content || "",
          m.timestamp,
          m.referenced_message?.content || "",
          { channelId: id, messageId: String(m.id) },
        );
      }
    }
    return {
      messages,
      coverage:
        "Latest 50 messages per allowlisted channel (up to five). Message Content access required.",
    };
  }
  if (c.channel === "telegram") {
    const saved = await env.DB.prepare(
      "SELECT value FROM agent_offsets WHERE key='telegram'",
    ).first<{ value: string }>();
    const result = await get(
      bot(env) +
        "/getUpdates?limit=100&timeout=0" +
        (saved ? "&offset=" + encodeURIComponent(saved.value) : ""),
    );
    if (!result.ok)
      throw new Error(
        "Telegram polling failed. Disable any webhook or other polling consumer.",
      );
    const allowed = setting(env, "TELEGRAM_CHAT_IDS")
      .split(",")
      .map((x) => x.trim());
    let offset = Number(saved?.value || 0);
    for (const u of result.result || []) {
      offset = Math.max(offset, Number(u.update_id) + 1);
      const m = u.message;
      if (!m?.text || m.from?.is_bot || !allowed.includes(String(m.chat.id)))
        continue;
      add(
        String(m.chat.id) + ":" + m.message_id,
        String(m.chat.id),
        m.text,
        new Date(m.date * 1000).toISOString(),
        m.reply_to_message?.text || "",
        { chatId: String(m.chat.id), messageId: String(m.message_id) },
      );
    }
    return {
      messages,
      offset: { key: "telegram", value: String(offset) },
      coverage:
        "Up to 100 pending updates; Telegram retains updates for a limited time. Frequent polling is recommended.",
    };
  }
  if (c.channel === "sms" || c.channel === "whatsapp") {
    const t = twilio(env),
      from = setting(env, c.channel === "sms" ? "SMS_FROM" : "WHATSAPP_FROM");
    const u = new URL(t.root + "/Messages.json");
    u.searchParams.set("To", from);
    u.searchParams.set("PageSize", "100");
    u.searchParams.set(
      "DateSent>",
      new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    );
    const data = await get(u.toString(), { headers: t.headers });
    for (const m of data.messages || []) {
      if (m.direction !== "inbound" || m.to !== from) continue;
      add(
        m.sid,
        m.from,
        m.body || "",
        new Date(m.date_sent).toISOString(),
        "",
        { to: m.from, from },
      );
    }
    return {
      messages,
      coverage:
        "Latest 100 inbound messages in the recent date window. High-volume inboxes need pagination.",
    };
  }
  if (c.channel === "email") {
    const token = await gmailToken(env),
      headers = auth(token);
    const list = await get(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=" +
        encodeURIComponent("in:inbox newer_than:1d -category:promotions"),
      { headers },
    );
    for (const entry of list.messages || []) {
      const m = await get(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${entry.id}?format=full`,
        { headers },
      );
      const hs = m.payload?.headers || [];
      const header = (key: string) =>
        String(
          hs.find(
            (h: { name: string }) => h.name.toLowerCase() === key.toLowerCase(),
          )?.value || "",
        );
      if (
        (header("Auto-Submitted") && header("Auto-Submitted") !== "no") ||
        header("List-Id") ||
        /bulk|list|junk/i.test(header("Precedence"))
      )
        continue;
      const parts = [m.payload, ...(m.payload?.parts || [])];
      const part = parts.find(
        (p) => p?.mimeType === "text/plain" && p.body?.data,
      );
      let text = m.snippet || "";
      if (part) {
        try {
          text = new TextDecoder().decode(
            Uint8Array.from(
              atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/")),
              (v) => v.charCodeAt(0),
            ),
          );
        } catch {
          /* Retain provider snippet and disclose it in context. */
        }
      }
      add(
        m.id,
        m.threadId,
        text,
        new Date(Number(m.internalDate)).toISOString(),
        "Subject: " +
          header("Subject") +
          (part ? "" : " · Snippet only; full body not available."),
        {
          threadId: m.threadId,
          to: header("From"),
          subject: header("Subject"),
          messageId: header("Message-ID"),
        },
      );
    }
    return {
      messages,
      coverage:
        "Latest 20 recent inbox messages; excludes bulk, automated and promotional mail. Plain text or provider snippet.",
    };
  }
  const a = await env.DB.prepare(
    "SELECT remote_id,secret,expires_at FROM accounts WHERE id=?",
  )
    .bind(c.key)
    .first<{ remote_id: string; secret: string; expires_at: number }>();
  if (!a || a.expires_at < Date.now())
    throw new Error("Reconnect this account.");
  const token = await unseal(a.secret, env),
    headers = auth(token);
  if (c.channel === "x") {
    const data = await get(
      `https://api.x.com/2/users/${a.remote_id}/mentions?max_results=25&tweet.fields=created_at,conversation_id,author_id`,
      { headers },
    );
    for (const m of data.data || []) {
      if (m.author_id === a.remote_id) continue;
      add(
        m.id,
        m.conversation_id || m.id,
        m.text,
        m.created_at,
        "Recent mention. The complete public thread has not been fetched.",
        { messageId: m.id },
      );
    }
    return {
      messages,
      coverage:
        "Latest 25 mentions. Partial thread context; review-only when context is incomplete.",
    };
  }
  if (c.channel === "facebook" || c.channel === "instagram") {
    const root =
      "https://graph.facebook.com/" +
      (setting(env, "META_API_VERSION") || "v26.0");
    const ig = c.channel === "instagram";
    const posts = await get(
      `${root}/${a.remote_id}/${ig ? "media" : "posts"}?fields=id,${ig ? "caption" : "message"}&limit=10`,
      { headers },
    );
    const profile = ig
      ? await get(`${root}/${a.remote_id}?fields=username`, { headers })
      : null;
    for (const post of posts.data || []) {
      const fields = ig
        ? "id,text,timestamp,username,replies.limit(20){id,text,timestamp,username}"
        : "id,message,created_time,from,comments.limit(20){id,message,created_time,from}";
      const cs = await get(
        `${root}/${post.id}/comments?fields=${encodeURIComponent(fields)}&limit=25`,
        { headers },
      );
      const partial =
        Boolean(cs.paging?.next) ||
        (cs.data || []).some(
          (m: {
            replies?: { paging?: { next?: string } };
            comments?: { paging?: { next?: string } };
          }) => Boolean(m.replies?.paging?.next || m.comments?.paging?.next),
        );
      const transcript = (cs.data || [])
        .map(
          (m: {
            text?: string;
            message?: string;
            replies?: { data?: Array<{ text?: string }> };
            comments?: { data?: Array<{ message?: string }> };
          }) =>
            [
              m.text || m.message,
              ...(m.replies?.data || m.comments?.data || []).map(
                (r: { text?: string; message?: string }) => r.text || r.message,
              ),
            ]
              .filter(Boolean)
              .join("\n"),
        )
        .join("\n");
      const context =
        (partial
          ? "Partial thread context. "
          : "Retrieved parent post and returned comment thread. ") +
        (post.caption || post.message || "") +
        "\n" +
        transcript;
      for (const m of cs.data || []) {
        if (
          m.from?.id === a.remote_id ||
          (ig && m.username === profile?.username)
        )
          continue;
        add(
          m.id,
          post.id,
          ig ? m.text : m.message,
          ig ? m.timestamp : m.created_time,
          context,
          { commentId: m.id },
        );
      }
    }
    return {
      messages,
      coverage:
        "Up to 10 recent posts × 25 top-level comments, including up to 20 nested replies per comment. Pagination or truncated context requires review.",
    };
  }
  throw new Error("Monitoring is not available for this channel yet.");
}
export async function sendReply(
  m: Inbound,
  text: string,
  env: Env,
): Promise<string> {
  if (m.demo) throw new Error("Simulations cannot send replies.");
  if (!text.trim()) throw new Error("A reply is required.");
  const j = (payload: unknown) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (m.channel === "discord") {
    if (text.length > 2000) throw new ProviderError(400, false);
    const opts = j({
      content: text,
      message_reference: { message_id: m.route.messageId },
      allowed_mentions: { parse: [], replied_user: false },
    });
    Object.assign(opts.headers, {
      Authorization: "Bot " + setting(env, "DISCORD_BOT_TOKEN"),
    });
    const data = await get(
      `https://discord.com/api/v10/channels/${m.route.channelId}/messages`,
      opts,
    );
    if (!data.id) throw new ProviderError(0, true);
    return data.id;
  }
  if (m.channel === "telegram") {
    if (text.length > 4096) throw new ProviderError(400, false);
    const data = await get(
      bot(env) + "/sendMessage",
      j({
        chat_id: m.route.chatId,
        text,
        reply_parameters: { message_id: Number(m.route.messageId) },
      }),
    );
    if (!data.ok || !data.result?.message_id) throw new ProviderError(0, true);
    return String(data.result.message_id);
  }
  if (m.channel === "sms" || m.channel === "whatsapp") {
    if (
      m.channel === "whatsapp" &&
      Date.now() - Date.parse(m.occurredAt) >= 86400000
    )
      throw new ProviderError(400, false);
    if (text.length > 1500) throw new ProviderError(400, false);
    const t = twilio(env);
    const data = await get(t.root + "/Messages.json", {
      method: "POST",
      headers: {
        ...t.headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: m.route.from,
        To: m.route.to,
        Body: text,
      }),
    });
    if (!data.sid) throw new ProviderError(0, true);
    return data.sid;
  }
  if (m.channel === "email") {
    if (/[\r\n]/.test(m.route.to + m.route.subject + m.route.messageId))
      throw new ProviderError(400, false);
    const addr = m.route.to.match(/<([^<>]+)>/)?.[1] || m.route.to;
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(addr))
      throw new ProviderError(400, false);
    const subject =
      "=?UTF-8?B?" +
      btoa(
        String.fromCharCode(
          ...new TextEncoder().encode(
            "Re: " + m.route.subject.replace(/^Re:\s*/i, ""),
          ),
        ),
      ) +
      "?=";
    const raw = `To: ${addr}\r\nSubject: ${subject}\r\nIn-Reply-To: ${m.route.messageId}\r\nReferences: ${m.route.messageId}\r\nAuto-Submitted: auto-replied\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}`;
    const opts = j({
      raw: encode(new TextEncoder().encode(raw)),
      threadId: m.route.threadId,
    });
    Object.assign(opts.headers, auth(await gmailToken(env)));
    const data = await get(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      opts,
    );
    if (!data.id) throw new ProviderError(0, true);
    return data.id;
  }
  const a = await env.DB.prepare(
    "SELECT secret,expires_at FROM accounts WHERE id=?",
  )
    .bind(m.accountKey)
    .first<{ secret: string; expires_at: number }>();
  if (!a || a.expires_at < Date.now()) throw new ProviderError(401, false);
  const headers = auth(await unseal(a.secret, env));
  let url: string, payload: unknown;
  if (m.channel === "x") {
    url = "https://api.x.com/2/tweets";
    payload = { text, reply: { in_reply_to_tweet_id: m.route.messageId } };
  } else if (m.channel === "instagram" || m.channel === "facebook") {
    url = `https://graph.facebook.com/${setting(env, "META_API_VERSION") || "v26.0"}/${m.route.commentId}/${m.channel === "instagram" ? "replies" : "comments"}`;
    payload = { message: text };
  } else throw new ProviderError(400, false);
  const opts = j(payload);
  Object.assign(opts.headers, headers);
  const data = await get(url, opts);
  const id = data.id || data.data?.id;
  if (!id) throw new ProviderError(0, true);
  return String(id);
}
