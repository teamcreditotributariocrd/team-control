import { FastifyInstance } from "fastify";
import type { AppStore } from "../store/store.js";
import { assertAdmin, getUser } from "../infra/auth.js";

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportRoutes(app: FastifyInstance, store: AppStore) {
  app.get("/api/runs/:runId/export.csv", async (req, reply) => {
    const user = getUser(req);
    try { assertAdmin(user); } catch { return reply.code(403).send({ error: "FORBIDDEN" }); }

    const runId = Number((req.params as any).runId);
    if (!Number.isFinite(runId)) return reply.code(400).send({ error: "invalid runId" });

    const rows = await store.readRunItems(runId);

    const header = [
      "work_item_id","title","assigned_to","area_path","iteration_path","data_execucao",
      "atividade_raw","grupo","subgrupo","atividade","complexidade","ust","status","audit"
    ] as const;

    const lines = [header.join(",")];
    for (const r of rows) {
      const record = {
        ...r,
        grupo: "",
        subgrupo: "",
        atividade: "",
      };
      lines.push(header.map((h) => csvEscape(record[h])).join(","));
    }

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="ust-run-${runId}.csv"`);
    return lines.join("\n");
  });
}
