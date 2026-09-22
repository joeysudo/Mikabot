import { schema } from "../db/schema";
import type { Post } from "./domain";
export type Env = {
  DB: D1Database;
  APP_ORIGIN?: string;
  WORKSPACE_PASSWORD?: string;
  SESSION_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  META_CLIENT_ID?: string;
  META_CLIENT_SECRET?: string;
  META_API_VERSION?: string;
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_BACKEND?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  [key: string]: unknown;
};
export async function setup(db: D1Database) {
  if (!db) throw new Error("The workspace database is not available.");
  await db.batch(schema.map((s) => db.prepare(s)));
}
export async function getPost(db: D1Database, id: string): Promise<Post> {
  const row = await db
    .prepare("SELECT data FROM posts WHERE id=?")
    .bind(id)
    .first<{ data: string }>();
  if (!row) throw new Error("Post not found.");
  return JSON.parse(row.data);
}
export async function log(db: D1Database, message: string) {
  await db
    .prepare("INSERT INTO activity(id,message,created_at) VALUES(?,?,?)")
    .bind(crypto.randomUUID(), message, new Date().toISOString())
    .run();
}
export async function insertPost(
  db: D1Database,
  fields: Omit<
    Post,
    | "id"
    | "revision"
    | "approvedRevision"
    | "status"
    | "createdAt"
    | "updatedAt"
  >,
) {
  const now = new Date().toISOString();
  const post: Post = {
    ...fields,
    id: crypto.randomUUID(),
    revision: 1,
    approvedRevision: null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  await db
    .prepare(
      "INSERT INTO posts(id,data,revision,status,created_at) VALUES(?,?,?,?,?)",
    )
    .bind(post.id, JSON.stringify(post), 1, "draft", now)
    .run();
  return post;
}
