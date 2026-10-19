import { createTasksAndPrint, createTfsTaskDraft } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1426527;
const datasExecucao = [
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
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
