import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmin, getUser } from "../infra/auth.js";
import { analyzeLogSource } from "../services/logAnalyticsReader.js";

const LogSourceSchema = z.object({
    id: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(120),
    system: z.string().trim().min(1).max(120),
    description: z.string().trim().max(600),
    path: z.string().trim().min(1).max(600),
    filePrefix: z.string().trim().min(1).max(180),
    parser: z.literal("CREDTRIB_BAIXA_AUTOMATICA"),
});

function requireReader(req: any, reply: any) {
    const user = getUser(req);
    if (!user.uniqueName) {
        reply.code(401).send({ error: "UNAUTHORIZED" });
        return null;
    }
    return user;
}

function requireAdmin(req: any, reply: any) {
    const user = requireReader(req, reply);
    if (!user) return null;
    try {
        assertAdmin(user);
        return user;
    } catch {
        reply.code(403).send({ error: "FORBIDDEN" });
        return null;
    }
}

export async function logAnalyticsRoutes(
    app: FastifyInstance,
    deps: ReturnType<typeof import("../serverDeps.js").createDeps>
) {
    app.get("/api/log-analytics/sources", async (req, reply) => {
        if (!requireReader(req, reply)) return;
        return reply.send(deps.logAnalyticsStore.list());
    });

    app.post("/api/log-analytics/sources", async (req, reply) => {
        if (!requireAdmin(req, reply)) return;
        const parsed = LogSourceSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
        return reply.send(deps.logAnalyticsStore.upsert(parsed.data));
    });

    app.delete("/api/log-analytics/sources/:id", async (req, reply) => {
        if (!requireAdmin(req, reply)) return;
        const id = String((req.params as any)?.id ?? "");
        if (!deps.logAnalyticsStore.remove(id)) return reply.code(404).send({ error: "NOT_FOUND" });
        return reply.send({ ok: true });
    });

    app.get("/api/log-analytics/sources/:id/analysis", async (req, reply) => {
        if (!requireReader(req, reply)) return;
        const source = deps.logAnalyticsStore.get(String((req.params as any)?.id ?? ""));
        if (!source) return reply.code(404).send({ error: "NOT_FOUND" });
        try {
            return reply.send(await analyzeLogSource(source, Number((req.query as any)?.days ?? 14)));
        } catch (e: any) {
            return reply.code(502).send({ error: "LOG_ANALYTICS_READ_ERROR", detail: String(e?.message ?? e) });
        }
    });
}
