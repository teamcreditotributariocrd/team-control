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
    title: `Daily Scrum ${dataBr}`,
    description:
      "O que foi feito? Realização da DS do CRD. Como foi feito? Via Discord, reunião Ágil, com a finalidade de controlar o andamento da sprint do sistema e expor impedimentos se houver",
    assignedTo: "Jorge Barbosa de Souza Neto",
    areaPath: "CSIS-G07\\CRD",
    iterationPath: "CSIS-G07",
    atividadeUst:
      "37 - Análise e Projeto - Cerimônias/Reuniões - Reunião Diária / Simples / Por dia Útil da Sprint e por profissional envolvido",
    complexidadeUst: "Simples",
    dataExecucao,
    dataExecucaoTime: "09:00:00Z",
    parentId: PBI_ID,
  });
});

await createTasksAndPrint(drafts);
