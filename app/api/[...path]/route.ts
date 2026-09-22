import { env } from "cloudflare:workers";
import { handle } from "../../../lib/api";
import type { Env } from "../../../lib/db";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handle(request, env as unknown as Env);
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
