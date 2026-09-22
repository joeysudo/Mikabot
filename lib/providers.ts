import type { Env } from "./db";
import type { Platform, Post } from "./domain";
import { encode, hash, origin } from "./security";
export function providerConfig(p: Platform, env: Env) {
  const prefix =
    p === "instagram" || p === "facebook" ? "META" : p.toUpperCase();
  return {
    id: String(env[`${prefix}_CLIENT_ID`] || ""),
    secret: String(env[`${prefix}_CLIENT_SECRET`] || ""),
  };
}
export function configured(p: Platform, env: Env) {
  const c = providerConfig(p, env);
  return Boolean(
    c.id &&
    c.secret &&
    env.TOKEN_ENCRYPTION_KEY &&
    env.SESSION_SECRET &&
    env.WORKSPACE_PASSWORD &&
    env.APP_ORIGIN,
  );
}
function version(env: Env) {
  const v = env.META_API_VERSION || "v23.0";
  if (!/^v\d+\.\d+$/.test(v)) throw new Error("Invalid Meta API version.");
  return v;
}
export async function authorizationUrl(
  p: Platform,
  env: Env,
  req: Request,
  state: string,
  verifier: string,
) {
  const c = providerConfig(p, env);
  const redirect = origin(env, req) + `/api/oauth/${p}/callback`;
  const u = new URL(
    p === "x"
      ? "https://x.com/i/oauth2/authorize"
      : p === "linkedin"
        ? "https://www.linkedin.com/oauth/v2/authorization"
        : `https://www.facebook.com/${version(env)}/dialog/oauth`,
  );
  const scope =
    p === "x"
      ? "tweet.read tweet.write users.read"
      : p === "linkedin"
        ? "openid profile w_member_social"
        : p === "instagram"
          ? "pages_show_list pages_read_engagement instagram_basic instagram_content_publish instagram_manage_comments"
          : "pages_show_list pages_read_engagement pages_manage_posts pages_manage_engagement";
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: c.id,
    redirect_uri: redirect,
    scope,
    state,
  }))
    u.searchParams.set(k, v);
  if (p === "x") {
    u.searchParams.set("code_challenge", await hash(verifier));
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}
// Responses are deliberately not logged: provider bodies can contain credentials or personal data.
export class ProviderError extends Error {
  constructor(
    public status: number,
    public uncertain: boolean,
  ) {
    super(
      status === 401
        ? "Account authorization expired. Reconnect this channel."
        : status === 403
          ? "The platform denied access. Check app permissions and account eligibility."
          : status === 429
            ? "The platform rate limit was reached. Try again later."
            : uncertain
              ? "The platform result is uncertain. Check the platform before retrying."
              : "The platform rejected this request. Check your content and platform setup.",
    );
  }
}
export async function providerFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
  } catch {
    throw new ProviderError(0, true);
  }
  if (!res.ok) throw new ProviderError(res.status, res.status >= 500);
  return res;
}
// Only explicitly validated fields below are used from these heterogeneous platform payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(url: string, init: RequestInit = {}): Promise<any> {
  const r = await providerFetch(url, init);
  try {
    return await r.json();
  } catch {
    throw new ProviderError(0, true);
  }
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const form = (body: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(body),
});
export type Connected = {
  remoteId: string;
  label: string;
  token: string;
  expiresAt: number;
};
export async function exchange(
  p: Platform,
  code: string,
  verifier: string,
  env: Env,
  req: Request,
): Promise<Connected[]> {
  const c = providerConfig(p, env),
    redirect = origin(env, req) + `/api/oauth/${p}/callback`;
  let token: string;
  let expires = Date.now() + 3600000;
  if (p === "x" || p === "linkedin") {
    const opts = form({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: c.id,
      ...(p === "x"
        ? { code_verifier: verifier }
        : { client_secret: c.secret }),
    });
    if (p === "x")
      Object.assign(opts.headers, {
        Authorization: `Basic ${btoa(c.id + ":" + c.secret)}`,
      });
    const data = await json(
      p === "x"
        ? "https://api.x.com/2/oauth2/token"
        : "https://www.linkedin.com/oauth/v2/accessToken",
      opts,
    );
    token = data.access_token;
    if (Number(data.expires_in) > 0)
      expires = Date.now() + Number(data.expires_in) * 1000;
    if (typeof token !== "string")
      throw new Error("The platform did not return an access token.");
    const profile = await json(
      p === "x"
        ? "https://api.x.com/2/users/me"
        : "https://api.linkedin.com/v2/userinfo",
      { headers: bearer(token) },
    );
    const id = p === "x" ? profile.data?.id : profile.sub;
    if (typeof id !== "string")
      throw new Error("The platform did not identify the authorized account.");
    return [
      {
        remoteId: id,
        label:
          p === "x"
            ? `@${profile.data.username}`
            : String(profile.name || "LinkedIn member"),
        token,
        expiresAt: expires,
      },
    ];
  }
  const root = `https://graph.facebook.com/${version(env)}`;
  const short = await json(
    root + "/oauth/access_token",
    form({
      client_id: c.id,
      client_secret: c.secret,
      redirect_uri: redirect,
      code,
    }),
  );
  if (typeof short.access_token !== "string")
    throw new Error("Meta did not return an access token.");
  const long = await json(
    root + "/oauth/access_token",
    form({
      grant_type: "fb_exchange_token",
      client_id: c.id,
      client_secret: c.secret,
      fb_exchange_token: short.access_token,
    }),
  );
  token = long.access_token;
  if (typeof token !== "string")
    throw new Error("Meta did not return an access token.");
  if (Number(long.expires_in) > 0)
    expires = Date.now() + Number(long.expires_in) * 1000;
  const pages = await json(
    root +
      "/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100",
    { headers: bearer(token) },
  );
  const accounts: Connected[] = [];
  for (const page of pages.data || []) {
    if (typeof page.access_token !== "string") continue;
    const id = p === "facebook" ? page.id : page.instagram_business_account?.id;
    if (typeof id !== "string") continue;
    accounts.push({
      remoteId: id,
      label: p === "facebook" ? String(page.name) : `${page.name} · Instagram`,
      token: page.access_token,
      expiresAt: expires,
    });
  }
  if (!accounts.length)
    throw new Error(
      p === "instagram"
        ? "No eligible Instagram professional account linked to a Page was returned."
        : "No manageable Facebook Page was returned.",
    );
  return accounts;
}
export async function publish(
  p: Platform,
  post: Post,
  remoteId: string,
  token: string,
  env: Env,
): Promise<string> {
  const text = post.captions[p]!;
  const root = `https://graph.facebook.com/${version(env)}`;
  if (p === "x") {
    const data = await json("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!data.data?.id) throw new ProviderError(0, true);
    return String(data.data.id);
  }
  if (p === "linkedin") {
    const res = await providerFetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        ...bearer(token),
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: `urn:li:person:${remoteId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    const id = res.headers.get("x-restli-id");
    if (!id) throw new ProviderError(0, true);
    return id;
  }
  if (p === "facebook") {
    const opts = form({ message: text });
    Object.assign(opts.headers, bearer(token));
    const data = await json(
      `${root}/${encodeURIComponent(remoteId)}/feed`,
      opts,
    );
    if (!data.id) throw new ProviderError(0, true);
    return String(data.id);
  }
  const create = form({ image_url: post.imageUrl, caption: text });
  Object.assign(create.headers, bearer(token));
  const container = await json(
    `${root}/${encodeURIComponent(remoteId)}/media`,
    create,
  );
  if (!container.id) throw new ProviderError(0, true);
  const check = await json(
    `${root}/${encodeURIComponent(container.id)}?fields=status_code`,
    { headers: bearer(token) },
  );
  // No feed publication was attempted if preparation is not finished. Retrying can create
  // an unused container but cannot create a duplicate public post from this branch.
  if (check.status_code !== "FINISHED") throw new ProviderError(422, false);
  const submit = form({ creation_id: String(container.id) });
  Object.assign(submit.headers, bearer(token));
  const result = await json(
    `${root}/${encodeURIComponent(remoteId)}/media_publish`,
    submit,
  );
  if (!result.id) throw new ProviderError(0, true);
  return String(result.id);
}
export function verifier() {
  return encode(crypto.getRandomValues(new Uint8Array(32)));
}
