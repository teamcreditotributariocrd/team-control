import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSessionToken, hashPassword, verifyPassword } from "../infra/auth.js";

const LoginSchema = z.object({
    uniqueName: z.string().min(3),
    password: z.string().min(1),
});

const BootstrapSchema = z.object({
    uniqueName: z.string().min(3),
    password: z.string().min(6),
});

const RegisterSchema = z.object({
    displayName: z.string().min(3),
    uniqueName: z.string().min(3),
    password: z.string().min(6),
});

export async function authRoutes(app: FastifyInstance, deps: ReturnType<typeof import("../serverDeps.js").createDeps>) {
    app.get("/api/auth/users", async (_req, reply) => {
        const hasAdminPassword = deps.collabStore.hasAdminPassword();
        const users = deps.collabStore
            .list()
            .filter((c) => c.isActive)
            .map((c) => ({
                displayName: c.displayName,
                uniqueName: c.uniqueName,
                hasPassword: c.hasPassword,
                canBootstrapAdmin: !hasAdminPassword && c.role === "admin",
            }));

        return reply.send(users);
    });

    app.post("/api/auth/bootstrap-admin", async (req, reply) => {
        if (deps.collabStore.hasAdminPassword()) {
            return reply.code(403).send({ error: "BOOTSTRAP_ALREADY_DONE" });
        }

        const parsed = BootstrapSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

        const collaborator = deps.collabStore.getAuthByUniqueName(parsed.data.uniqueName);
        if (!collaborator || !collaborator.isActive || collaborator.role !== "admin") {
            return reply.code(403).send({ error: "ONLY_ACTIVE_ADMIN_CAN_BOOTSTRAP" });
        }

        deps.collabStore.upsert({
            id: collaborator.id,
            displayName: collaborator.displayName,
            uniqueName: collaborator.uniqueName,
            monthlyGoalUst: collaborator.monthlyGoalUst,
            isActive: collaborator.isActive,
            role: collaborator.role,
            passwordHash: hashPassword(parsed.data.password),
        });

        const token = createSessionToken({
            uniqueName: collaborator.uniqueName,
            role: collaborator.role,
        });

        return reply.send({
            token,
            uniqueName: collaborator.uniqueName,
            role: collaborator.role,
            displayName: collaborator.displayName,
        });
    });

    app.post("/api/auth/login", async (req, reply) => {
        const parsed = LoginSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

        const { uniqueName, password } = parsed.data;
        const collaborator = deps.collabStore.getAuthByUniqueName(uniqueName);

        if (!collaborator || !collaborator.isActive) {
            return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
        }

        if (!collaborator.passwordHash && collaborator.role === "admin" && !deps.collabStore.hasAdminPassword()) {
            deps.collabStore.upsert({
                id: collaborator.id,
                displayName: collaborator.displayName,
                uniqueName: collaborator.uniqueName,
                monthlyGoalUst: collaborator.monthlyGoalUst,
                isActive: collaborator.isActive,
                role: collaborator.role,
                passwordHash: hashPassword(password),
            });

            const token = createSessionToken({
                uniqueName: collaborator.uniqueName,
                role: collaborator.role,
            });

            return reply.send({
                token,
                uniqueName: collaborator.uniqueName,
                role: collaborator.role,
                displayName: collaborator.displayName,
                bootstrapped: true,
            });
        }

        const ok = collaborator.passwordHash ? verifyPassword(password, collaborator.passwordHash) : false;

        if (!ok) {
            return reply.code(401).send({
                error: collaborator.passwordHash ? "INVALID_CREDENTIALS" : "PASSWORD_NOT_CONFIGURED",
            });
        }

        const token = createSessionToken({
            uniqueName: collaborator.uniqueName,
            role: collaborator.role,
        });

        return reply.send({
            token,
            uniqueName: collaborator.uniqueName,
            role: collaborator.role,
            displayName: collaborator.displayName,
        });
    });

    app.post("/api/auth/register", async (req, reply) => {
        const parsed = RegisterSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

        const { displayName, uniqueName, password } = parsed.data;
        const existing = deps.collabStore.getAuthByUniqueName(uniqueName);

        if (existing?.passwordHash) {
            return reply.code(409).send({ error: "USER_ALREADY_HAS_ACCESS" });
        }

        if (existing?.role === "admin") {
            return reply.code(403).send({ error: "ADMIN_MUST_USE_LOGIN_BOOTSTRAP" });
        }

        const saved = deps.collabStore.upsert({
            id: existing?.id,
            displayName: existing?.displayName ?? displayName,
            uniqueName: existing?.uniqueName ?? uniqueName,
            monthlyGoalUst: existing?.monthlyGoalUst ?? 0,
            isActive: true,
            role: "member",
            passwordHash: hashPassword(password),
        });

        const token = createSessionToken({
            uniqueName: saved.uniqueName,
            role: saved.role,
        });

        return reply.send({
            token,
            uniqueName: saved.uniqueName,
            role: saved.role,
            displayName: saved.displayName,
            registered: true,
        });
    });
}
