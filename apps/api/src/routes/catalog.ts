// apps/api/src/routes/catalog.ts
import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store/store.js";
import { importCatalogXlsx } from "../services/catalog.js";
import { assertAdmin, getUser } from "../infra/auth.js";

export async function catalogRoutes(app: FastifyInstance, store: AppStore) {
  function requireSession(req: any, reply: any) {
    const user = getUser(req);
    if (!user.uniqueName) {
      reply.code(401).send({ error: "UNAUTHORIZED" });
      return null;
    }
    return user;
  }

  app.post("/api/catalog/import", async (req, reply) => {
    const user = getUser(req);
    try { assertAdmin(user); } catch { return reply.code(403).send({ error: "FORBIDDEN" }); }

    const mp = await (req as any).file();
    if (!mp) return reply.code(400).send({ error: "file is required" });

    let tempPath: string | null = (mp as any).filepath ?? null;

    if (!tempPath) {
      const buf = await mp.toBuffer();
      const os = await import("node:os");
      const fs = await import("node:fs");
      const path = await import("node:path");
      tempPath = path.join(os.tmpdir(), `catalog-${Date.now()}.xlsx`);
      fs.writeFileSync(tempPath, buf);
    }

    try {
      // ✅ substitui o catálogo inteiro no store (catalog.json)
      const result = await importCatalogXlsx(store, tempPath);
      return reply.send({
        ok: true,
        ...result,
        replaced: true,
      });
    } catch (e: any) {
      return reply.code(500).send({ error: String(e?.message ?? e) });
    }
  });

  app.get("/api/catalog", async (req, reply) => {
    const q = (req.query as any)?.q as string | undefined;
    const offset = (req.query as any)?.offset as string | undefined;
    const limit = (req.query as any)?.limit as string | undefined;

    const page = store.getCatalogPage({
      q,
      offset: offset ? Number(offset) : 0,
      limit: limit ? Number(limit) : 50,
    });

    return reply.send(page);
  });

  app.get("/api/catalog/:code", async (req, reply) => {
    const code = Number((req.params as any).code);
    if (!Number.isFinite(code) || code <= 0) return reply.code(400).send({ error: "invalid code" });

    const row = store.getCatalogByCode(code);
    if (!row) return reply.code(404).send({ error: "not found" });

    return reply.send(row);
  });

  app.get("/api/favorites", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;

    return reply.send(store.getFavoriteCatalog(user.uniqueName));
  });

  app.post("/api/favorites/:code", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;

    const code = Number((req.params as any).code);
    if (!Number.isFinite(code) || code <= 0) return reply.code(400).send({ error: "invalid code" });

    try {
      return reply.send(store.addFavoriteCatalog(user.uniqueName, code));
    } catch (e: any) {
      const message = String(e?.message ?? e);
      if (message === "CATALOG_NOT_FOUND") return reply.code(404).send({ error: "not found" });
      return reply.code(500).send({ error: message });
    }
  });

  app.delete("/api/favorites/:code", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;

    const code = Number((req.params as any).code);
    if (!Number.isFinite(code) || code <= 0) return reply.code(400).send({ error: "invalid code" });

    return reply.send(store.removeFavoriteCatalog(user.uniqueName, code));
  });
}
