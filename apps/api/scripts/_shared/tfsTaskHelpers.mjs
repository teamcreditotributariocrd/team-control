import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { NtlmClient } from "axios-ntlm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: envPath });

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing env ${name} (loaded from: ${envPath})`);
  }
  return String(value).trim();
}

function formatIsoDateTime(dateExecucao, time = "00:00:00Z") {
  return `${dateExecucao}T${String(time).replace(/^T/, "")}`;
}

export function formatDateBr(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function createTfsTaskDraft(input) {
  return {
    state: "To Do",
    empresa: "MIL TEC TECNOLOGIA - 055/2021 - 8",
    faturado: "Não",
    dataExecucaoTime: "00:00:00Z",
    ...input,
  };
}

function createClient() {
  return NtlmClient(
    {
      username: requireEnv("NTLM_USERNAME"),
      password: requireEnv("NTLM_PASSWORD"),
      domain: requireEnv("NTLM_DOMAIN"),
      workstation: requireEnv("NTLM_WORKSTATION"),
    }
  );
}

function buildPayload(draft, collectionUrl) {
  const payload = [
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

export async function createTasksAndPrint(drafts) {
  const collectionUrl = requireEnv("TFS_COLLECTION_URL");
  const project = requireEnv("TFS_PROJECT");
  const client = createClient();
  const url = `${collectionUrl.replace(/\/+$/, "")}/${project}/_apis/wit/workitems/$Task?api-version=1.0`;

  const created = [];
  const failed = [];

  for (const draft of drafts) {
    try {
      const response = await client.patch(url, buildPayload(draft, collectionUrl), {
        headers: {
          "Content-Type": "application/json-patch+json",
        },
      });

      created.push({
        dataExecucao: draft.dataExecucao,
        id: response.data.id,
        title: response.data.fields?.["System.Title"] ?? null,
      });
      console.log(`OK: ${draft.dataExecucao} -> Task ${response.data.id}`);
    } catch (error) {
      const detail = error?.response?.data ?? error?.message ?? error;
      failed.push({
        dataExecucao: draft.dataExecucao,
        error: detail,
      });
      console.error(`ERRO: ${draft.dataExecucao}`);
      console.error(detail);
    }
  }

  console.log("\nResumo final");
  console.log("Tasks criadas:", created.length);
  console.log("Falhas:", failed.length);

  if (created.length) {
    console.log("\nCriadas:");
    for (const item of created) {
      console.log(`- ${item.dataExecucao} | ${item.id} | ${item.title}`);
    }
  }

  if (failed.length) {
    console.log("\nFalhas:");
    for (const item of failed) {
      console.log(`- ${item.dataExecucao} | ${JSON.stringify(item.error)}`);
    }
  }

  return { created, failed };
}
