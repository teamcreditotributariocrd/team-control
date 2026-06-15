import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1371391;
const atividadeUst =
  "41 - Analise e Projeto - Cerimonias/Reunioes - Reuniao Tecnica / Super Complexa / Acima de 3 horas ate 4,5 horas de duracao. Por profissional envolvido. Limitada a quantidade de fracoes de tempo dos dias uteis do mes.";

const atividades = [
  {
    prefixo: "Reuniao de Qualidade",
    datasExecucao: ["2026-05-25"],
  },
  {
    prefixo: "Reuniao de Alinhamento de Virada das Notificacoes de ICMS",
    datasExecucao: ["2026-05-26"],
  },
  {
    prefixo: "Reuniao de Alinhamento sobre Gov.br",
    datasExecucao: ["2026-05-27"],
  },
  {
    prefixo: "Alinhamentos com a CRAT sobre Parcelamentos",
    datasExecucao: ["2026-05-28"],
  },
  {
    prefixo: "Alinhamentos com a CRAT sobre DAEMS destinacao FUNFAZ",
    datasExecucao: ["2026-05-29"],
  },
];

const drafts = atividades.flatMap((atividade) =>
  atividade.datasExecucao.map((dataExecucao) => {
    const dataBr = formatDateBr(dataExecucao);
    const titulo = `${atividade.prefixo} ${dataBr}`;

    return createTfsTaskDraft({
      title: titulo,
      description: titulo,
      assignedTo: "Jorge Barbosa de Souza Neto",
      areaPath: "CSIS-G07\\CRD",
      iterationPath: "CSIS-G07",
      atividadeUst,
      complexidadeUst: "Super Complexa",
      dataExecucao,
      dataExecucaoTime: "12:00:00Z",
      parentId: PBI_ID,
    });
  })
);

await createTasksAndPrint(drafts);
