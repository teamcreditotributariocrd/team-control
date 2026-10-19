import { createTasksAndPrint, createTfsTaskDraft, formatDateBr } from "./_shared/tfsTaskHelpers.mjs";

const PBI_ID = 1443909;
const startDate = "2026-09-01";
const endDate = "2026-09-30";
const holidays = new Set(["2026-09-07"]);

function formatDateIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBusinessDays(start, end) {
  const dates = [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  for (let current = new Date(startDate); current <= endDate; current.setDate(current.getDate() + 1)) {
    const dayOfWeek = current.getDay();
    const dateIso = formatDateIso(current);
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.has(dateIso)) {
      dates.push(dateIso);
    }
  }

  return dates;
}

const datasExecucao = getBusinessDays(startDate, endDate);

const drafts = datasExecucao.map((dataExecucao) => {
  const dataBr = formatDateBr(dataExecucao);
  return createTfsTaskDraft({
    title: `Reuniao com o PO - Alinhamento Azure ${dataBr}`,
    description:
      "O QUE FOI FEITO? Reuniao de alinhamento dos status das demandas/Bugs e suas respectivas tasks no Azure para preparacao da documentacao de entrega COMO? Via Discord",
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
