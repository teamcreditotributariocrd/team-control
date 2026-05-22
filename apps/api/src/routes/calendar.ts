import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getUser } from "../infra/auth.js";

const ymd = /^\d{4}-\d{2}-\d{2}$/;
const CalendarEventSchema = z.object({
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(180),
    type: z.enum(["HOLIDAY", "VACATION", "RECESS", "MEETING"]),
    startDate: z.string().regex(ymd),
    endDate: z.string().regex(ymd),
    person: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(1200).nullable().optional(),
}).refine((event) => event.endDate >= event.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
});

function assertReader(req: any, reply: any) {
    const user = getUser(req);
    if (!user.uniqueName) {
        reply.code(401).send({ error: "UNAUTHORIZED" });
        return null;
    }
    return user;
}

function dateQuery(value: unknown) {
    const raw = String(value ?? "");
    return ymd.test(raw) ? raw : undefined;
}

export async function calendarRoutes(
    app: FastifyInstance,
    deps: ReturnType<typeof import("../serverDeps.js").createDeps>
) {
    app.get("/api/calendar/events", async (req, reply) => {
        if (!assertReader(req, reply)) return;
        return reply.send(deps.calendarStore.list({
            from: dateQuery((req.query as any)?.from),
            to: dateQuery((req.query as any)?.to),
        }));
    });

    app.post("/api/calendar/events", async (req, reply) => {
        const user = assertReader(req, reply);
        if (!user) return;

        const parsed = CalendarEventSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
        return reply.send(deps.calendarStore.upsert({
            ...parsed.data,
            person: parsed.data.person || null,
            notes: parsed.data.notes || null,
        }, user.uniqueName));
    });

    app.delete("/api/calendar/events/:id", async (req, reply) => {
        if (!assertReader(req, reply)) return;
        const id = String((req.params as any)?.id ?? "").trim();
        if (!id) return reply.code(400).send({ error: "INVALID_ID" });
        if (!deps.calendarStore.remove(id)) return reply.code(404).send({ error: "NOT_FOUND" });
        return reply.send({ ok: true });
    });
}
