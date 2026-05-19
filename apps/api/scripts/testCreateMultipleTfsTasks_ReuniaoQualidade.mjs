import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1354277;
const datasExecucao = [
  "2026-04-01",
  "2026-04-08",
  "2026-04-15",
];

const drafts = datasExecucao.map((dataExecucao) => {
  const dataBr = formatDateBr(dataExecucao);
  return createTfsTaskDraft({
    title: `Reunião de Qualidade ${dataBr}`,
    description: "Reunião de qualidade com o time, para inovações e melhorias no sistema.",
    assignedTo: "Jorge Barbosa de Souza Neto",
    areaPath: "CSIS-G07\\CRD",
    iterationPath: "CSIS-G07",
    atividadeUst:
      "41 - Análise e Projeto - Cerimônias/Reuniões - Reunião Tecnica / Super Complexa / Acima de 3 horas até 4,5 horas de duração. Por profissional envolvido. Limitada a quantidade de frações de tempo dos dias úteis do mês.",
    complexidadeUst: "Super Complexa",
    dataExecucao,
    dataExecucaoTime: "12:00:00Z",
    parentId: PBI_ID,
  });
});

await createTasksAndPrint(drafts);
