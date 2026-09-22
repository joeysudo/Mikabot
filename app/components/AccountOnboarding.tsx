"use client";

import { useState } from "react";
import type { Account, Brief, Platform } from "../../lib/domain";
import type { AccountChannel, AccountKit } from "../../lib/accountKit";

const channels: Array<{
  id: AccountChannel;
  label: string;
  mark: string;
  setup: string;
}> = [
  { id: "instagram", label: "Instagram", mark: "◎", setup: "https://www.instagram.com/accounts/emailsignup/" },
  { id: "facebook", label: "Facebook", mark: "f", setup: "https://www.facebook.com/pages/create/" },
  { id: "linkedin", label: "LinkedIn", mark: "in", setup: "https://www.linkedin.com/signup" },
  { id: "x", label: "X", mark: "𝕏", setup: "https://x.com/i/flow/signup" },
  { id: "discord", label: "Discord", mark: "◉", setup: "https://discord.com/developers/applications" },
  { id: "telegram", label: "Telegram", mark: "➤", setup: "https://t.me/BotFather" },
  { id: "whatsapp", label: "WhatsApp", mark: "◌", setup: "https://business.whatsapp.com/" },
  { id: "sms", label: "SMS", mark: "✉", setup: "https://www.twilio.com/try-twilio" },
  { id: "email", label: "Email", mark: "@", setup: "https://accounts.google.com/signup" },
];

const social = new Set<AccountChannel>([
  "instagram",
  "facebook",
  "linkedin",
  "x",
]);

type Props = {
  brief: Brief;
  accounts: Account[];
  providers: Record<
    Platform,
    {
      configured: boolean;
      appConfigured: boolean;
      securityConfigured: boolean;
      callback: string;
      consoleUrl: string;
      scopes: string[];
      reads: string;
      review: string;
    }
  >;
  aiProvider: string | null;
  onComplete: () => Promise<void>;
};

export default function AccountOnboarding({
  brief,
  accounts,
  providers,
  aiProvider,
  onComplete,
}: Props) {
  const [path, setPath] = useState<"choose" | "connect" | "create">("choose");
  const [selected, setSelected] = useState<AccountChannel[]>(
    channels.map((channel) => channel.id),
  );
  const [brandName, setBrandName] = useState("");
  const [offering, setOffering] = useState(brief.offering);
  const [audience, setAudience] = useState(brief.audience);
  const [tone, setTone] = useState(brief.tone || "Warm and helpful");
  const [kit, setKit] = useState<AccountKit | null>(null);
  const [developer, setDeveloper] = useState<Platform | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function api(route: string, data: unknown) {
    const response = await fetch("/api/" + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = (await response.json()) as {
      error?: string;
      url?: string;
      kit?: AccountKit;
    };
    if (!response.ok) throw new Error(result.error || "Something went wrong.");
    return result;
  }

  async function connect(channel: AccountChannel) {
    setBusy(channel);
    setError("");
    try {
      const result = await api(`oauth/${channel}/start`, {});
      if (!result.url) throw new Error("The connection link is unavailable.");
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection could not start.");
      setBusy("");
    }
  }

  async function generateKit() {
    setBusy("kit");
    setError("");
    try {
      const result = await api("account-kit", {
        brandName,
        offering,
        audience,
        tone,
        channels: selected,
      });
      if (!result.kit) throw new Error("Mika returned no setup kit.");
      setKit(result.kit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mika could not prepare the kit.");
    } finally {
      setBusy("");
    }
  }

  async function finish(mode: "connected" | "guided" | "simulation") {
    setBusy(mode);
    setError("");
    try {
      await api("onboarding", { mode });
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup could not be completed.");
      setBusy("");
    }
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-brand">mika<span>✳</span></div>
      <section className="onboarding-card">
        <p className="eyebrow">ACCOUNT SETUP · STEP ONE</p>
        <h1>First, give Mika somewhere to work.</h1>
        <p className="onboarding-lead">
          Connect accounts you already own, or let Mika prepare a consistent
          profile kit and guide you through creating new ones.
        </p>

        {path === "choose" && (
          <div className="onboarding-paths">
            <button onClick={() => setPath("connect")}>
              <span>◎</span>
              <strong>Connect my accounts</strong>
              <small>Authorize existing accounts and choose what Mika can do.</small>
              <b>Start connecting →</b>
            </button>
            <button onClick={() => setPath("create")}>
              <span>✦</span>
              <strong>Help me create accounts</strong>
              <small>Use Gemini to prepare names, bios and a setup plan for all channels.</small>
              <b>Ask Mika →</b>
            </button>
          </div>
        )}

        {path === "connect" && (
          <>
            <div className="onboarding-section-head">
              <button className="text-button" onClick={() => setPath("choose")}>← Back</button>
              <div><h2>Connect existing accounts</h2><p>Start with one account. You can add the rest later.</p></div>
            </div>
            <div className="setup-channel-grid">
              {channels.map((channel) => {
                const configured = social.has(channel.id)
                  ? providers[channel.id as Platform]?.configured
                  : false;
                const connected = accounts.some(
                  (account) => account.platform === channel.id,
                );
                return (
                  <article key={channel.id}>
                    <span className="setup-mark">{channel.mark}</span>
                    <div><strong>{channel.label}</strong><small>{connected ? "Connected" : social.has(channel.id) ? "OAuth connection" : "Connector setup"}</small></div>
                    {connected ? (
                      <span className="setup-done">✓ Ready</span>
                    ) : configured ? (
                      <button disabled={Boolean(busy)} onClick={() => void connect(channel.id)}>{busy === channel.id ? "Opening…" : "Connect"}</button>
                    ) : social.has(channel.id) ? (
                      <button onClick={() => setDeveloper(channel.id as Platform)}>Set up app</button>
                    ) : (
                      <a href={channel.setup} target="_blank" rel="noreferrer">Open setup ↗</a>
                    )}
                  </article>
                );
              })}
            </div>
            {developer && (
              <div className="onboarding-developer">
                <div>
                  <p className="eyebrow">{developer.toUpperCase()} · DEVELOPER APP</p>
                  <h3>Configure OAuth once, then users connect inside Mika.</h3>
                  <p>{providers[developer].reads}</p>
                </div>
                <label>
                  Callback URL
                  <div className="copy-field">
                    <code>{providers[developer].callback}</code>
                    <button onClick={() => void navigator.clipboard.writeText(providers[developer].callback)}>Copy</button>
                  </div>
                </label>
                <div className="scope-list">
                  {providers[developer].scopes.map((scope) => <code key={scope}>{scope}</code>)}
                </div>
                <p className="setup-note">{providers[developer].review}</p>
                <a className="button-link primary" href={providers[developer].consoleUrl} target="_blank" rel="noreferrer">Open official developer console ↗</a>
              </div>
            )}
            <p className="setup-note">Mika never receives your password. Platform authorization and connector credentials stay under your control.</p>
            <div className="onboarding-actions">
              <button className="primary" disabled={!accounts.length || Boolean(busy)} onClick={() => void finish("connected")}>Continue to Mika</button>
              <button disabled={Boolean(busy)} onClick={() => void finish("simulation")}>Explore in simulation mode</button>
            </div>
          </>
        )}

        {path === "create" && !kit && (
          <>
            <div className="onboarding-section-head">
              <button className="text-button" onClick={() => setPath("choose")}>← Back</button>
              <div><h2>Create your account kit with Mika</h2><p>No passwords, verification codes or identity details are needed here.</p></div>
            </div>
            <div className="setup-form">
              <label>Brand or business name <input value={brandName} maxLength={80} placeholder="Optional" onChange={(e) => setBrandName(e.target.value)} /></label>
              <label>What do you offer? <input value={offering} maxLength={500} placeholder="e.g. Small-group pottery workshops" onChange={(e) => setOffering(e.target.value)} /></label>
              <label>Who is it for? <input value={audience} maxLength={500} placeholder="e.g. Curious beginners" onChange={(e) => setAudience(e.target.value)} /></label>
              <label>Tone <input value={tone} maxLength={120} onChange={(e) => setTone(e.target.value)} /></label>
            </div>
            <p className="field-title">Create a plan for</p>
            <div className="setup-channel-choices">
              {channels.map((channel) => (
                <button key={channel.id} aria-pressed={selected.includes(channel.id)} className={selected.includes(channel.id) ? "selected" : ""} onClick={() => setSelected(selected.includes(channel.id) ? selected.filter((id) => id !== channel.id) : [...selected, channel.id])}>
                  {channel.mark} {channel.label}
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <button className="primary" disabled={busy === "kit" || !offering || !audience || !selected.length || aiProvider !== "gemini"} onClick={() => void generateKit()}>{busy === "kit" ? "Mika is preparing…" : "✦ Build my account kit"}</button>
              {aiProvider !== "gemini" && <span>Gemini is not configured in this local workspace.</span>}
            </div>
          </>
        )}

        {path === "create" && kit && (
          <>
            <div className="kit-heading"><div><p className="eyebrow">MIKA · GEMINI</p><h2>{kit.brandName || "Your account kit"}</h2><p>Copy the profile details, then complete each platform’s own verification.</p></div><button onClick={() => setKit(null)}>Edit brief</button></div>
            <div className="kit-summary">
              <div><small>USERNAME IDEAS</small><p>{kit.usernameIdeas.join(" · ")}</p></div>
              <div><small>SHORT BIO</small><p>{kit.bioShort}</p></div>
              <div><small>LONG BIO</small><p>{kit.bioLong}</p></div>
            </div>
            <div className="kit-grid">
              {kit.channels.map((channel) => (
                <article key={channel.channel}>
                  <h3>{channels.find((item) => item.id === channel.channel)?.label}</h3>
                  <ol>{channel.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  <a href={channel.officialUrl} target="_blank" rel="noreferrer">Open official setup ↗</a>
                </article>
              ))}
            </div>
            <div className="setup-note"><strong>You stay in control.</strong> Mika cannot accept terms, solve captchas, verify a phone or email, or grant permissions on your behalf.</div>
            <div className="onboarding-actions"><button className="primary" disabled={Boolean(busy)} onClick={() => void finish("guided")}>Save this plan and enter Mika</button></div>
          </>
        )}

        {error && <div className="error" role="alert">{error}</div>}
      </section>
    </main>
  );
}
