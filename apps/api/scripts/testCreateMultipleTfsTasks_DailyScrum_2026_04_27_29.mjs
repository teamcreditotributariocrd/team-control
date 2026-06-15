import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1371391;
const datasExecucao = [
  "2026-05-25",
  "2026-05-26",
  "2026-05-27",
  "2026-05-28",
  "2026-05-29",
];

const drafts = datasExecucao.map((dataExecucao) => {
  const dataBr = formatDateBr(dataExecucao);
  return createTfsTaskDraft({
    title: `Daily Scrum ${dataBr}`,
    description:
      "O que foi feito? Realização da DS do CRD. Como foi feito? Via Discord, reunião Ágil, com a finalidade de controlar o andamento da sprint do sistema e expor impedimentos se houver",
    assignedTo: "Jorge Barbosa de Souza Neto",
    areaPath: "CSIS-G07\\CRD",
    iterationPath: "CSIS-G07",
    atividadeUst:
      "37 - Análise e Projeto - Cerimônias/Reuniões - Reunião Diária / Simples / Por dia Útil da Sprint e por profissional envolvido",
    complexidadeUst: "Simples",
    dataExecucao,
    dataExecucaoTime: "09:00:00Z",
    parentId: PBI_ID,
  });
});

await createTasksAndPrint(drafts);
