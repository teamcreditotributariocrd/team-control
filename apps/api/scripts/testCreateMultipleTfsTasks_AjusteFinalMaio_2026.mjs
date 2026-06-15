import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1371391;

const tarefas = [
  {
    titlePrefix: "Reuniao de Alinhamento rapido com IPVA",
    description: "Reuniao de Alinhamento rapido com IPVA",
    atividadeUst:
      "38 - Analise e Projeto - Cerimonias/Reunioes - Reuniao Tecnica / Simples / Ate 30 minutos de duracao. Por profissional envolvido. Limitada a quantidade de fracoes de tempo dos dias uteis do mes.",
    complexidadeUst: "Simples",
    dataExecucao: "2026-05-29",
    dataExecucaoTime: "12:00:00Z",
  },
  {
    titlePrefix: "Daily Scrum",
    description:
      "O que foi feito? Realizacao da DS do CRD. Como foi feito? Via Discord, reuniao agil, com a finalidade de controlar o andamento da sprint do sistema e expor impedimentos se houver",
    atividadeUst:
      "37 - Analise e Projeto - Cerimonias/Reunioes - Reuniao Diaria / Simples / Por dia util da Sprint e por profissional envolvido",
    complexidadeUst: "Simples",
    dataExecucao: "2026-05-30",
    dataExecucaoTime: "09:00:00Z",
  },
];

const drafts = tarefas.map((tarefa) => {
  const dataBr = formatDateBr(tarefa.dataExecucao);
  const title = `${tarefa.titlePrefix} ${dataBr}`;

  return createTfsTaskDraft({
    title,
    description: tarefa.description,
    assignedTo: "Jorge Barbosa de Souza Neto",
    areaPath: "CSIS-G07\\CRD",
    iterationPath: "CSIS-G07",
    atividadeUst: tarefa.atividadeUst,
    complexidadeUst: tarefa.complexidadeUst,
    dataExecucao: tarefa.dataExecucao,
    dataExecucaoTime: tarefa.dataExecucaoTime,
    parentId: PBI_ID,
  });
});

await createTasksAndPrint(drafts);
