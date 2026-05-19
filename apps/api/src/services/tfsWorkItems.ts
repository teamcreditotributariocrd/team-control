import type { TfsClient } from "../infra/tfsNtlmClient";

export const TFS_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.AssignedTo",
  "System.AreaPath",
  "System.IterationPath",
  "Custom.COTIN.DataExecucao",
  "Custom.COTIN.AtividadeUST",
  "Custom.COTIN.ComplexidadeUST",
] as const;

function toIsoStart(dateYYYYMMDD: string) {
  return `${dateYYYYMMDD}T00:00:00Z`;
}

function addDaysISO(dateYYYYMMDD: string, days: number) {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function escapeWiqlString(value: string) {
  // WIQL usa aspas simples; escape é duplicar aspas simples
  return value.replace(/'/g, "''");
}

export async function queryIdsByExecucaoRange(
  http: TfsClient,
  project: string,
  dateFrom: string,
  dateTo: string,
  state?: string,
  assignedToDisplayName?: string
) {
  const start = toIsoStart(dateFrom);
  const endExclusive = addDaysISO(dateTo, 1);

  const stateClause = state ? ` AND [System.State] = '${escapeWiqlString(state)}'` : "";
  const assignedClause =
    assignedToDisplayName && assignedToDisplayName.trim()
      ? ` AND [System.AssignedTo] = '${escapeWiqlString(assignedToDisplayName.trim())}'`
      : "";

  const wiql = `
SELECT [System.Id]
FROM WorkItems
WHERE
  [System.TeamProject] = @project
  AND [System.WorkItemType] = 'Task'
  AND [System.State] <> 'Removed'
  AND [Custom.COTIN.DataExecucao] >= '${start}'
  AND [Custom.COTIN.DataExecucao] <  '${endExclusive}'
  ${stateClause}
  ${assignedClause}
ORDER BY [Custom.COTIN.DataExecucao] DESC`;

  const url = `/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.0`;
  const data = await http.post(url, { query: wiql });

  const ids: number[] = (data?.workItems ?? []).map((x: any) => x.id);
  return ids;
}

export async function getWorkItemsBatch(http: TfsClient, ids: number[]) {
  if (!ids.length) return [];
  const url = `/_apis/wit/workitemsbatch?api-version=7.0`;

  const chunkSize = 200;
  const out: any[] = [];

  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const data = await http.post(url, { ids: slice, fields: [...TFS_FIELDS] });
    out.push(...(data?.value ?? []));
  }
  return out;
}