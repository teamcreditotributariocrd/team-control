// apps/api/src/routes/collaborators.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getUser, assertAdmin, hashPassword } from "../infra/auth.js";

const UpsertSchema = z.object({
    id: z.string().optional(),
    displayName: z.string().min(3),
    uniqueName: z.string().min(3),
    monthlyGoalUst: z.number().int().nonnegative(),
    monthlyGoalsUst: z.record(z.number().int().nonnegative()).optional(),
    goalMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    isActive: z.boolean(),
    role: z.enum(["admin", "member"]),
    password: z.string().min(6).optional().or(z.literal("")),
});

export async function collaboratorsRoutes(app: FastifyInstance, deps: ReturnType<typeof import("../serverDeps.js").createDeps>) {
    app.get("/api/collaborators", async (req, reply) => {
        const user = getUser(req);
        if (user.role === "admin") return reply.send(deps.collabStore.list());

        const me = deps.collabStore.getByUniqueName(user.uniqueName);
        return reply.send(me ? [me] : []);
    });

    app.post("/api/collaborators", async (req, reply) => {
        const user = getUser(req);
        try { assertAdmin(user); } catch { return reply.code(403).send({ error: "FORBIDDEN" }); }

        const parsed = UpsertSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

        const { password, goalMonth, ...data } = parsed.data;
        const existing = data.id
            ? deps.collabStore.list().find((c: any) => c.id === data.id)
            : deps.collabStore.getByUniqueName(data.uniqueName);
        const monthlyGoalsUst = { ...(existing?.monthlyGoalsUst ?? {}), ...(data.monthlyGoalsUst ?? {}) };
        if (goalMonth) monthlyGoalsUst[goalMonth] = data.monthlyGoalUst;

        const saved = deps.collabStore.upsert({
            ...data,
            monthlyGoalsUst,
            passwordHash: password ? hashPassword(password) : undefined,
        });
        return reply.send(saved);
    });

    app.delete("/api/collaborators/:id", async (req, reply) => {
        const user = getUser(req);
        try { assertAdmin(user); } catch { return reply.code(403).send({ error: "FORBIDDEN" }); }

        const id = String((req.params as any).id);
        deps.collabStore.remove(id);
        return reply.send({ ok: true });
    });
}
