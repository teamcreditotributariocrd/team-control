import { createTasksAndPrint, createTfsTaskDraft } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1354277;
const datasExecucao = [
  "2026-04-27",
  "2026-04-28",
  "2026-04-29",
];

const drafts = datasExecucao.map((dataExecucao) =>
  createTfsTaskDraft({
    title: "Alinhamentos com a Gestão",
    description: "Alinhamentos com a gestão sobre assuntos de decisão ou probmea urgentes",
    assignedTo: "Jorge Barbosa de Souza Neto",
    areaPath: "CSIS-G07\\CRD",
    iterationPath: "CSIS-G07",
    atividadeUst:
      "41 - Análise e Projeto - Cerimônias/Reuniões - Reunião Técnica / Super Complexa / Acima de 3 horas até 4,5 horas de duração. Por profissional envolvido. Limitada a quantidade de frações de tempo dos dias úteis do mês.",
    complexidadeUst: "Super Complexa",
    dataExecucao,
    dataExecucaoTime: "12:00:00Z",
    parentId: PBI_ID,
  })
);

await createTasksAndPrint(drafts);
