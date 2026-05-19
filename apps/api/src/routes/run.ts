// apps/api/src/routes/run.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppStore } from "../store/store.js";
import { createTfsClient } from "../infra/tfsNtlmClient.js";
import { queryIdsByExecucaoRange, getWorkItemsBatch } from "../services/tfsWorkItems.js";
import { parseAtividadeUST } from "../lib/parseAtividade.js";
import { assertAdmin, getUser } from "../infra/auth.js";

const BodySchema = z.object({
  project: z.string().min(1).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  state: z.string().optional(),
  assignedToDisplayName: z.string().optional(),
});

export async function runRoutes(app: FastifyInstance, store: AppStore) {
  app.post("/api/tfs/run", async (req, reply) => {
    const user = getUser(req);
    try { assertAdmin(user); } catch { return reply.code(403).send({ error: "FORBIDDEN" }); }

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { dateFrom, dateTo, state, assignedToDisplayName } = parsed.data;
    const project = parsed.data.project ?? process.env.TFS_PROJECT!;
    const http = createTfsClient();

    const ids = await queryIdsByExecucaoRange(
      http,
      project,
      dateFrom,
      dateTo,
      state,
      assignedToDisplayName?.trim() || undefined
    );

    const items = await getWorkItemsBatch(http, ids);

    let totalUst = 0;
    let mapped = 0;
    let unmapped = 0;

    const rows = items.map((wi: any) => {
      const f = wi.fields ?? {};

      const atividadeRaw = f["Custom.COTIN.AtividadeUST"];
      const complexidadeTfs = f["Custom.COTIN.ComplexidadeUST"];
      const dataExecucao = f["Custom.COTIN.DataExecucao"];

      const p = parseAtividadeUST(atividadeRaw);

      let ust: number | null = null;
      let status: "MAPPED" | "UNMAPPED" = "UNMAPPED";
      let audit = "";

      if (typeof p.codigo === "number") {
        const hit = store.lookupUstByCode(p.codigo, typeof complexidadeTfs === "string" ? complexidadeTfs : null);

        if (hit && hit.ok) {
          ust = hit.ust;
          status = "MAPPED";
          audit = hit.audit;
          totalUst += ust;
          mapped++;
        } else {
          status = "UNMAPPED";
          unmapped++;
          if (hit && !hit.ok) {
            audit = `UNMAPPED(${hit.reason}) expected=${hit.expectedComplexidade} got=${hit.gotComplexidade ?? ""}`;
          } else {
            audit = "UNMAPPED(CODIGO_FORA_CATALOGO)";
          }
        }
      } else {
        unmapped++;
        audit = "UNMAPPED(SEM_CODIGO)";
      }

      const assignedObj = f["System.AssignedTo"];
      const assignedTo = assignedObj?.uniqueName ?? assignedObj?.displayName ?? null;

      return {
        id: f["System.Id"],
        title: f["System.Title"],
        state: f["System.State"],
        assignedTo,
        areaPath: f["System.AreaPath"],
        iterationPath: f["System.IterationPath"],
        dataExecucao,
        atividadeRaw,
        codigo: p.codigo ?? null,
        complexidade: complexidadeTfs ?? null,
        ust,
        status,
        audit,
      };
    });

    const now = new Date().toISOString();
    const runId = await store.createRun(
      {
        createdAt: now,
        project,
        dateFrom,
        dateTo,
        state,
        totalTasks: rows.length,
        mapped,
        unmapped,
        totalUst,
      },
      rows.map((r: any) => ({
        work_item_id: r.id,
        title: r.title ?? null,
        assigned_to: r.assignedTo ?? null,
        area_path: r.areaPath ?? null,
        iteration_path: r.iterationPath ?? null,
        data_execucao: r.dataExecucao ?? null,
        atividade_raw: r.atividadeRaw ?? null,
        codigo: r.codigo ?? null,
        complexidade: r.complexidade ?? null,
        ust: r.ust ?? null,
        status: r.status,
        audit: r.audit ?? null,
      }))
    );

    return {
      runId,
      summary: { totalTasks: rows.length, mapped, unmapped, totalUst },
      rows,
    };
  });
}
