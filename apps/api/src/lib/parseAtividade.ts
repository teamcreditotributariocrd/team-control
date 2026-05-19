// apps/api/src/lib/parseAtividade.ts

export type ParsedAtividadeUST = {
  codigo?: number | null;
  grupo?: string | null;
  subgrupo?: string | null;
  atividade?: string | null;
  tipo?: string | null;
};

export function parseAtividadeUST(input: unknown): ParsedAtividadeUST {
  if (typeof input !== "string") {
    return { codigo: null, grupo: null, subgrupo: null, atividade: null, tipo: null };
  }

  const raw = input.trim();
  if (!raw) return { codigo: null, grupo: null, subgrupo: null, atividade: null, tipo: null };

  // Extrai o código (ex.: "248 - ...")
  let codigo: number | null = null;
  let rest = raw;

  const m = /^\s*(\d+)\s*-\s*(.+)$/.exec(raw);
  if (m) {
    codigo = Number(m[1]);
    rest = m[2].trim();
  }

  // Restante: "<Grupo> - <Subgrupo> - <AtividadePart...>"
  const dashParts = rest.split(/\s+-\s+/g).map(s => s.trim()).filter(Boolean);

  let grupo: string | null = null;
  let subgrupo: string | null = null;
  let atividadePartRaw: string | null = null;

  if (dashParts.length >= 1) grupo = dashParts[0] ?? null;
  if (dashParts.length >= 2) subgrupo = dashParts[1] ?? null;
  if (dashParts.length >= 3) atividadePartRaw = dashParts.slice(2).join(" - ").trim() || null;

  // AtividadePart normalmente: "<Atividade> / <ComplexidadeText> / <Tipo>"
  let atividade: string | null = null;
  let tipo: string | null = null;

  if (atividadePartRaw) {
    const slashParts = atividadePartRaw.split(/\s+\/\s+/g).map(s => s.trim());
    atividade = (slashParts[0] ?? "").trim() || null;
    if (slashParts.length >= 3) tipo = (slashParts[2] ?? "").trim() || null;
  }

  // Se atividade vier "-", melhor retornar null (mas agora o lookup principal será pelo código)
  if (atividade) {
    const a = atividade.trim();
    if (a === "-" || a === "—" || a === "") atividade = null;
  }

  return {
    codigo,
    grupo,
    subgrupo,
    atividade,
    tipo,
  };
}