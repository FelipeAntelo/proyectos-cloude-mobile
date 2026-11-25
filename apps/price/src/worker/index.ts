import { handleApi } from "./api/routes";
import type { Env } from "./env";
import { maintenance, runMonitor } from "./monitor";
import { getSettings } from "./repo";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = controller.scheduledTime;
    const summary = await runMonitor(env, { now, trigger: "cron" });
    console.log(JSON.stringify({ event: "monitor", ...summary }));
    const d = new Date(now);
    if (d.getUTCHours() === 8 && d.getUTCMinutes() < 5) {
      ctx.waitUntil(getSettings(env.DB).then((s) => maintenance(env.DB, now, s)));
    }
  },
} satisfies ExportedHandler<Env>;
