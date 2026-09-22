import type { Env } from "./db";
export const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const decode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export async function hash(s: string) {
  return encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  );
}
export function origin(env: Env, req: Request) {
  if (env.APP_ORIGIN) {
    const u = new URL(env.APP_ORIGIN);
    if (u.pathname !== "/" || u.search || u.hash)
      throw new Error("APP_ORIGIN must be an origin.");
    if (
      u.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(u.hostname)
    )
      throw new Error("HTTPS is required.");
    return u.origin;
  }
  const u = new URL(req.url);
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return u.origin;
  throw new Error("Configure APP_ORIGIN before hosting Mika.");
}
export function csrf(req: Request, env: Env) {
  if (req.headers.get("origin") !== origin(env, req))
    throw new Error("A same-origin request is required.");
}
export function cookie(req: Request, name: string) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function cookieHeader(
  name: string,
  value: string,
  req: Request,
  seconds: number,
) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function signingKey(env: Env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
    throw new Error("Configure a strong SESSION_SECRET.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function newSession(env: Env) {
  const payload = encode(
    new TextEncoder().encode(
      JSON.stringify({
        expires: Date.now() + 43200000,
        nonce: crypto.randomUUID(),
      }),
    ),
  );
  return (
    payload +
    "." +
    encode(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          await signingKey(env),
          new TextEncoder().encode(payload),
        ),
      ),
    )
  );
}
export async function authorized(req: Request, env: Env) {
  const u = new URL(req.url);
  if (!env.WORKSPACE_PASSWORD)
    return (
      env.LOCAL_DEV_MODE === "true" &&
      ["localhost", "127.0.0.1"].includes(u.hostname) &&
      !env.APP_ORIGIN
    );
  try {
    const [payload, sig] = cookie(req, "mika_session").split(".");
    if (!payload || !sig) return false;
    const ok = await crypto.subtle.verify(
      "HMAC",
      await signingKey(env),
      decode(sig),
      new TextEncoder().encode(payload),
    );
    return (
      ok &&
      JSON.parse(new TextDecoder().decode(decode(payload))).expires > Date.now()
    );
  } catch {
    return false;
  }
}
async function aes(env: Env) {
  if (!env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY.length < 32)
    throw new Error(
      "Configure TOKEN_ENCRYPTION_KEY before connecting accounts.",
    );
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(env.TOKEN_ENCRYPTION_KEY),
    ),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(value: string, env: Env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aes(env),
    new TextEncoder().encode(value),
  );
  return encode(iv) + "." + encode(new Uint8Array(ciphertext));
}
export async function unseal(value: string, env: Env) {
  const [iv, data] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv) },
      await aes(env),
      decode(data),
    ),
  );
}
