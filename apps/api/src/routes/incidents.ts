import type { FastifyInstance } from "fastify";
import { getUser, assertAdmin } from "../infra/auth.js";
import { createGlpiClient } from "../services/glpiClient.js";

function q(req: any, key: string) {
    return (req.query as any)?.[key];
}

function asInt(v: any, fallback: number) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function asYmd(v: any) {
    const value = v ? String(v) : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function sendAuthError(reply: any, e: any) {
    const message = String(e?.message ?? e);
    if (message === "UNAUTHORIZED") {
        return reply.code(401).send({ error: "UNAUTHORIZED", detail: "Sessao expirada ou token invalido. Faca login novamente." });
    }
    return reply.code(403).send({ error: "FORBIDDEN" });
}

function sendGlpiError(reply: any, e: any) {
    const message = String(e?.message ?? e);
    if (message.includes("GLPI_AUTH_ERROR") || message.includes("ERROR_GLPI_LOGIN_USER_TOKEN") || message.includes("ERROR_GLPI_LOGIN")) {
        return reply.code(502).send({
            error: "GLPI_AUTH_ERROR",
            detail: "Falha na autenticacao do GLPI. Atualize GLPI_APP_TOKEN e GLPI_USER_TOKEN no .env.",
        });
    }
    return reply.code(502).send({ error: "GLPI_ERROR", detail: message });
}

export async function incidentsRoutes(app: FastifyInstance) {
    const glpi = createGlpiClient();

    app.get("/api/incidents", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch (e: any) {
            return sendAuthError(reply, e);
        }

        const status = q(req, "status") ? String(q(req, "status")) : undefined;
        const search = q(req, "search") ? String(q(req, "search")) : undefined;
        const from = asYmd(q(req, "from"));
        const to = asYmd(q(req, "to"));
        const limit = q(req, "limit") ? asInt(q(req, "limit"), 800) : 800;
        const pageSize = q(req, "pageSize") ? asInt(q(req, "pageSize"), 200) : 200;
        const maxPages = q(req, "maxPages") ? asInt(q(req, "maxPages"), 20) : 20;

        try {
            const out = await glpi.searchTickets({ status, search, from, to, limit, pageSize, maxPages });
            return reply.send(out);
        } catch (e: any) {
            return sendGlpiError(reply, e);
        }
    });

    app.get("/api/incidents/:id", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch (e: any) {
            return sendAuthError(reply, e);
        }

        const idRaw = (req.params as any)?.id;
        const id = Number(idRaw);

        if (!Number.isFinite(id) || id <= 0) {
            return reply.code(400).send({ error: "INVALID_ID" });
        }

        try {
            const item = await glpi.getTicketDetails(id);
            return reply.send(item);
        } catch (e: any) {
            return sendGlpiError(reply, e);
        }
    });

    app.get("/api/incidents/_health/glpi", async (req, reply) => {
        const user = getUser(req);
        try {
            assertAdmin(user);
        } catch (e: any) {
            return sendAuthError(reply, e);
        }

        try {
            const out = await glpi.searchTickets({ limit: 1, pageSize: 1, maxPages: 1 });
            return reply.send({ ok: true, sampleCount: out?.rows?.length ?? 0 });
        } catch (e: any) {
            return sendGlpiError(reply, e);
        }
    });
}
