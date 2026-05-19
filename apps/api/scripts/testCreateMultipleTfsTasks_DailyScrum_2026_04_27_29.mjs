import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1371391;
const datasExecucao = [
  "2026-05-01",
  "2026-05-02",
  "2026-05-03",
  "2026-05-04",
  "2026-05-05",
  "2026-05-06",
  "2026-05-07",
  "2026-05-08",
  "2026-05-09",
  "2026-05-10",
  "2026-05-11",
  "2026-05-12",
  "2026-05-13",
  "2026-05-14",
  "2026-05-15",
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
