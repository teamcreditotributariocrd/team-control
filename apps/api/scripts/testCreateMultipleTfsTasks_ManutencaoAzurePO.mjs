import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1371391;
const datasExecucao = [
  "2026-05-01",
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
  "2026-05-18",
];

const drafts = datasExecucao.map((dataExecucao) => {
  const dataBr = formatDateBr(dataExecucao);
  return createTfsTaskDraft({
    title: `Manutencao diaria do Azure (Pbis x Bugs) com o PO ${dataBr}`,
    description: `O que foi feito? Verificacao/acompanhamento/correcao da alimentacao de horas do burndown, das criacoes/alteracoes/correcoes das tarefas, das historias de usuarios, dos criterios de aceitacao e organizacao das demandas por ordem de estado na Sprint.
Como? Pelo Azure.`,
    assignedTo: "Jorge Barbosa de Souza Neto",
    areaPath: "CSIS-G07\\CRD",
    iterationPath: "CSIS-G07",
    atividadeUst:
      "41 - Analise e Projeto - Cerimonias/Reunioes - Reuniao Tecnica / Super Complexa / Acima de 3 horas ate 4,5 horas de duracao. Por profissional envolvido. Limitada a quantidade de fracoes de tempo dos dias uteis do mes.",
    complexidadeUst: "Super Complexa",
    dataExecucao,
    dataExecucaoTime: "12:00:00Z",
    parentId: PBI_ID,
  });
});

await createTasksAndPrint(drafts);
