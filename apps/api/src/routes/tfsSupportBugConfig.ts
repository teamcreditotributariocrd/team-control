import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmin, getUser } from "../infra/auth.js";

const ConfigSchema = z.object({
    iterationPath: z.string().trim().min(1).max(255),
});

export async function tfsSupportBugConfigRoutes(
    app: FastifyInstance,
    deps: ReturnType<typeof import("../serverDeps.js").createDeps>
) {
    function requireAdmin(req: any, reply: any) {
        try {
            assertAdmin(getUser(req));
            return true;
        } catch {
            reply.code(403).send({ error: "FORBIDDEN" });
            return false;
        }
    }

    app.get("/api/tfs-support-bug-config", async (req, reply) => {
        if (!requireAdmin(req, reply)) return;
        return reply.send(deps.tfsSupportBugConfigStore.get());
    });

    app.put("/api/tfs-support-bug-config", async (req, reply) => {
        if (!requireAdmin(req, reply)) return;
        const parsed = ConfigSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
        return reply.send(deps.tfsSupportBugConfigStore.update(parsed.data.iterationPath));
    });
}
