import { agentApi } from "./agent/runtime";
import { setup, getPost, insertPost, log, type Env } from "./db";
import {
  platforms,
  isPlatform,
  validatePost,
  validateBrief,
  defaultBrief,
  assertPublishable,
  publishIssue,
  type Account,
  type Post,
  type Platform,
} from "./domain";
import {
  authorized,
  csrf,
  cookie,
  cookieHeader,
  newSession,
  hash,
  origin,
  seal,
  unseal,
} from "./security";
import {
  configured,
  authorizationUrl,
  exchange,
  verifier,
  publish,
  ProviderError,
  providerSetup,
  accountSnapshot,
} from "./providers";
import { plan } from "./planner";
import { aiProvider } from "./ai";
import { createAccountKit } from "./accountKit";
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
async function body(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new Error("JSON is required.");
  const reader = req.body?.getReader();
  let text = "";
  if (reader) {
    const decoder = new TextDecoder();
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 280000) {
        await reader.cancel();
        throw new Error("Request is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  return JSON.parse(text || "{}");
}
async function accounts(env: Env) {
  const result = await env.DB.prepare(
    "SELECT id,platform,label,remote_id AS remoteId,expires_at AS expiresAt,active FROM accounts",
  ).all<Account>();
  return result.results;
}
async function savePost(env: Env, post: Post, revision: number) {
  const result = await env.DB.prepare(
    "UPDATE posts SET data=?,revision=?,status=? WHERE id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM attempts WHERE post_id=? AND status IN ('pending','uncertain','published'))",
  )
    .bind(
      JSON.stringify(post),
      post.revision,
      post.status,
      post.id,
      revision,
      post.id,
    )
    .run();
  if (!result.meta.changes)
    throw new Error(
      "This draft changed or has a publication record. Reload it; duplicate it to create a new post.",
    );
}
export async function handle(req: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(req.url),
      path = url.pathname.slice(5).split("/").map(decodeURIComponent);
    if (req.method !== "GET") csrf(req, env);
    await setup(env.DB);
    if (path[0] === "login" && req.method === "POST") {
      const x = await body(req);
      if (!env.WORKSPACE_PASSWORD || env.WORKSPACE_PASSWORD.length < 16)
        return json(
          {
            error: "Configure a workspace password of at least 16 characters.",
          },
          503,
        );
      const rateKey = "workspace-login";
      await env.DB.prepare("DELETE FROM login_limits WHERE expires_at<?")
        .bind(Date.now())
        .run();
      const rate = await env.DB.prepare(
        "INSERT INTO login_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
      )
        .bind(rateKey, Date.now() + 900000)
        .first<{ count: number }>();
      if ((rate?.count || 0) > 10)
        return json(
          { error: "Too many attempts. Try again in 15 minutes." },
          429,
        );
      if (
        typeof x.password !== "string" ||
        (await hash(x.password)) !== (await hash(env.WORKSPACE_PASSWORD))
      )
        return json({ error: "Incorrect workspace password." }, 401);
      await env.DB.prepare("DELETE FROM login_limits WHERE key=?")
        .bind(rateKey)
        .run();
      return json({ ok: true }, 200, {
        "Set-Cookie": cookieHeader(
          "mika_session",
          await newSession(env),
          req,
          43200,
        ),
      });
    }
    if (!(await authorized(req, env)))
      return json(
        { error: "Unlock your private workspace to continue.", locked: true },
        401,
      );
    if (path[0] === "agent")
      return json(
        await agentApi(
          req,
          env,
          path,
          req.method === "GET" ? {} : await body(req),
        ),
      );
    if (path[0] === "logout" && req.method === "POST")
      return json({ ok: true }, 200, {
        "Set-Cookie": cookieHeader("mika_session", "", req, 0),
      });
    if (path[0] === "state" && req.method === "GET") {
      const [posts, brief, onboarding, accts, attempts, activity] = await Promise.all([
        env.DB.prepare(
          "SELECT data FROM posts ORDER BY created_at DESC LIMIT 500",
        ).all<{ data: string }>(),
        env.DB.prepare("SELECT value FROM settings WHERE key='brief'").first<{
          value: string;
        }>(),
        env.DB.prepare(
          "SELECT value FROM settings WHERE key='onboarding_complete'",
        ).first<{ value: string }>(),
        accounts(env),
        env.DB.prepare(
          "SELECT id,post_id AS postId,platform,revision,status,remote_id AS remoteId,error,created_at AS createdAt FROM attempts ORDER BY created_at DESC LIMIT 500",
        ).all(),
        env.DB.prepare(
          "SELECT message,created_at AS createdAt FROM activity ORDER BY created_at DESC LIMIT 30",
        ).all(),
      ]);
      return json({
        posts: posts.results.map((r) => JSON.parse(r.data)),
        brief: brief ? JSON.parse(brief.value) : defaultBrief,
        accounts: accts,
        attempts: attempts.results,
        activity: activity.results,
        providers: Object.fromEntries(
          platforms.map((p) => [p, providerSetup(p, env, req)]),
        ),
        aiReady: Boolean(aiProvider(env)),
        aiProvider: aiProvider(env),
        onboardingComplete: onboarding?.value === "true",
        localMode: !env.WORKSPACE_PASSWORD,
      });
    }
    if (path[0] === "account-kit" && req.method === "POST") {
      if (aiProvider(env) !== "gemini")
        throw new Error("Add a local Gemini key before asking Mika for a setup kit.");
      return json({ kit: await createAccountKit(env, await body(req)) });
    }
    if (path[0] === "onboarding" && req.method === "POST") {
      const x = await body(req);
      if (!["connected", "guided", "simulation"].includes(String(x.mode)))
        throw new Error("Choose an account setup path.");
      if (x.mode === "connected" && !(await accounts(env)).length)
        throw new Error("Connect at least one account before continuing.");
      await env.DB.prepare(
        "INSERT INTO settings(key,value) VALUES('onboarding_complete','true') ON CONFLICT(key) DO UPDATE SET value='true'",
      ).run();
      await log(
        env.DB,
        x.mode === "connected"
          ? "Account setup completed with a connected social account."
          : x.mode === "guided"
            ? "Mika created an account setup kit. Account verification remains with the owner."
            : "Workspace started in simulation mode. Connect accounts before live actions.",
      );
      return json({ ok: true });
    }
    if (path[0] === "brief" && req.method === "PUT") {
      const brief = validateBrief(await body(req));
      await env.DB.prepare(
        "INSERT INTO settings(key,value) VALUES('brief',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
        .bind(JSON.stringify(brief))
        .run();
      return json({ brief });
    }
    if (path[0] === "plan" && req.method === "POST") {
      const x = await body(req);
      const brief = validateBrief(x.brief);
      if (
        !Array.isArray(x.platforms) ||
        !x.platforms.length ||
        x.platforms.length > 4 ||
        !x.platforms.every(isPlatform)
      )
        throw new Error("Select supported channels.");
      const result = await plan(
        brief,
        x.platforms,
        x.start,
        x.mode === "template"
          ? {
              ...env,
              GEMINI_API_KEY: undefined,
              OPENAI_API_KEY: undefined,
            }
          : env,
      );
      const posts = [];
      for (const draft of result.posts)
        posts.push(await insertPost(env.DB, draft));
      await log(
        env.DB,
        `${result.source === "template" ? "Starter templates" : `Mika ${result.source}`} created ${posts.length} drafts. Review before approval.`,
      );
      return json({ posts, source: result.source });
    }
    if (path[0] === "posts") {
      if (path.length === 1 && req.method === "POST") {
        const fields = validatePost(await body(req));
        const post = await insertPost(env.DB, fields);
        await log(env.DB, "A new draft was created.");
        return json({ post }, 201);
      }
      const post = await getPost(env.DB, path[1]);
      if (path.length === 2 && req.method === "PUT") {
        const x = await body(req);
        if (x.revision !== post.revision)
          throw new Error("This post changed. Reload before saving.");
        const next = {
          ...post,
          ...validatePost(x),
          revision: post.revision + 1,
          approvedRevision: null,
          status: "draft" as const,
          updatedAt: new Date().toISOString(),
        };
        await savePost(env, next, post.revision);
        await log(env.DB, "Draft updated. Previous approval was cleared.");
        return json({ post: next });
      }
      if (path.length === 2 && req.method === "DELETE") {
        const x = await body(req);
        if (x.revision !== post.revision)
          throw new Error("This post changed. Reload before deleting.");
        const result = await env.DB.prepare(
          "DELETE FROM posts WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM attempts WHERE post_id=? AND status IN ('pending','uncertain','published'))",
        )
          .bind(post.id, post.revision, post.id)
          .run();
        if (!result.meta.changes)
          throw new Error("Published or pending posts cannot be deleted here.");
        return json({ ok: true });
      }
      if (path[2] === "review" && req.method === "POST") {
        const x = await body(req);
        if (x.revision !== post.revision)
          throw new Error("This post changed. Reload before reviewing.");
        const next = {
          ...post,
          status: "review" as const,
          approvedRevision: null,
        };
        await savePost(env, next, post.revision);
        await log(env.DB, "A draft is ready for review.");
        return json({ post: next });
      }
      if (path[2] === "approve" && req.method === "POST") {
        const x = await body(req);
        if (x.revision !== post.revision)
          throw new Error("This post changed. Review the latest version.");
        for (const p of post.platforms) {
          const issue = publishIssue(post, p);
          if (issue) throw new Error(issue);
        }
        const next = {
          ...post,
          status: "approved" as const,
          approvedRevision: post.revision,
        };
        await savePost(env, next, post.revision);
        await log(
          env.DB,
          "The current draft revision was approved. Publishing still needs confirmation.",
        );
        return json({ post: next });
      }
      if (path[2] === "publish" && req.method === "POST") {
        const x = await body(req);
        if (
          !isPlatform(x.platform) ||
          x.confirm !== true ||
          x.revision !== post.revision
        )
          throw new Error("Confirm the platform and current revision.");
        const p: Platform = x.platform;
        assertPublishable(post, p);
        if (!configured(p, env))
          throw new Error(
            "This platform is not configured. Open Channels for setup.",
          );
        const account = await env.DB.prepare(
          "SELECT id,remote_id,secret,expires_at FROM accounts WHERE platform=? AND active=1",
        )
          .bind(p)
          .first<{
            id: string;
            remote_id: string;
            secret: string;
            expires_at: number;
          }>();
        if (!account || account.id !== x.accountId)
          throw new Error(
            "The selected account changed. Review the destination again.",
          );
        if (account.expires_at <= Date.now())
          throw new Error(
            "This connection expired. Reconnect before publishing.",
          );
        const token = await unseal(account.secret, env);
        const id = crypto.randomUUID(),
          now = new Date().toISOString();
        let claim = await env.DB.prepare(
          "INSERT OR IGNORE INTO attempts(id,post_id,platform,revision,status,created_at) SELECT ?,?,?,?,'pending',? FROM posts WHERE id=? AND revision=? AND status='approved' RETURNING id",
        )
          .bind(id, post.id, p, post.revision, now, post.id, post.revision)
          .first<{ id: string }>();
        if (!claim)
          claim = await env.DB.prepare(
            "UPDATE attempts SET status='pending',error=NULL,created_at=? WHERE post_id=? AND platform=? AND revision=? AND status='failed' AND EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND status='approved') RETURNING id",
          )
            .bind(now, post.id, p, post.revision, post.id, post.revision)
            .first<{ id: string }>();
        if (!claim)
          throw new Error(
            "This revision is already publishing, published, or awaiting reconciliation.",
          );
        let remoteId: string;
        try {
          remoteId = await publish(p, post, account.remote_id, token, env);
        } catch (error) {
          const uncertain =
            !(error instanceof ProviderError) || error.uncertain;
          const message =
            error instanceof ProviderError
              ? error.message
              : "Publishing needs reconciliation. Check the platform.";
          await env.DB.prepare(
            "UPDATE attempts SET status=?,error=? WHERE id=?",
          )
            .bind(uncertain ? "uncertain" : "failed", message, claim.id)
            .run();
          await log(
            env.DB,
            `${p}: ${uncertain ? "publication needs reconciliation" : "publication rejected"}.`,
          );
          return json({ error: message }, 502);
        }
        // If this write fails after provider success, the pending record blocks duplicate sends.
        await env.DB.prepare(
          "UPDATE attempts SET status='published',remote_id=?,error=NULL WHERE id=?",
        )
          .bind(remoteId, claim.id)
          .run();
        const successes = await env.DB.prepare(
          "SELECT platform FROM attempts WHERE post_id=? AND revision=? AND status='published'",
        )
          .bind(post.id, post.revision)
          .all<{ platform: string }>();
        if (
          post.platforms.every((p) =>
            successes.results.some((s) => s.platform === p),
          )
        ) {
          const next = { ...post, status: "published" };
          await env.DB.prepare(
            "UPDATE posts SET status=?,data=? WHERE id=? AND revision=?",
          )
            .bind("published", JSON.stringify(next), post.id, post.revision)
            .run();
        }
        await log(env.DB, `${p} confirmed publication.`);
        return json({ remoteId });
      }
    }
    if (
      path[0] === "attempts" &&
      path[2] === "resolve" &&
      req.method === "POST"
    ) {
      const x = await body(req);
      if (x.confirmAbsent !== true)
        throw new Error(
          "Check the platform and confirm the post is absent first.",
        );
      const result = await env.DB.prepare(
        "UPDATE attempts SET status='failed',error='Owner checked the platform and confirmed no post exists.' WHERE id=? AND (status='uncertain' OR (status='pending' AND created_at<?))",
      )
        .bind(path[1], new Date(Date.now() - 120000).toISOString())
        .run();
      if (!result.meta.changes)
        throw new Error("This attempt cannot be retried yet.");
      await log(
        env.DB,
        "Owner reconciled an uncertain publication before allowing a retry.",
      );
      return json({ ok: true });
    }
    if (
      path[0] === "accounts" &&
      path[2] === "select" &&
      req.method === "POST"
    ) {
      const row = await env.DB.prepare(
        "SELECT platform FROM accounts WHERE id=?",
      )
        .bind(path[1])
        .first<{ platform: string }>();
      if (!row) throw new Error("Account not found.");
      await env.DB.batch([
        env.DB.prepare("UPDATE accounts SET active=0 WHERE platform=?").bind(
          row.platform,
        ),
        env.DB.prepare("UPDATE accounts SET active=1 WHERE id=?").bind(path[1]),
      ]);
      return json({ ok: true });
    }
    if (
      path[0] === "accounts" &&
      path[2] === "snapshot" &&
      req.method === "GET"
    ) {
      const row = await env.DB.prepare(
        "SELECT platform,remote_id,secret,expires_at FROM accounts WHERE id=?",
      )
        .bind(path[1])
        .first<{
          platform: Platform;
          remote_id: string;
          secret: string;
          expires_at: number;
        }>();
      if (!row || !isPlatform(row.platform))
        throw new Error("Account not found.");
      if (row.expires_at <= Date.now())
        throw new Error("This authorization expired. Reconnect the account.");
      return json({
        snapshot: await accountSnapshot(
          row.platform,
          row.remote_id,
          await unseal(row.secret, env),
          env,
        ),
      });
    }
    if (path[0] === "accounts" && req.method === "DELETE") {
      await env.DB.prepare("DELETE FROM accounts WHERE id=?")
        .bind(path[1])
        .run();
      await log(
        env.DB,
        "An account was disconnected locally. Platform permissions can be revoked in platform settings.",
      );
      return json({ ok: true });
    }
    if (path[0] === "oauth" && isPlatform(path[1])) {
      const p = path[1];
      if (!configured(p, env))
        throw new Error(
          "Configure workspace security and this platform’s developer app before connecting.",
        );
      if (path[2] === "start" && req.method === "POST") {
        const state = verifier(),
          v = verifier(),
          nonce = verifier();
        await env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<?")
          .bind(Date.now())
          .run();
        await env.DB.prepare(
          "INSERT INTO oauth_states(state,provider,verifier,session_hash,expires_at) VALUES(?,?,?,?,?)",
        )
          .bind(
            state,
            p,
            await seal(v, env),
            await hash(cookie(req, "mika_session") + nonce),
            Date.now() + 600000,
          )
          .run();
        return json(
          { url: await authorizationUrl(p, env, req, state, v) },
          200,
          { "Set-Cookie": cookieHeader("mika_oauth", nonce, req, 600) },
        );
      }
      if (path[2] === "callback" && req.method === "GET") {
        const state = url.searchParams.get("state") || "";
        const row = await env.DB.prepare(
          "DELETE FROM oauth_states WHERE state=? AND provider=? AND session_hash=? AND expires_at>? RETURNING verifier",
        )
          .bind(
            state,
            p,
            await hash(cookie(req, "mika_session") + cookie(req, "mika_oauth")),
            Date.now(),
          )
          .first<{ verifier: string }>();
        if (!row)
          throw new Error(
            "Authorization expired or could not be verified. Start again.",
          );
        if (url.searchParams.has("error"))
          return Response.redirect(
            origin(env, req) + "/?connection=cancelled",
            303,
          );
        const code = url.searchParams.get("code");
        if (!code)
          throw new Error("The platform did not return an authorization code.");
        const found = await exchange(
          p,
          code,
          await unseal(row.verifier, env),
          env,
          req,
        );
        const stmts = [];
        for (const item of found) {
          stmts.push(
            env.DB.prepare(
              "INSERT INTO accounts(id,platform,label,remote_id,secret,expires_at,active) VALUES(?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET label=excluded.label,secret=excluded.secret,expires_at=excluded.expires_at",
            ).bind(
              `${p}:${item.remoteId}`,
              p,
              item.label,
              item.remoteId,
              await seal(item.token, env),
              item.expiresAt,
            ),
          );
        }
        await env.DB.batch(stmts);
        await log(
          env.DB,
          `${p} authorization completed. Choose the destination account in Channels.`,
        );
        return new Response(null, {
          status: 303,
          headers: {
            Location: origin(env, req) + "/?connection=success",
            "Set-Cookie": cookieHeader("mika_oauth", "", req, 0),
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const safe = /^(D1_|SQLITE|no such|database|fetch|Failed query)/i.test(
      message,
    )
      ? "The workspace could not save this change. Try again."
      : message;
    return json({ error: safe }, 400);
  }
}
