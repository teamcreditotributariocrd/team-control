import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1443909;
const datasExecucao = [
  "2026-09-01",
  "2026-09-04",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-15",
  "2026-09-18",
  "2026-09-21",
  "2026-09-22",
  "2026-09-24",
  "2026-09-25",
  "2026-09-29",
  "2026-09-30",
];

const drafts = datasExecucao.map((dataExecucao) => {
  const dataBr = formatDateBr(dataExecucao);
  return createTfsTaskDraft({
    title: `Alinhamentos com o cliente CRAT ${dataBr}`,
    description: "Alinhamentos com a CRAT sobre integracoes com o CRD e incidentes",
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
