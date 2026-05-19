import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1354277;
const atividadeUst =
  "41 - Análise e Projeto - Cerimônias/Reuniões - Reunião Tecnica / Super Complexa / Acima de 3 horas até 4,5 horas de duração. Por profissional envolvido. Limitada a quantidade de frações de tempo dos dias úteis do mês.";

const atividades = [
  {
    prefixo: "Desenvolvimento/ajustes calculado para data de distribuição",
    datasExecucao: ["2026-04-02", "2026-04-09", "2026-04-24"],
  },
  {
    prefixo: "Alinhamentos sobre assinatura gov.br",
    datasExecucao: ["2026-04-07", "2026-04-15", "2026-04-29"],
  },
  {
    prefixo: "Alinhamentos com time ePat sobre integração com o CRD",
    datasExecucao: ["2026-04-13", "2026-04-17", "2026-04-30"],
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
