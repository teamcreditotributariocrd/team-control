import { NtlmClient } from "axios-ntlm";
import type { GlpiIncident } from "./glpiClient.js";

type JsonPatchOp = {
  op: "add";
  path: string;
  value: unknown;
};

export const SUPPORT_BUG_AREA_PATH = "CSIS-G07\\SUPORTE\\CRD";
export const DEFAULT_SUPPORT_BUG_ITERATION_PATH = "CSIS-G07\\CRD - SUP - Sprint 95";

export type SupportBugTarget = {
  areaPath: string;
  iterationPath: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`Missing environment variable: ${name}`);
  return String(value).trim();
}

function createNtlmAxiosClient() {
  return NtlmClient({
    username: requireEnv("NTLM_USERNAME"),
    password: requireEnv("NTLM_PASSWORD"),
    domain: requireEnv("NTLM_DOMAIN"),
    workstation: requireEnv("NTLM_WORKSTATION"),
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .trim();
}

function makeGlpiLinksAbsolute(html: string, incidentUrl: string) {
  let origin = "";
  try {
    origin = new URL(incidentUrl).origin;
  } catch { }
  if (!origin) return html;

  return html.replace(/\b(href|src)=(["'])\/([^"']*)\2/gi, (_match, attr, quote, path) =>
    `${attr}=${quote}${origin}/${path}${quote}`
  );
}

function titleForBug(incident: GlpiIncident) {
  const title = `GLPI #${incident.id} - ${incident.title}`.trim();
  return title.length <= 255 ? title : title.slice(0, 252) + "...";
}

function reproStepsForBug(incident: GlpiIncident) {
  const descriptionHtml = makeGlpiLinksAbsolute(cleanHtml(incident.descriptionHtml), incident.url);
  const description = descriptionHtml || `<p>${escapeHtml(incident.descriptionText || "Chamado sem descricao no cache GLPI.")}</p>`;
  const requester = incident.requesterName || incident.requester || "-";

  return [
    "<h3>Origem GLPI</h3>",
    `<p><strong>Chamado:</strong> <a href="${escapeHtml(incident.url)}">#${incident.id}</a></p>`,
    `<p><strong>Solicitante:</strong> ${escapeHtml(String(requester))}<br>`,
    `<strong>Status GLPI:</strong> ${escapeHtml(String(incident.status || "-"))}</p>`,
    "<h3>Descricao do chamado</h3>",
    description,
  ].join("");
}

export function buildCreateBugPayload(incident: GlpiIncident, target: SupportBugTarget): JsonPatchOp[] {
  return [
    { op: "add", path: "/fields/System.Title", value: titleForBug(incident) },
    { op: "add", path: "/fields/System.AreaPath", value: target.areaPath },
    { op: "add", path: "/fields/System.IterationPath", value: target.iterationPath },
    { op: "add", path: "/fields/Microsoft.VSTS.TCM.ReproSteps", value: reproStepsForBug(incident) },
  ];
}

export async function createTfsBugFromIncident(incident: GlpiIncident, target: SupportBugTarget) {
  const collectionUrl = requireEnv("TFS_COLLECTION_URL").replace(/\/+$/, "");
  const project = requireEnv("TFS_PROJECT");
  const client = createNtlmAxiosClient();
  const url = `${collectionUrl}/${project}/_apis/wit/workitems/$Bug?api-version=1.0`;

  const response = await client.patch(url, buildCreateBugPayload(incident, target), {
    headers: { "Content-Type": "application/json-patch+json" },
  });

  return {
    id: Number(response.data.id),
    title: response.data.fields?.["System.Title"] ?? titleForBug(incident),
    areaPath: response.data.fields?.["System.AreaPath"] ?? target.areaPath,
    iterationPath: response.data.fields?.["System.IterationPath"] ?? target.iterationPath,
    url: response.data?._links?.html?.href ?? `${collectionUrl}/${project}/_workitems/edit/${response.data.id}`,
  };
}
