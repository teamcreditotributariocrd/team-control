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

function getBusinessDaysThreeTimesPerWeek(start, end) {
  const dates = [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  for (let current = new Date(startDate); current <= endDate; current.setDate(current.getDate() + 1)) {
    const dayOfWeek = current.getDay();
    const dateIso = formatDateIso(current);
    if ([1, 3, 5].includes(dayOfWeek) && !holidays.has(dateIso)) {
      dates.push(dateIso);
    }
  }

  return dates;
}

const datasExecucao = getBusinessDaysThreeTimesPerWeek(startDate, endDate);

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
