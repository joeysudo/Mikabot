import { runMonitor } from "../lib/agent/runtime";
import type { Env } from "../lib/db";
const monitor = {
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(runMonitor(env));
  },
  fetch() {
    return new Response("Mika monitoring worker. Scheduled execution only.", {
      status: 404,
    });
  },
};

export default monitor;
