import { NtlmClient } from "axios-ntlm";

type JsonPatchOp = {
  op: "add";
  path: string;
  value: unknown;
};

export type TfsTaskDraft = {
  title: string;
  description: string;
  assignedTo: string;
  state?: string;
  areaPath: string;
  iterationPath: string;
  atividadeUst: string;
  empresa?: string;
  complexidadeUst: string;
  faturado?: string;
  dataExecucao: string;
  dataExecucaoTime?: string;
  parentId?: number | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return String(value).trim();
}

function formatIsoDateTime(dateExecucao: string, time = "00:00:00Z") {
  return `${dateExecucao}T${time.replace(/^T/, "")}`;
}

export function buildCreateTaskPayload(draft: TfsTaskDraft, collectionUrl: string): JsonPatchOp[] {
  const payload: JsonPatchOp[] = [
    { op: "add", path: "/fields/System.Title", value: draft.title },
    { op: "add", path: "/fields/System.Description", value: draft.description },
    { op: "add", path: "/fields/System.AssignedTo", value: draft.assignedTo },
    { op: "add", path: "/fields/System.State", value: draft.state ?? "To Do" },
    { op: "add", path: "/fields/System.AreaPath", value: draft.areaPath },
    { op: "add", path: "/fields/System.IterationPath", value: draft.iterationPath },
    { op: "add", path: "/fields/Custom.COTIN.AtividadeUST", value: draft.atividadeUst },
    { op: "add", path: "/fields/Custom.COTIN.Empresa", value: draft.empresa ?? "MIL TEC TECNOLOGIA - 055/2021 - 8" },
    { op: "add", path: "/fields/Custom.COTIN.ComplexidadeUST", value: draft.complexidadeUst },
    { op: "add", path: "/fields/Custom.COTIN.Faturado", value: draft.faturado ?? "NÃ£o" },
    {
      op: "add",
      path: "/fields/Custom.COTIN.DataExecucao",
      value: formatIsoDateTime(draft.dataExecucao, draft.dataExecucaoTime ?? "00:00:00Z"),
    },
  ];

  if (draft.parentId) {
    payload.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${collectionUrl.replace(/\/+$/, "")}/_apis/wit/workItems/${draft.parentId}`,
      },
    });
  }

  return payload;
}

function createNtlmAxiosClient() {
  return NtlmClient(
    {
      username: requireEnv("NTLM_USERNAME"),
      password: requireEnv("NTLM_PASSWORD"),
      domain: requireEnv("NTLM_DOMAIN"),
      workstation: requireEnv("NTLM_WORKSTATION"),
    }
  );
}

export async function createTfsTasks(drafts: TfsTaskDraft[]) {
  const collectionUrl = requireEnv("TFS_COLLECTION_URL");
  const project = requireEnv("TFS_PROJECT");
  const client = createNtlmAxiosClient();
  const url = `${collectionUrl.replace(/\/+$/, "")}/${project}/_apis/wit/workitems/$Task?api-version=1.0`;

  const created: Array<{ dataExecucao: string; id: number; title: string | null }> = [];
  const failed: Array<{ dataExecucao: string; error: unknown }> = [];

  for (const draft of drafts) {
    try {
      const response = await client.patch(url, buildCreateTaskPayload(draft, collectionUrl), {
        headers: {
          "Content-Type": "application/json-patch+json",
        },
      });

      created.push({
        dataExecucao: draft.dataExecucao,
        id: response.data.id,
        title: response.data.fields?.["System.Title"] ?? null,
      });
    } catch (error: any) {
      failed.push({
        dataExecucao: draft.dataExecucao,
        error: error?.response?.data ?? error?.message ?? error,
      });
    }
  }

  return {
    created,
    failed,
    summary: {
      total: drafts.length,
      created: created.length,
      failed: failed.length,
    },
  };
}
