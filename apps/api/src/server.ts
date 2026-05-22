import Fastify from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createDeps } from "./serverDeps.js";

// rotas existentes
import { catalogRoutes } from "./routes/catalog.js";
import { runRoutes } from "./routes/run.js";
import { exportRoutes } from "./routes/export.js";

// rotas novas (premium)
import { authRoutes } from "./routes/auth.js";
import { collaboratorsRoutes } from "./routes/collaborators.js";
import { ustDashboardRoutes } from "./routes/ustDashboard.js";

import { meetingsRoutes } from "./routes/meetings.js";

import { transcribeRoutes } from "./routes/transcribe.js";

import { incidentsRoutes } from "./routes/incidents.js";
import { tfsTasksRoutes } from "./routes/tfsTasks.js";
import { discordDailyScheduleRoutes } from "./routes/discordDailySchedule.js";
import { tfsSupportBugConfigRoutes } from "./routes/tfsSupportBugConfig.js";
import { startDiscordDailyScheduler } from "./services/discordDailyRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "..");
const webDist = path.resolve(apiRoot, "..", "web", "dist");

dotenv.config({ path: path.join(apiRoot, ".env"), override: true });
dotenv.config();
process.env.INTERNAL_ALERT_TOKEN ||= crypto.randomBytes(32).toString("base64url");

const app = Fastify({ logger: true });

const deps = createDeps();

function contentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[ext] ?? "application/octet-stream";
}

async function sendWebFile(reply: any, filePath: string) {
  const data = await fs.promises.readFile(filePath);
  return reply.type(contentType(filePath)).send(data);
}

// plugins
await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1 GB
    files: 1,
  },
});

// suas rotas atuais
await catalogRoutes(app, deps.store);
await runRoutes(app, deps.store);
await exportRoutes(app, deps.store);

// ✅ rotas premium
await authRoutes(app, deps);
await collaboratorsRoutes(app, deps);
await ustDashboardRoutes(app, deps);

await meetingsRoutes(app, deps);

await incidentsRoutes(app, deps);
await app.register(tfsTasksRoutes);
await discordDailyScheduleRoutes(app, deps, apiRoot);
await tfsSupportBugConfigRoutes(app, deps);

await app.register(transcribeRoutes);

// health
app.get("/health", async () => ({ ok: true }));

// Serve o build do React no mesmo processo da API em producao/local host.
app.get("/*", async (req, reply) => {
  const rawUrl = String(req.url ?? "/");
  const pathname = decodeURIComponent(rawUrl.split("?")[0] || "/");

  if (pathname.startsWith("/api/")) {
    return reply.code(404).send({ error: "not found" });
  }

  if (!fs.existsSync(webDist)) {
    return reply.code(404).send({ error: "web build not found. Run npm --workspace apps/web run build" });
  }

  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalized = path.normalize(relative);
  const candidate = path.resolve(webDist, normalized);
  const indexFile = path.join(webDist, "index.html");

  if (!candidate.startsWith(webDist)) {
    return sendWebFile(reply, indexFile);
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return sendWebFile(reply, candidate);
  }

  return sendWebFile(reply, indexFile);
});

let stopDiscordDailyScheduler: (() => void) | null = null;
app.addHook("onClose", async () => {
  stopDiscordDailyScheduler?.();
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });

stopDiscordDailyScheduler = startDiscordDailyScheduler({
  apiRoot,
  store: deps.alertScheduleStore,
  logger: app.log,
});
