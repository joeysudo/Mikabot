"use client";
import { useCallback, useEffect, useState } from "react";
import {
  channelNames,
  skillCatalog,
  type AgentItem,
  type Connection,
  type FAQ,
} from "../../lib/agent/types";
type Run = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  read: number;
  processed: number;
  replied: number;
  needsYou: number;
  channels: Array<{ account: string; status: string; detail: string }>;
};
type AgentState = {
  connections: Connection[];
  items: AgentItem[];
  faqs: FAQ[];
  runs: Run[];
  signals: Array<{
    topic: string;
    count: number;
    sources: string[];
    window: string;
  }>;
  schedule: string;
  aiReady: boolean;
  aiProvider: string | null;
};
type View = "agent" | "inbox" | "skills" | "accounts";
export default function AgentHub({
  view,
  onChannels,
}: {
  view: View;
  onChannels: () => void;
}) {
  const [data, setData] = useState<AgentState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [reply, setReply] = useState(""),
    [note, setNote] = useState(""),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [approved, setApproved] = useState(false),
    [showAll, setShowAll] = useState(false),
    [demoText, setDemoText] = useState("Can I get a refund?"),
    [confirmSend, setConfirmSend] = useState(false);
  const api = useCallback(async (path = "", method = "GET", body?: unknown) => {
    const r = await fetch("/api/agent" + path, {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const x = (await r.json()) as AgentState & {
      error?: string;
      item: AgentItem;
    };
    if (!r.ok)
      throw new Error(x.error || "Mika could not complete that action.");
    return x;
  }, []);
  const load = useCallback(async () => {
    const next = await api();
    setData(next);
    return next;
  }, [api]);
  useEffect(() => {
    let active = true;
    api()
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api]);
  async function act(task: () => Promise<void>, message = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
      await load();
      if (message) setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const item = data?.items.find((i) => i.id === selected);
  const needs =
    data?.items.filter((i) =>
      ["review", "uncertain", "failed", "ready", "sending"].includes(i.status),
    ) || [];
  const visible = showAll ? data?.items || [] : needs;
  const select = (i: AgentItem) => {
    setSelected(i.id);
    setReply(i.decision.reply);
    setNote("");
    setConfirmSend(false);
  };
  async function policy(
    c: Connection,
    mode: Connection["policy"]["mode"],
    maxReplies = c.policy.maxReplies,
  ) {
    if (
      mode === "auto" &&
      !window.confirm(
        `Allow Mika to automatically reply on ${c.label}? Only exact approved FAQ matches qualify. Up to ${maxReplies} replies per 24 hours; sensitive or incomplete context still requires you.`,
      )
    )
      return;
    await act(async () => {
      await api("/policy", "PUT", {
        accountKey: c.key,
        mode,
        maxReplies,
        confirmAutomatic: mode === "auto",
      });
    }, "Account rules saved.");
  }
  return (
    <div className="agent-hub">
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      {!data ? (
        <div className="empty-state">Loading Mika’s workspace…</div>
      ) : (
        <>
          {(view === "agent" || view === "inbox") && (
            <>
              <section className="agent-hero">
                <div>
                  <div className="agent-identity">
                    <span className="agent-orb">✳</span>
                    <span>MIKA · YOUR MARKETING AGENT</span>
                  </div>
                  <h2>
                    {needs.length
                      ? `${needs.length} things could use your judgement.`
                      : "Less checking. More peace of mind."}
                  </h2>
                  <p>
                    Mika reads the room, checks your knowledge and handles
                    routine replies.
                    <br />
                    The important decisions come back to you.
                  </p>
                  <span className="schedule-label">◷ {data.schedule}</span>
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api("/run", "POST", {});
                    }, "Monitoring check finished. Review coverage and exceptions below.")
                  }
                >
                  {busy ? "Mika is checking…" : "↻ Check accounts now"}
                </button>
              </section>
              <div className="agent-stats">
                <div>
                  <b>
                    {
                      data.connections.filter(
                        (c) => c.ready && c.policy.mode !== "paused",
                      ).length
                    }
                  </b>
                  <span>Accounts monitored</span>
                </div>
                <div>
                  <b>{data.runs[0]?.read || 0}</b>
                  <span>New messages · last check</span>
                </div>
                <div>
                  <b>{data.runs[0]?.replied || 0}</b>
                  <span>Replies accepted · last check</span>
                </div>
                <div>
                  <b>{needs.length}</b>
                  <span>Need your attention</span>
                </div>
              </div>
              <div className="section-heading">
                <h2>Your attention, where it matters</h2>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={showAll}
                    onChange={(e) => setShowAll(e.target.checked)}
                  />
                  Include handled & observed
                </label>
              </div>
              <div className="agent-workspace">
                <section className="inbox-list">
                  {visible.length ? (
                    visible.map((i) => (
                      <button
                        key={i.id}
                        className={
                          "inbox-item " + (selected === i.id ? "selected" : "")
                        }
                        onClick={() => select(i)}
                      >
                        <div className="inbox-meta">
                          <span className={"platform-tag " + i.message.channel}>
                            {channelNames[i.message.channel]}
                          </span>
                          <span>
                            {i.message.demo
                              ? "SIMULATION"
                              : i.status.toUpperCase()}
                          </span>
                        </div>
                        <h3>
                          {i.decision.intent === "needs_owner"
                            ? "Your judgement needed"
                            : i.decision.intent === "approved_faq"
                              ? "An answer, grounded in your knowledge"
                              : "A conversation worth a look"}
                        </h3>
                        <p>{i.message.text.slice(0, 150)}</p>
                        <small>{i.decision.reason}</small>
                      </button>
                    ))
                  ) : (
                    <div className="inbox-empty">
                      <span>✳</span>
                      <h3>Nothing needs your attention.</h3>
                      <p>
                        Connect an account and enable monitoring, or try a
                        synthetic conversation below.
                      </p>
                    </div>
                  )}
                </section>
                <section className="conversation-panel">
                  {item ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">
                            {channelNames[item.message.channel]} ·{" "}
                            {item.message.demo ? "SIMULATION" : "CONVERSATION"}
                          </span>
                          <h2>Read the context. See the decision.</h2>
                        </div>
                        <span className="status">{item.status}</span>
                      </div>
                      <div className="context-card">
                        <small>
                          INCOMING MESSAGE ·{" "}
                          {new Date(item.message.occurredAt).toLocaleString()}
                        </small>
                        <p>{item.message.text}</p>
                        {item.message.context && (
                          <details>
                            <summary>Parent context</summary>
                            <p>{item.message.context}</p>
                          </details>
                        )}
                      </div>
                      <div className="trace">
                        <h3>Mika’s decision trail</h3>
                        <p className="footnote">
                          Observable steps, evidence and policy checks for this
                          response.
                        </p>
                        {item.decision.trace.map((step, i) => (
                          <details
                            key={i}
                            className={"trace-step " + step.status}
                            open={i === 0}
                          >
                            <summary>
                              <span className="step-dot">
                                {step.status === "complete"
                                  ? "✓"
                                  : step.status === "blocked"
                                    ? "!"
                                    : "–"}
                              </span>
                              <span>
                                {skillCatalog.find((s) => s.id === step.skill)
                                  ?.name || step.skill}
                              </span>
                              <small>{step.status}</small>
                            </summary>
                            <p>{step.summary}</p>
                            {step.evidence.length > 0 && (
                              <small className="evidence">
                                Evidence: {step.evidence.join(" · ")}
                              </small>
                            )}
                          </details>
                        ))}
                      </div>
                      {item.error && <div className="error">{item.error}</div>}
                      <div className="reply-box">
                        <label>
                          Proposed reply
                          <textarea
                            rows={4}
                            value={reply}
                            maxLength={1500}
                            disabled={
                              busy ||
                              ["sent", "sending", "uncertain"].includes(
                                item.status,
                              )
                            }
                            onChange={(e) => {
                              setReply(e.target.value);
                              setConfirmSend(false);
                            }}
                            placeholder="Write a reply or ask Mika to draft one."
                          />
                        </label>
                        {!["sent", "sending", "uncertain"].includes(
                          item.status,
                        ) && (
                          <>
                            <label>
                              Talk to Mika about this decision
                              <input
                                value={note}
                                maxLength={2000}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="e.g. Ask which workshop they mean. Don’t promise a refund."
                              />
                            </label>
                            <div className="actions">
                              <button
                                disabled={busy || !data.aiReady}
                                onClick={() =>
                                  void act(async () => {
                                    const x = await api(
                                      `/items/${item.id}/draft`,
                                      "POST",
                                      { note },
                                    );
                                    setReply(x.item.decision.reply);
                                    setConfirmSend(false);
                                  }, "Mika drafted a revision. Review it before sending.")
                                }
                              >
                                ✦ Ask Mika to revise
                              </button>
                              <button
                                disabled={busy || reply === item.decision.reply}
                                onClick={() =>
                                  void act(async () => {
                                    await api(`/items/${item.id}`, "PUT", {
                                      reply,
                                      revision: item.revision,
                                    });
                                    setConfirmSend(false);
                                  }, "Reply saved. It has not been sent.")
                                }
                              >
                                Save reply
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void act(async () => {
                                    await api(
                                      `/items/${item.id}/dismiss`,
                                      "POST",
                                      {},
                                    );
                                    setSelected(null);
                                  }, "Task dismissed.")
                                }
                              >
                                Dismiss
                              </button>
                            </div>
                            {!data.aiReady && (
                              <p className="footnote">
                                AI drafting needs model configuration. Approved
                                FAQ skills and manual replies work
                                independently.
                              </p>
                            )}
                            <div className="send-review">
                              <p>
                                {item.message.demo
                                  ? "Simulation only. No outbound message can be sent."
                                  : `Reply on ${channelNames[item.message.channel]} to this exact conversation. The current account rules and opt-out checks still apply.`}
                              </p>
                              {!item.message.demo && (
                                <>
                                  <label className="inline-check">
                                    <input
                                      type="checkbox"
                                      checked={confirmSend}
                                      onChange={(e) =>
                                        setConfirmSend(e.target.checked)
                                      }
                                    />
                                    I reviewed this exact reply and destination.
                                  </label>
                                  <button
                                    className="primary"
                                    disabled={
                                      busy ||
                                      !confirmSend ||
                                      !reply.trim() ||
                                      reply !== item.decision.reply
                                    }
                                    onClick={() =>
                                      void act(async () => {
                                        const x = await api(
                                          `/items/${item.id}/send`,
                                          "POST",
                                          {
                                            revision: item.revision,
                                            confirm: true,
                                          },
                                        );
                                        setConfirmSend(false);
                                        setNotice(
                                          x.item.status === "sent"
                                            ? "The provider accepted the reply."
                                            : x.item.error ||
                                                "Check the delivery status.",
                                        );
                                      })
                                    }
                                  >
                                    Confirm & send reply
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                        {item.remoteId && (
                          <p className="footnote">
                            Provider acknowledgement: {item.remoteId}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="inbox-empty">
                      <span>◎</span>
                      <h3>Every action has a trail.</h3>
                      <p>
                        Select a conversation to see its context, the skills
                        Mika used and the evidence behind its response.
                      </p>
                    </div>
                  )}
                </section>
              </div>
              <div className="two-column agent-bottom">
                <section className="panel">
                  <div className="section-heading">
                    <h2>What your audience is talking about</h2>
                    <span>Observed signals</span>
                  </div>
                  {data.signals.length ? (
                    data.signals.map((s) => (
                      <details className="signal-row" key={s.topic}>
                        <summary>
                          <strong>{s.topic}</strong>
                          <span>{s.count} messages</span>
                        </summary>
                        <p>{s.window}</p>
                        <small>{s.sources.join(" · ")}</small>
                      </details>
                    ))
                  ) : (
                    <p>
                      Topics will appear when they recur in connected
                      conversations. No external trend feed is connected.
                    </p>
                  )}
                  <p className="footnote">
                    English keyword counts from a bounded sample. These are
                    signals for exploration, not proof of a wider trend.
                  </p>
                </section>
                <section className="panel">
                  <h2>Try the decision trail</h2>
                  <p>
                    Run a synthetic message through Mika’s skills. No account
                    connection and no sending.
                  </p>
                  <label>
                    Example message
                    <input
                      value={demoText}
                      maxLength={3000}
                      onChange={(e) => setDemoText(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !demoText.trim()}
                    onClick={() =>
                      void act(async () => {
                        const x = await api("/simulate", "POST", {
                          text: demoText,
                        });
                        select(x.item);
                      }, "Simulation added. Open its decision trail above.")
                    }
                  >
                    Run simulation →
                  </button>
                </section>
              </div>
              <section className="panel">
                <h2>Monitoring runs</h2>
                {data.runs.length ? (
                  data.runs.map((r) => (
                    <details className="run-row" key={r.id}>
                      <summary>
                        <span>{new Date(r.startedAt).toLocaleString()}</span>
                        <span className={"status " + r.status}>{r.status}</span>
                        <span>
                          {r.read} new · {r.replied} replies · {r.needsYou} for
                          you
                        </span>
                      </summary>
                      {r.channels.length ? (
                        r.channels.map((c, i) => (
                          <p key={i}>
                            <strong>
                              {c.account} · {c.status}
                            </strong>
                            <br />
                            {c.detail}
                          </p>
                        ))
                      ) : (
                        <p>No configured account had monitoring enabled.</p>
                      )}
                    </details>
                  ))
                ) : (
                  <p>
                    No checks have run yet. Mika will never show a fictional
                    “all clear”.
                  </p>
                )}
              </section>
            </>
          )}
          {view === "accounts" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Set the boundaries. Mika follows them.</h2>
                  <p>
                    Each account starts paused. Choose observation, reviewed
                    drafts or approved FAQ auto-replies.
                  </p>
                </div>
                <button onClick={onChannels}>Connect social accounts ↗</button>
              </div>
              <div className="agent-account-grid">
                {data.connections.map((c) => (
                  <section className="panel" key={c.key}>
                    <div className="channel-title">
                      <span className={"platform-tag " + c.channel}>
                        {channelNames[c.channel]}
                      </span>
                      <span className={"dot " + (c.ready ? "connected" : "")} />
                    </div>
                    <h2>{c.label}</h2>
                    <p>{c.capability}</p>
                    <span className="connection-hint">
                      {c.ready
                        ? "Connection configured · verify with a check"
                        : "Connection / additional access required"}
                    </span>
                    <label>
                      Mika’s role
                      <select
                        value={c.policy.mode}
                        disabled={busy || !c.ready}
                        onChange={(e) =>
                          void policy(
                            c,
                            e.target.value as Connection["policy"]["mode"],
                          )
                        }
                      >
                        <option value="paused">Paused</option>
                        <option value="observe">Observe only</option>
                        <option value="assist">Draft & ask me</option>
                        <option value="auto">
                          Auto-reply to approved FAQs
                        </option>
                      </select>
                    </label>
                    <label>
                      Maximum replies per 24 hours
                      <select
                        value={c.policy.maxReplies}
                        disabled={busy || !c.ready}
                        onChange={(e) =>
                          void policy(c, c.policy.mode, Number(e.target.value))
                        }
                      >
                        {[1, 3, 5, 10].map((n) => (
                          <option key={n} value={n}>
                            {n} replies
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="footnote">
                      Complaints, opt-outs, unsupported facts and incomplete
                      context are never handled as routine auto-replies.
                    </p>
                    {!c.ready && (
                      <a
                        className="setup-link"
                        href="https://github.com/joeysudo/Mikabot/blob/main/docs/AGENT.md"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Connection setup guide ↗
                      </a>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {view === "skills" && (
            <>
              <section className="mika-banner">
                <div>
                  <span className="eyebrow">CAPABILITIES YOU CAN INSPECT</span>
                  <h2>Good replies start before the first word.</h2>
                  <p>
                    Mika uses a defined sequence of skills. Every conversation
                    keeps its own execution trail.
                  </p>
                </div>
                <span className="big-star">✳</span>
              </section>
              <div className="skill-grid">
                {skillCatalog.map((s, i) => (
                  <article className="panel skill-card" key={s.id}>
                    <span className="skill-number">0{i + 1}</span>
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                  </article>
                ))}
              </div>
              <div className="two-column">
                <form
                  className="panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await api("/faq", "POST", { question, answer, approved });
                      setQuestion("");
                      setAnswer("");
                      setApproved(false);
                    }, "FAQ added to Mika’s knowledge.");
                  }}
                >
                  <h2>Teach Mika a reliable answer</h2>
                  <p>
                    Automatic replies require an exact match to an explicitly
                    approved answer. AI-generated drafts always need review.
                  </p>
                  <label>
                    Customer question
                    <input
                      value={question}
                      maxLength={300}
                      required
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="e.g. Where can I find your opening hours?"
                    />
                  </label>
                  <label>
                    Verified answer
                    <textarea
                      value={answer}
                      maxLength={1200}
                      required
                      rows={5}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                  </label>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={approved}
                      onChange={(e) => setApproved(e.target.checked)}
                    />
                    I approve this answer for automatic FAQ replies.
                  </label>
                  <button className="primary" disabled={busy}>
                    Add to knowledge
                  </button>
                </form>
                <section className="panel">
                  <h2>Your knowledge library</h2>
                  {data.faqs.length ? (
                    data.faqs.map((f) => (
                      <article className="faq-row" key={f.id}>
                        <div>
                          <strong>{f.question}</strong>
                          <span className="status">
                            {f.approved ? "Approved" : "Draft knowledge"}
                          </span>
                        </div>
                        <p>{f.answer}</p>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await api("/faq/" + f.id, "DELETE", {});
                            }, "FAQ removed. Future automatic replies cannot use it.")
                          }
                        >
                          Remove answer
                        </button>
                      </article>
                    ))
                  ) : (
                    <p>
                      No answers yet. Add your first verified FAQ to give Mika a
                      dependable starting point.
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
