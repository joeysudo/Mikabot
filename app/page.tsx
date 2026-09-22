"use client";
import Link from "next/link";
import Image from "next/image";
import AgentHub from "./components/AgentHub";
import AccountOnboarding from "./components/AccountOnboarding";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  platforms,
  labels,
  limits,
  defaultBrief,
  contentLength,
  publishIssue,
  type Platform,
  type Post,
  type Brief,
  type Account,
  type Attempt,
} from "../lib/domain";
type Tab =
  | "agent"
  | "inbox"
  | "skills"
  | "accounts"
  | "planner"
  | "library"
  | "mika"
  | "channels"
  | "brand";
type State = {
  posts: Post[];
  brief: Brief;
  accounts: Account[];
  attempts: Attempt[];
  activity: Array<{ message: string; createdAt: string }>;
  providers: Record<Platform, { configured: boolean }>;
  aiReady: boolean;
  aiProvider: string | null;
  onboardingComplete: boolean;
  localMode: boolean;
};
const empty: State = {
  posts: [],
  brief: defaultBrief,
  accounts: [],
  attempts: [],
  activity: [],
  providers: Object.fromEntries(
    platforms.map((p) => [p, { configured: false }]),
  ) as State["providers"],
  aiReady: false,
  aiProvider: null,
  onboardingComplete: false,
  localMode: true,
};
const signup: Record<Platform, string> = {
  instagram: "https://www.instagram.com/accounts/emailsignup/",
  facebook: "https://www.facebook.com/pages/create/",
  linkedin: "https://www.linkedin.com/signup",
  x: "https://x.com/i/flow/signup",
};
function Mark({ p }: { p: Platform }) {
  return (
    <b
      className={"channel-mark p" + platforms.indexOf(p)}
      aria-label={labels[p]}
    >
      {["◎", "f", "in", "𝕏"][platforms.indexOf(p)]}
    </b>
  );
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function localInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    dayKey(d) +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}
function fresh(date?: Date): Post {
  const now = new Date().toISOString();
  return {
    id: "",
    title: "",
    captions: { instagram: "", facebook: "", linkedin: "", x: "" },
    platforms: ["instagram"],
    imageUrl: "",
    plannedAt: date?.toISOString() || "",
    status: "draft",
    revision: 0,
    approvedRevision: null,
    createdAt: now,
    updatedAt: now,
  };
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Home() {
  const [state, setState] = useState<State>(empty),
    [tab, setTab] = useState<Tab>("agent"),
    [loading, setLoading] = useState(true),
    [locked, setLocked] = useState(false),
    [password, setPassword] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [week, setWeek] = useState(monday),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [editor, setEditor] = useState<Post | null>(null),
    [preview, setPreview] = useState<Platform>("instagram"),
    [confirm, setConfirm] = useState<{
      post: Post;
      p: Platform;
      account: Account;
    } | null>(null),
    [guide, setGuide] = useState<Platform | null>(null),
    [brief, setBrief] = useState<Brief>(defaultBrief),
    [planPlatforms, setPlanPlatforms] = useState<Platform[]>([...platforms]),
    [planDate, setPlanDate] = useState(() => dayKey(new Date())),
    [bio, setBio] = useState("");
  const request = useCallback(
    async (path: string, method = "GET", data?: unknown) => {
      const r = await fetch("/api/" + path, {
        method,
        headers:
          data === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      const x = (await r.json()) as State & {
        error?: string;
        post: Post;
        url: string;
        source: string;
      };
      if (!r.ok)
        throw new Error(x.error || "Something went wrong.", {
          cause: r.status,
        });
      return x;
    },
    [],
  );
  const reload = useCallback(async () => {
    const data = await request("state");
    setState(data);
    setLocked(false);
    return data as State;
  }, [request]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    request("state")
      .then((data) => {
        if (!active) return;
        setState(data);
        setLocked(false);
        setBrief(data.brief);
        const result = new URLSearchParams(window.location.search).get(
          "connection",
        );
        if (result) {
          setTab("channels");
          setNotice(
            result === "success"
              ? "Authorization complete. Select the destination account below."
              : "Connection was cancelled.",
          );
          window.history.replaceState({}, "", window.location.pathname);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          if (e.cause === 401) setLocked(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);
  async function act(work: () => Promise<void>, message?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      if (message) setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      if (e instanceof Error && e.cause === 401) setLocked(true);
    } finally {
      setBusy(false);
    }
  }
  function openEditor(post: Post) {
    setEditor(structuredClone(post));
    setPreview(post.platforms[0]);
    setError("");
  }
  function save() {
    if (!editor) return;
    void act(async () => {
      const x = await request(
        editor.id ? "posts/" + editor.id : "posts",
        editor.id ? "PUT" : "POST",
        editor,
      );
      setEditor(x.post);
      await reload();
    }, "Draft saved. Changes require a fresh approval.");
  }
  function action(post: Post, kind: string) {
    void act(
      async () => {
        const x = await request(`posts/${post.id}/${kind}`, "POST", {
          revision: post.revision,
        });
        if (editor?.id === post.id) setEditor(x.post);
        await reload();
      },
      kind === "approve"
        ? "Approved. Choose a channel to publish when you are ready."
        : "Moved to the review queue.",
    );
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "mikabot-content-v1",
            exportedAt: new Date().toISOString(),
            brief: state.brief,
            posts: state.posts,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mika-content.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!loading && !locked && !state.onboardingComplete) {
    return (
      <AccountOnboarding
        brief={state.brief}
        accounts={state.accounts}
        providers={state.providers}
        aiProvider={state.aiProvider}
        onComplete={async () => {
          await reload();
          setTab("agent");
          setNotice("Account setup saved. Mika is ready when you are.");
        }}
      />
    );
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week);
    d.setDate(d.getDate() + i);
    return d;
  });
  const shown = state.posts.filter(
    (p) =>
      (filter === "all" ||
        p.status === filter ||
        p.platforms.includes(filter as Platform)) &&
      `${p.title} ${Object.values(p.captions).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const unscheduled = shown.filter((p) => !p.plannedAt),
    reviewCount = state.posts.filter((p) => p.status === "review").length;
  const selectedAccount = (p: Platform) =>
    state.accounts.find((a) => a.platform === p && a.active === 1);
  const title = {
    agent: "Your agent. On your side.",
    inbox: "The conversations that matter.",
    skills: "Teach Mika how you work.",
    accounts: "Every account. Its own rules.",
    planner: "Your social, together.",
    library: "A home for every idea.",
    mika: "Let’s make a little momentum.",
    channels: "Your channels. One workspace.",
    brand: "Make it sound like you.",
  }[tab];
  const subtitle = {
    agent: "An attentive marketing teammate, with you in control.",
    inbox: "Review the exceptions. Let Mika handle the routine.",
    skills: "Inspectable skills, grounded knowledge and clear boundaries.",
    accounts: "Manage monitoring and reply permissions across nine channels.",
    planner: "One calm place to turn good ideas into your next great post.",
    library: "Find, refine and review every piece of your content.",
    mika: "Start with a goal. Leave with three ideas, adapted for your channels.",
    channels: "Connect the places your audience calls home.",
    brand: "Give Mika the context to create relevant, grounded content.",
  }[tab];
  const lockedEditor =
    editor &&
    state.attempts.some(
      (a) =>
        a.postId === editor.id &&
        ["pending", "uncertain", "published"].includes(a.status),
    );
  const dirty = editor?.id
    ? JSON.stringify(editor) !==
      JSON.stringify(state.posts.find((p) => p.id === editor.id))
    : true;
  function postCard(post: Post) {
    return (
      <button
        className={"post-card tone" + platforms.indexOf(post.platforms[0])}
        key={post.id}
        onClick={() => openEditor(post)}
      >
        <div className="card-meta">
          <span className={"status " + post.status}>{post.status}</span>
          <span>
            {post.plannedAt
              ? new Date(post.plannedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Unplanned"}
          </span>
        </div>
        <h3>{post.title}</h3>
        <p>
          {(post.captions[post.platforms[0]] || "Add your caption").slice(
            0,
            70,
          )}
        </p>
        <div className="mini-marks">
          {post.platforms.map((p) => (
            <Mark key={p} p={p} />
          ))}
        </div>
      </button>
    );
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Mika home">
          mika<span>✳</span>
        </Link>
        <div className="workspace">
          Your social workspace<small>MARKETING, CONNECTED</small>
        </div>
        <nav aria-label="Workspace">
          {(
            [
              ["agent", "✳", "Mika overview"],
              ["inbox", "☷", "Needs attention"],
              ["accounts", "◎", "Agent accounts"],
              ["skills", "◈", "Skills & knowledge"],
              ["planner", "◫", "Content planner"],
              ["library", "▤", "Content library"],
              ["mika", "✦", "Create with Mika"],
              ["channels", "◎", "Channels"],
              ["brand", "◈", "Brand context"],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              {icon} &nbsp; {label}
              {id === "library" && reviewCount > 0 && (
                <span className="nav-count">{reviewCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          A little planning.
          <br />A lot more possibility.<span>MIKA · MARKETING AGENT</span>
        </div>
        {!state.localMode && (
          <button
            className="text-button"
            onClick={() =>
              void act(async () => {
                await request("logout", "POST", {});
                setLocked(true);
                setState(empty);
                setBrief(defaultBrief);
              })
            }
          >
            Lock workspace
          </button>
        )}
      </aside>
      <main className="main">
        <header>
          <span>
            WORKSPACE /{" "}
            {tab === "planner" ? "CONTENT PLANNER" : tab.toUpperCase()}
          </span>
          <span>
            ✦ {state.aiProvider === "gemini" ? "Mika · Gemini ready" : state.aiReady ? "Mika AI ready" : "Starter planning available"}
          </span>
        </header>
        <section className="page-heading">
          <div>
            <p className="eyebrow">YOUR IDEAS, OUT IN THE WORLD</p>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <button
            className="primary"
            disabled={loading || locked}
            onClick={() => openEditor(fresh())}
          >
            ＋ Create a post
          </button>
        </section>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {error && !editor && !confirm && !guide && (
          <div className="error" role="alert">
            {error}
            <button
              onClick={() =>
                void act(async () => {
                  await reload();
                })
              }
            >
              Try again
            </button>
          </div>
        )}
        {loading ? (
          <div className="empty-state">
            <span className="big-star">✳</span>
            <h2>Opening your workspace…</h2>
          </div>
        ) : locked ? (
          <form
            className="panel login"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await request("login", "POST", { password });
                setPassword("");
                const x = await reload();
                setBrief(x.brief);
              }, "Workspace unlocked.");
            }}
          >
            <h2>Your private workspace</h2>
            <p>Enter the workspace password configured by the owner.</p>
            <label>
              Workspace password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              Unlock workspace
            </button>
          </form>
        ) : (
          <>
            {(["agent", "inbox", "skills", "accounts"] as string[]).includes(
              tab,
            ) && (
              <AgentHub
                view={tab as "agent" | "inbox" | "skills" | "accounts"}
                onChannels={() => setTab("channels")}
              />
            )}
            {tab === "planner" && (
              <>
                <section className="mika-banner">
                  <div>
                    <span className="eyebrow">
                      MEET YOUR MARKETING SIDEKICK
                    </span>
                    <h2>
                      {state.posts.length
                        ? "Your next good idea starts here."
                        : "A blank calendar is a fresh start."}
                    </h2>
                    <p>
                      Give Mika a goal. Make a plan for all four channels, then
                      make it yours.
                    </p>
                  </div>
                  <button onClick={() => setTab("mika")}>
                    ✦ Plan my week <span>↗</span>
                  </button>
                </section>
                <section
                  className="channels-strip"
                  aria-label="Channel connections"
                >
                  {platforms.map((p) => {
                    const a = selectedAccount(p);
                    return (
                      <button key={p} onClick={() => setTab("channels")}>
                        <Mark p={p} />
                        <span>
                          {labels[p]}
                          <small>
                            {a
                              ? a.expiresAt > now
                                ? "Connected"
                                : "Reconnect needed"
                              : "Not connected"}
                          </small>
                        </span>
                        <span
                          className={
                            "dot " + (a && a.expiresAt > now ? "connected" : "")
                          }
                        />
                      </button>
                    );
                  })}
                </section>
                <div className="section-heading">
                  <div className="week-heading">
                    <h2>
                      {week.toLocaleDateString([], {
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                    <button
                      aria-label="Previous week"
                      onClick={() => {
                        const d = new Date(week);
                        d.setDate(d.getDate() - 7);
                        setWeek(d);
                      }}
                    >
                      ‹
                    </button>
                    <button
                      aria-label="Next week"
                      onClick={() => {
                        const d = new Date(week);
                        d.setDate(d.getDate() + 7);
                        setWeek(d);
                      }}
                    >
                      ›
                    </button>
                    <button onClick={() => setWeek(monday())}>Today</button>
                  </div>
                  <select
                    aria-label="Filter calendar by channel"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All channels</option>
                    {platforms.map((p) => (
                      <option key={p} value={p}>
                        {labels[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <section
                  className="calendar"
                  aria-label="Weekly content calendar"
                >
                  {days.map((d) => (
                    <div
                      className={
                        "day " +
                        (dayKey(d) === dayKey(new Date()) ? "today" : "")
                      }
                      key={dayKey(d)}
                    >
                      <span>
                        {d
                          .toLocaleDateString("en", { weekday: "short" })
                          .toUpperCase()}
                      </span>
                      <h3>{d.getDate()}</h3>
                      {shown
                        .filter(
                          (p) =>
                            p.plannedAt &&
                            dayKey(new Date(p.plannedAt)) === dayKey(d),
                        )
                        .map(postCard)}
                      <button
                        className="add-day"
                        aria-label={"Create post for " + dayKey(d)}
                        onClick={() => {
                          const dt = new Date(d);
                          dt.setHours(10);
                          openEditor(fresh(dt));
                        }}
                      >
                        ＋
                      </button>
                    </div>
                  ))}
                </section>
                <p className="footnote">
                  Times are shown in{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}. Calendar
                  dates are plans; posts are published only when you confirm.
                </p>
                {unscheduled.length > 0 && (
                  <section>
                    <div className="section-heading">
                      <h2>
                        Ideas without a date{" "}
                        <span className="count">{unscheduled.length}</span>
                      </h2>
                    </div>
                    <div className="post-grid">{unscheduled.map(postCard)}</div>
                  </section>
                )}
                {state.posts.length === 0 && (
                  <div className="gentle-empty">
                    <span>✦</span>
                    <div>
                      <strong>Room for something good.</strong>
                      <p>
                        Create your first post or let Mika draft a weekly plan.
                      </p>
                    </div>
                    <button onClick={() => setTab("mika")}>
                      Start with a plan →
                    </button>
                  </div>
                )}
              </>
            )}
            {tab === "library" && (
              <>
                <div className="toolbar">
                  <input
                    aria-label="Search posts"
                    placeholder="Search your ideas and captions…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    aria-label="Filter posts"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All content</option>
                    {["draft", "review", "approved", "published"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                    {platforms.map((p) => (
                      <option key={p} value={p}>
                        {labels[p]}
                      </option>
                    ))}
                  </select>
                  <button onClick={download}>↓ Export content</button>
                </div>
                <div className="stats-row">
                  {[
                    ["All content", state.posts.length],
                    [
                      "Drafts",
                      state.posts.filter((p) => p.status === "draft").length,
                    ],
                    ["Needs review", reviewCount],
                    [
                      "Approved",
                      state.posts.filter((p) => p.status === "approved").length,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                {shown.length ? (
                  <div className="post-grid">{shown.map(postCard)}</div>
                ) : (
                  <div className="empty-state">
                    <span className="big-star">✳</span>
                    <h2>No posts here yet.</h2>
                    <p>Every good feed starts with one idea.</p>
                    <button onClick={() => openEditor(fresh())}>
                      Create a post
                    </button>
                  </div>
                )}
                <section className="panel activity">
                  <h2>Workspace activity</h2>
                  {state.activity.length ? (
                    state.activity.map((a, i) => (
                      <div key={i}>
                        <span>{a.message}</span>
                        <time>{new Date(a.createdAt).toLocaleString()}</time>
                      </div>
                    ))
                  ) : (
                    <p>
                      Your planning and publishing history will appear here.
                    </p>
                  )}
                </section>
              </>
            )}
            {tab === "mika" && (
              <div className="two-column">
                <section className="panel">
                  <span className="eyebrow">A BRIEF IS ALL IT TAKES</span>
                  <h2>What are we working toward?</h2>
                  <p>
                    Use approved business facts. Mika will create three drafts
                    with a different angle for each day.
                  </p>
                  <label>
                    What do you offer?
                    <input
                      placeholder="e.g. Small-group pottery workshops"
                      value={brief.offering}
                      maxLength={300}
                      onChange={(e) =>
                        setBrief({ ...brief, offering: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Who are you trying to reach?
                    <input
                      placeholder="e.g. Curious beginners looking for a creative weekend"
                      value={brief.audience}
                      maxLength={300}
                      onChange={(e) =>
                        setBrief({ ...brief, audience: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Your goal
                    <textarea
                      rows={3}
                      placeholder="e.g. Introduce our workshops and encourage enquiries"
                      value={brief.goal}
                      maxLength={500}
                      onChange={(e) =>
                        setBrief({ ...brief, goal: e.target.value })
                      }
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Tone
                      <select
                        value={brief.tone}
                        onChange={(e) =>
                          setBrief({ ...brief, tone: e.target.value })
                        }
                      >
                        {[
                          "Warm and helpful",
                          "Confident and professional",
                          "Playful and curious",
                          "Clear and direct",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Start date
                      <input
                        type="date"
                        value={planDate}
                        onChange={(e) => setPlanDate(e.target.value)}
                      />
                    </label>
                  </div>
                  <label>Channels</label>
                  <div className="channel-choices">
                    {platforms.map((p) => (
                      <button
                        key={p}
                        aria-pressed={planPlatforms.includes(p)}
                        className={planPlatforms.includes(p) ? "selected" : ""}
                        onClick={() =>
                          setPlanPlatforms(
                            planPlatforms.includes(p)
                              ? planPlatforms.filter((v) => v !== p)
                              : [...planPlatforms, p],
                          )
                        }
                      >
                        <Mark p={p} />
                        {labels[p]}
                      </button>
                    ))}
                  </div>
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !brief.offering ||
                        !brief.goal ||
                        !planDate ||
                        !planPlatforms.length
                      }
                      onClick={() =>
                        void act(async () => {
                          await request("brief", "PUT", brief);
                          const x = await request("plan", "POST", {
                            brief,
                            platforms: planPlatforms,
                            start: new Date(planDate + "T10:00").toISOString(),
                            mode: state.aiReady ? "ai" : "template",
                          });
                          await reload();
                          setTab("library");
                          setFilter("draft");
                          setSearch("");
                          setNotice(
                            `${x.posts.length} drafts created using ${x.source === "template" ? "starter templates" : `Mika ${x.source}`}. Review and refine before publishing.`,
                          );
                        })
                      }
                    >
                      {busy
                        ? "Making your plan…"
                        : state.aiReady
                          ? "✦ Generate with Mika"
                          : "✦ Create starter plan"}
                    </button>
                    {state.aiReady && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await request("brief", "PUT", brief);
                            await request("plan", "POST", {
                              brief,
                              platforms: planPlatforms,
                              start: new Date(
                                planDate + "T10:00",
                              ).toISOString(),
                              mode: "template",
                            });
                            await reload();
                            setTab("library");
                            setFilter("draft");
                          }, "Starter plan created.")
                        }
                      >
                        Use templates
                      </button>
                    )}
                  </div>
                  <p className="footnote">
                    {state.aiReady
                      ? "Your brief is sent to the configured AI service when you generate a plan."
                      : "AI is not configured. Starter plans use editable templates, not an AI model."}{" "}
                    No posts are published.
                  </p>
                </section>
                <aside>
                  <section className="mika-note">
                    <span className="big-star">✳</span>
                    <h2>
                      A thoughtful first draft.
                      <br />
                      Your final say.
                    </h2>
                    <p>
                      One story, four ways to tell it. Each channel gets its own
                      caption, ready for you to make it feel right.
                    </p>
                    <ol>
                      <li>Share the goal and context</li>
                      <li>Get three content ideas</li>
                      <li>Edit each channel’s version</li>
                      <li>Review, approve, then publish</li>
                    </ol>
                  </section>
                  <section className="panel">
                    <h3>Keep it grounded</h3>
                    <p>
                      Add verified details in Brand context. Mika should never
                      invent offers, testimonials or availability.
                    </p>
                    <button onClick={() => setTab("brand")}>
                      Edit brand context →
                    </button>
                  </section>
                </aside>
              </div>
            )}
            {tab === "channels" && (
              <>
                <div className="info-line">
                  Connect an existing account, or prepare a new one with Mika.
                  You always sign in directly with the platform.
                </div>
                <div className="channel-grid">
                  {platforms.map((p) => {
                    const list = state.accounts.filter((a) => a.platform === p);
                    return (
                      <section className="panel channel-panel" key={p}>
                        <div className="channel-title">
                          <Mark p={p} />
                          <div>
                            <h2>{labels[p]}</h2>
                            <span>
                              {p === "instagram"
                                ? "Professional account · Single-image posts"
                                : p === "facebook"
                                  ? "Facebook Page · Text posts"
                                  : p === "linkedin"
                                    ? "Member profile · Text posts"
                                    : "Account · Text posts"}
                            </span>
                          </div>
                        </div>
                        <p>
                          {p === "instagram"
                            ? "Connect a business or creator account linked to a Facebook Page."
                            : p === "facebook"
                              ? "Choose a Page you manage. Personal profile publishing is not included."
                              : p === "linkedin"
                                ? "Share with your professional network from your own member profile."
                                : "Connect with OAuth to publish a short update to your audience."}
                        </p>
                        {list.map((a) => (
                          <div className="account-row" key={a.id}>
                            <label>
                              <input
                                type="radio"
                                name={"account-" + p}
                                checked={a.active === 1}
                                disabled={busy || a.expiresAt < now}
                                onChange={() =>
                                  void act(async () => {
                                    await request(
                                      `accounts/${encodeURIComponent(a.id)}/select`,
                                      "POST",
                                      {},
                                    );
                                    await reload();
                                  }, "Publishing destination selected.")
                                }
                              />
                              <span>
                                {a.label}
                                <small>
                                  {a.expiresAt < now
                                    ? "Expired · reconnect"
                                    : `Expires ${new Date(a.expiresAt).toLocaleDateString()}`}
                                </small>
                              </span>
                            </label>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void act(async () => {
                                  await request(
                                    "accounts/" + encodeURIComponent(a.id),
                                    "DELETE",
                                    {},
                                  );
                                  await reload();
                                }, "Disconnected from Mika. Revoke permissions in platform settings if needed.")
                              }
                            >
                              Disconnect
                            </button>
                          </div>
                        ))}
                        <div className="connection-status">
                          <span
                            className={
                              "dot " +
                              (state.providers[p].configured ? "connected" : "")
                            }
                          />
                          {state.providers[p].configured
                            ? "Ready for authorization"
                            : "Developer app setup required"}
                        </div>
                        <div className="actions">
                          <button
                            className="primary"
                            disabled={busy || !state.providers[p].configured}
                            onClick={() =>
                              void act(async () => {
                                const x = await request(
                                  `oauth/${p}/start`,
                                  "POST",
                                  {},
                                );
                                window.location.assign(x.url);
                              })
                            }
                          >
                            {list.length
                              ? "Reconnect / add account"
                              : "Connect " + labels[p]}
                          </button>
                          <button
                            onClick={() => {
                              setGuide(p);
                              setBio(
                                brief.offering
                                  ? `${brief.offering}. For ${brief.audience || "our community"}. ${brief.facts}`
                                  : "",
                              );
                            }}
                          >
                            Create an account ↗
                          </button>
                        </div>
                        {!state.providers[p].configured && (
                          <p className="footnote">
                            The owner needs to configure this platform’s
                            developer app and workspace security.{" "}
                            <a
                              href="https://github.com/joeysudo/Mikabot/blob/main/docs/PLATFORMS.md"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Setup guide ↗
                            </a>
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
                <p className="footnote">
                  Connecting does not publish. Select the intended account after
                  authorization. Removing it from Mika deletes its stored token,
                  but does not revoke platform-side permissions.
                </p>
              </>
            )}
            {tab === "brand" && (
              <div className="two-column">
                <form
                  className="panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await request("brief", "PUT", brief);
                      await reload();
                    }, "Brand context saved.");
                  }}
                >
                  <h2>The context behind your content</h2>
                  <p>
                    Business information only. Keep passwords, personal IDs and
                    sensitive information out of this brief.
                  </p>
                  {(
                    [
                      ["offering", "What you offer", 300],
                      ["audience", "Your audience", 300],
                      ["tone", "Brand voice", 100],
                      ["goal", "Current marketing goal", 500],
                      ["facts", "Approved facts and talking points", 3000],
                    ] as const
                  ).map(([key, label, max]) => (
                    <label key={key}>
                      {label}
                      {key === "facts" || key === "goal" ? (
                        <textarea
                          rows={key === "facts" ? 6 : 3}
                          maxLength={max}
                          value={brief[key]}
                          onChange={(e) =>
                            setBrief({ ...brief, [key]: e.target.value })
                          }
                        />
                      ) : (
                        <input
                          maxLength={max}
                          value={brief[key]}
                          onChange={(e) =>
                            setBrief({ ...brief, [key]: e.target.value })
                          }
                        />
                      )}
                    </label>
                  ))}
                  <button className="primary" disabled={busy}>
                    Save brand context
                  </button>
                </form>
                <section className="mika-note">
                  <span className="eyebrow">BUILT TO WORK TOGETHER</span>
                  <h2>One source of business context.</h2>
                  <p>
                    Mika can work independently today. This brief is the
                    starting point for a shared Business Twin with Chopper.
                  </p>
                  <p>
                    Save only information you are comfortable using in
                    public-facing content.
                  </p>
                </section>
              </div>
            )}
          </>
        )}
        <footer className="workspace-footer">
          <span>
            mika <b>✳</b> <span>Your marketing sidekick.</span>
          </span>
          <span>
            v0.1 ·{" "}
            {state.localMode ? "Local private workspace" : "Private workspace"}
          </span>
        </footer>
      </main>
      {editor && (
        <Dialog
          title={editor.id ? "Make it yours." : "A new idea starts here."}
          onClose={() => setEditor(null)}
        >
          <div className="editor-body">
            <section>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              {lockedEditor && (
                <div className="info-line">
                  This post has a publication record. Duplicate it to make a new
                  version.
                </div>
              )}
              <fieldset disabled={busy || Boolean(lockedEditor)}>
                <label>
                  Post title
                  <input
                    maxLength={160}
                    value={editor.title}
                    onChange={(e) =>
                      setEditor({ ...editor, title: e.target.value })
                    }
                    placeholder="Give this idea a name"
                  />
                </label>
                <label>Publish to</label>
                <div className="channel-choices">
                  {platforms.map((p) => (
                    <button
                      key={p}
                      aria-pressed={editor.platforms.includes(p)}
                      className={editor.platforms.includes(p) ? "selected" : ""}
                      onClick={() => {
                        const next = editor.platforms.includes(p)
                          ? editor.platforms.filter((x) => x !== p)
                          : [...editor.platforms, p];
                        setEditor({ ...editor, platforms: next });
                        if (next.length && !next.includes(preview))
                          setPreview(next[0]);
                      }}
                    >
                      <Mark p={p} />
                      {labels[p]}
                    </button>
                  ))}
                </div>
                <div
                  className="caption-tabs"
                  role="tablist"
                  aria-label="Platform caption"
                >
                  {editor.platforms.map((p) => (
                    <button
                      key={p}
                      role="tab"
                      aria-selected={preview === p}
                      onClick={() => setPreview(p)}
                    >
                      {labels[p]}
                    </button>
                  ))}
                </div>
                <label>
                  {labels[preview]} caption
                  <textarea
                    rows={7}
                    value={editor.captions[preview] || ""}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        captions: {
                          ...editor.captions,
                          [preview]: e.target.value,
                        },
                      })
                    }
                    placeholder="What would you like to share?"
                  />
                </label>
                <p
                  className={
                    "character-count " +
                    (contentLength(preview, editor.captions[preview] || "") >
                    limits[preview]
                      ? "invalid"
                      : "")
                  }
                >
                  {contentLength(preview, editor.captions[preview] || "")} /{" "}
                  {limits[preview]}
                  {preview === "x" ? " · conservative weighted estimate" : ""}
                </p>
                {editor.platforms.includes("instagram") && (
                  <label>
                    Instagram image URL
                    <input
                      type="url"
                      value={editor.imageUrl}
                      onChange={(e) =>
                        setEditor({ ...editor, imageUrl: e.target.value })
                      }
                      placeholder="https://…/image.jpg"
                    />
                    <small>
                      A publicly accessible JPEG. Used for Instagram only in
                      this release.
                    </small>
                  </label>
                )}
                <label>
                  Planned date & time
                  <input
                    type="datetime-local"
                    value={localInput(editor.plannedAt)}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        plannedAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      })
                    }
                  />
                  <small>
                    This is a plan, not an automatic publishing schedule.
                  </small>
                </label>
              </fieldset>
              <div className="actions">
                {!lockedEditor && (
                  <button
                    className="primary"
                    disabled={busy || !editor.title || !editor.platforms.length}
                    onClick={save}
                  >
                    {busy ? "Working…" : "Save draft"}
                  </button>
                )}
                {editor.id && !lockedEditor && (
                  <button
                    disabled={busy || dirty}
                    onClick={() => action(editor, "review")}
                  >
                    Send to review
                  </button>
                )}
                {editor.id && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditor({
                        ...editor,
                        id: "",
                        status: "draft",
                        revision: 0,
                        approvedRevision: null,
                        title: editor.title + " (copy)",
                      });
                      setNotice("A new unsaved copy is ready to edit.");
                    }}
                  >
                    Duplicate
                  </button>
                )}
                {editor.id && !lockedEditor && (
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await request("posts/" + editor.id, "DELETE", {
                          revision: editor.revision,
                        });
                        setEditor(null);
                        await reload();
                      }, "Draft deleted.")
                    }
                  >
                    Delete draft
                  </button>
                )}
              </div>
            </section>
            <aside className="preview-panel">
              <div className="preview-label">
                CHANNEL PREVIEW · {labels[preview].toUpperCase()}
              </div>
              <article className="social-preview">
                <div className="social-author">
                  <Mark p={preview} />
                  <div>
                    <strong>
                      {selectedAccount(preview)?.label || "Your account"}
                    </strong>
                    <small>{labels[preview]} · Preview only</small>
                  </div>
                </div>
                {preview === "instagram" &&
                  (editor.imageUrl ? (
                    <Image
                      unoptimized
                      width={600}
                      height={600}
                      src={editor.imageUrl}
                      alt="Instagram post preview"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : (
                    <div className="image-placeholder">
                      ＋<span>Your image goes here</span>
                    </div>
                  ))}
                <p>
                  {editor.captions[preview] || "Your words will appear here."}
                </p>
              </article>
              <div className="review-box">
                <h3>Ready for the world?</h3>
                <p>
                  Check the facts, caption and image. Approval applies to this
                  exact saved version.
                </p>
                {editor.platforms.map((p) => {
                  const issue = publishIssue(editor, p);
                  return issue ? (
                    <p className="validation-item" key={p}>
                      ○ {labels[p]}: {issue}
                    </p>
                  ) : (
                    <p className="validation-item good" key={p}>
                      ✓ {labels[p]} content ready
                    </p>
                  );
                })}
                {editor.id && !lockedEditor && (
                  <button
                    disabled={
                      busy ||
                      dirty ||
                      editor.platforms.some(
                        (p) => publishIssue(editor, p) !== null,
                      )
                    }
                    onClick={() => action(editor, "approve")}
                  >
                    {editor.status === "approved"
                      ? "Approved ✓"
                      : "Approve saved version"}
                  </button>
                )}
                {dirty && (
                  <small>
                    Save your changes before reviewing or publishing.
                  </small>
                )}
                {editor.status === "approved" &&
                  !dirty &&
                  editor.platforms.map((p) => {
                    const a = selectedAccount(p),
                      attempt = state.attempts.find(
                        (t) =>
                          t.postId === editor.id &&
                          t.platform === p &&
                          t.revision === editor.revision,
                      );
                    return (
                      <div className="publish-row" key={p}>
                        <span>
                          {labels[p]}
                          <small>
                            {attempt?.status === "published"
                              ? `Confirmed · ${attempt.remoteId}`
                              : attempt?.status ||
                                a?.label ||
                                "Connect an account first"}
                          </small>
                        </span>
                        <button
                          disabled={
                            busy ||
                            !a ||
                            a.expiresAt <= now ||
                            Boolean(
                              attempt &&
                              ["pending", "uncertain", "published"].includes(
                                attempt.status,
                              ),
                            )
                          }
                          onClick={() =>
                            a && setConfirm({ post: editor, p, account: a })
                          }
                        >
                          Review & publish
                        </button>
                      </div>
                    );
                  })}
                {state.attempts
                  .filter(
                    (a) =>
                      a.postId === editor.id &&
                      ["uncertain", "pending"].includes(a.status),
                  )
                  .map((a) => (
                    <div className="reconcile" key={a.id}>
                      <p>
                        {labels[a.platform]}:{" "}
                        {a.error ||
                          "Publication is pending. Check the platform if it has been more than two minutes."}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Check the destination platform first. Only continue if you are certain this post was NOT published. An incorrect confirmation can create a duplicate.",
                            )
                          )
                            void act(async () => {
                              await request(
                                `attempts/${a.id}/resolve`,
                                "POST",
                                { confirmAbsent: true },
                              );
                              await reload();
                            }, "Retry unlocked after your confirmation.");
                        }}
                      >
                        I checked: no post exists
                      </button>
                    </div>
                  ))}
              </div>
            </aside>
          </div>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          title={"Publish to " + labels[confirm.p] + "?"}
          onClose={() => setConfirm(null)}
        >
          <div className="confirm-body">
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <p>
              This will publish publicly to{" "}
              <strong>{confirm.account.label}</strong> now.
            </p>
            <div className="confirm-caption">
              {confirm.post.captions[confirm.p]}
            </div>
            {confirm.p === "instagram" && <p>Image: {confirm.post.imageUrl}</p>}
            <p>Planned calendar dates do not delay this action.</p>
            <div className="actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    try {
                      await request(
                        `posts/${confirm.post.id}/publish`,
                        "POST",
                        {
                          platform: confirm.p,
                          accountId: confirm.account.id,
                          revision: confirm.post.revision,
                          confirm: true,
                        },
                      );
                      setConfirm(null);
                      const next = await reload();
                      setEditor(
                        next.posts.find((p) => p.id === confirm.post.id) ||
                          null,
                      );
                      setNotice("The platform confirmed publication.");
                    } catch (e) {
                      await reload();
                      throw e;
                    }
                  })
                }
              >
                {busy ? "Waiting for the platform…" : "Confirm & publish now"}
              </button>
              <button disabled={busy} onClick={() => setConfirm(null)}>
                Keep planning
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {guide && (
        <Dialog
          title={"Start on " + labels[guide]}
          onClose={() => setGuide(null)}
        >
          <div className="confirm-body">
            <p>
              Mika helps you prepare. You complete signup and verification
              directly with {labels[guide]}.
            </p>
            <label>
              Suggested profile bio
              <textarea
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                void act(async () => {
                  await navigator.clipboard.writeText(bio);
                }, "Bio copied.")
              }
            >
              Copy bio
            </button>
            <ol className="setup-list">
              <li>
                Prepare your public brand name, profile image and website.
              </li>
              <li>Open the official signup page and create your account.</li>
              <li>
                Complete any verification with the platform. Never enter
                passwords or verification codes into Mika.
              </li>
              {guide === "instagram" && (
                <li>
                  Switch to a professional account and link it to a Facebook
                  Page for this integration.
                </li>
              )}
              <li>
                Return here and connect the account using the platform’s
                authorization screen.
              </li>
            </ol>
            <a
              className="button-link primary"
              href={signup[guide]}
              target="_blank"
              rel="noreferrer"
            >
              Open official {labels[guide]} signup ↗
            </a>
            <p className="footnote">
              Opening this link does not create or connect an account.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
