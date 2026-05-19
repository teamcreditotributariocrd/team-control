import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1354277;
const datasExecucao = [
  "2026-04-01",
  "2026-04-06",
  "2026-04-07",
  "2026-04-08",
  "2026-04-09",
  "2026-04-10",
  "2026-04-13",
  "2026-04-14",
  "2026-04-15",
  "2026-04-16",
  "2026-04-17",
];

const drafts = datasExecucao.map((dataExecucao) => {
  const dataBr = formatDateBr(dataExecucao);
  return createTfsTaskDraft({
    title: `Daily Scrum ${dataBr}`,
    description:
      "O que foi feito? RealizaÃ§Ã£o da DS do CRD. Como foi feito? Via Discord, reuniÃ£o Ã¡gil, com a finalidade de controlar o andamento da sprint do sistema e expor impedimentos se houver",
    assignedTo: "Jorge Barbosa de Souza Neto",
    areaPath: "CSIS-G07\\CRD",
    iterationPath: "CSIS-G07",
    atividadeUst:
      "37 - AnÃ¡lise e Projeto - CerimÃ´nias/ReuniÃµes - ReuniÃ£o DiÃ¡ria / Simples / Por dia Ãºtil da Sprint e por profissional envolvido",
    complexidadeUst: "Simples",
    dataExecucao,
    parentId: PBI_ID,
  });
});

await createTasksAndPrint(drafts);
