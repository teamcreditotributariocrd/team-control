import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmin, getUser } from "../infra/auth.js";
import { createTfsTasks } from "../services/tfsTaskCreator.js";

const TaskDraftSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(3),
  assignedTo: z.string().min(3),
  state: z.string().min(1).optional(),
  areaPath: z.string().min(3),
  iterationPath: z.string().min(3),
  atividadeUst: z.string().min(3),
  empresa: z.string().min(3).optional(),
  complexidadeUst: z.string().min(3),
  faturado: z.string().min(1).optional(),
  dataExecucao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataExecucaoTime: z.string().optional(),
  parentId: z.number().int().positive().nullable().optional(),
});

const BulkCreateSchema = z.object({
  tasks: z.array(TaskDraftSchema).min(1).max(200),
});

export async function tfsTasksRoutes(app: FastifyInstance) {
  app.post("/api/tfs/tasks/bulk", async (req, reply) => {
    const user = getUser(req);
    try {
      assertAdmin(user);
    } catch {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }

    const parsed = BulkCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      return reply.send(await createTfsTasks(parsed.data.tasks));
    } catch (error: any) {
      return reply.code(500).send({ error: String(error?.message ?? error) });
    }
  });
}
