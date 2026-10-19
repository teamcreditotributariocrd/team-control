import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1443909;
const atividadeUst =
  "41 - Analise e Projeto - Cerimonias/Reunioes - Reuniao Tecnica / Super Complexa / Acima de 3 horas ate 4,5 horas de duracao. Por profissional envolvido. Limitada a quantidade de fracoes de tempo dos dias uteis do mes.";

const atividades = [
  {
    prefixo: "Problemas na Pendencia Fiscal e Certidao Negativa de Debitos",
    datasExecucao: [
      "2026-09-02",
      "2026-09-08",
      "2026-09-11",
      "2026-09-16",
      "2026-09-23",
      "2026-09-29",
    ],
  },
  {
    prefixo: "Reuniao e analise de permissoes de acesso para PGE na Pendencia Fiscal e Certidao de Debitos",
    datasExecucao: [
      "2026-09-04",
      "2026-09-18",
      "2026-09-25",
    ],
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
