import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmin, getUser } from "../infra/auth.js";
import { runDiscordDailyScript } from "../services/discordDailyRunner.js";

const ScheduleSchema = z.object({
    enabled: z.boolean(),
    times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(8),
});

export async function discordDailyScheduleRoutes(
    app: FastifyInstance,
    deps: ReturnType<typeof import("../serverDeps.js").createDeps>,
    apiRoot: string
) {
    function requireAdmin(req: any, reply: any) {
        const user = getUser(req);
        try {
            assertAdmin(user);
            return true;
        } catch {
            reply.code(403).send({ error: "FORBIDDEN" });
            return false;
        }
    }

    app.get("/api/discord-daily-schedule", async (req, reply) => {
        if (!requireAdmin(req, reply)) return;
        return reply.send(deps.alertScheduleStore.get());
    });

    app.put("/api/discord-daily-schedule", async (req, reply) => {
        if (!requireAdmin(req, reply)) return;
        const parsed = ScheduleSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
        return reply.send(deps.alertScheduleStore.update(parsed.data));
    });

    app.post("/api/discord-daily-schedule/run-now", async (req, reply) => {
        if (!requireAdmin(req, reply)) return;
        const result = await runDiscordDailyScript(apiRoot);
        const saved = deps.alertScheduleStore.recordRun(result.ok ? "OK" : "ERROR", result.message);
        return reply.code(result.ok ? 200 : 500).send({ ...saved, ok: result.ok, message: result.message });
    });
}
