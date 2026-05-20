// apps/api/src/store/store.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

export type CatalogRow = {
  codigo: number;
  grupo: string;
  subgrupo: string;
  atividade: string;
  tipo: string;
  complexidade: string;
  ust: number;
};

export type RunSummary = {
  id: number;
  createdAt: string;
  project: string;
  dateFrom: string;
  dateTo: string;
  state?: string;
  totalTasks: number;
  mapped: number;
  unmapped: number;
  totalUst: number;
};

export type RunItem = {
  work_item_id: number;
  title: string | null;
  assigned_to: string | null;
  area_path: string | null;
  iteration_path: string | null;
  data_execucao: string | null;
  atividade_raw: string | null;
  codigo: number | null;
  complexidade: string | null;
  ust: number | null;
  status: "MAPPED" | "UNMAPPED";
  audit: string | null;
};

export type CatalogPageQuery = { q?: string; offset?: number; limit?: number };
export type CatalogPage = { total: number; offset: number; limit: number; rows: CatalogRow[] };

export type FavoriteCatalogResponse = {
  uniqueName: string;
  codes: number[];
  rows: CatalogRow[];
};

export type CatalogSuggestion = CatalogRow & {
  score: number;
  matchedTerms: string[];
};

export type LookupOk = {
  ok: true;
  ust: number;
  codigo: number;
  row: CatalogRow;
  audit: string;
};

export type LookupMismatch = {
  ok: false;
  reason: "COMPLEXIDADE_DIVERGENTE";
  codigo: number;
  row: CatalogRow;
  expectedComplexidade: string;
  gotComplexidade: string | null;
};

export type LookupResult = LookupOk | LookupMismatch;

export type AppStore = {
  importCatalogXlsx(filePath: string): Promise<{ totalImported: number; sheetName: string; detectedHeaders: string[] }>;
  lookupUstByCode(codigo: number, complexidadeTfs?: string | null): LookupResult | null;
  suggestCatalogForText(text: string, limit?: number): CatalogSuggestion[];
  getCatalogPage(query: CatalogPageQuery): CatalogPage;
  getCatalogByCode(code: number): CatalogRow | null;
  getFavoriteCatalog(uniqueName: string): FavoriteCatalogResponse;
  addFavoriteCatalog(uniqueName: string, code: number): FavoriteCatalogResponse;
  removeFavoriteCatalog(uniqueName: string, code: number): FavoriteCatalogResponse;
  createRun(summary: Omit<RunSummary, "id">, items: RunItem[]): Promise<number>;
  readRunItems(runId: number): Promise<RunItem[]>;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function parsePeso(value: any): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const v = value.trim().replace(".", "").replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function normComp(s: any): string {
  return String(s ?? "").trim().toUpperCase();
}

function normalizeSearch(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function tokenizeSearch(s: string) {
  const stop = new Set([
    "A", "O", "AS", "OS", "DE", "DA", "DO", "DAS", "DOS", "E", "EM", "NO", "NA", "NOS", "NAS",
    "PARA", "POR", "COM", "SEM", "AO", "AOS", "UM", "UMA", "CORRIGIR", "AJUSTAR", "CRIAR",
    "ALTERAR", "VALIDAR", "ANALISAR", "IMPLEMENTAR", "ERRO", "BUG", "TASK", "TAREFA",
  ]);
  return Array.from(new Set(
    normalizeSearch(s)
      .split(/[^A-Z0-9]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 3 && !stop.has(x))
  ));
}

function pick(row: any, keys: string[]) {
  for (const k of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, k)) return row[k];
  }
  return undefined;
}

function isBlank(v: any) {
  const s = String(v ?? "").trim();
  return !s || s === "_" || s === "-";
}

function resolveApiDataDir() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..", "..", "data");
}

export function createStore(dataDir = resolveApiDataDir()): AppStore {
  ensureDir(dataDir);

  const catalogFile = path.join(dataDir, "catalog.json");
  const runsFile = path.join(dataDir, "runs.json");
  const favoritesFile = path.join(dataDir, "favorites.json");

  let catalog: CatalogRow[] = [];
  let runs: RunSummary[] = [];
  let runItemsByRunId: Record<number, RunItem[]> = {};
  let favoritesByUser: Record<string, number[]> = {};

  const byCode = new Map<number, CatalogRow>();

  function rebuildIndex() {
    byCode.clear();
    for (const r of catalog) byCode.set(r.codigo, r);
  }

  function load() {
    if (fs.existsSync(catalogFile)) {
      const parsed = JSON.parse(fs.readFileSync(catalogFile, "utf-8"));
      if (Array.isArray(parsed)) catalog = parsed;
      else if (Array.isArray(parsed?.rows)) catalog = parsed.rows;
      else if (Array.isArray(parsed?.catalog)) catalog = parsed.catalog;
      else catalog = [];
    }
    if (fs.existsSync(runsFile)) {
      const parsed = JSON.parse(fs.readFileSync(runsFile, "utf-8"));
      runs = parsed.runs ?? [];
      runItemsByRunId = parsed.items ?? {};
    }
    if (fs.existsSync(favoritesFile)) {
      const parsed = JSON.parse(fs.readFileSync(favoritesFile, "utf-8"));
      favoritesByUser = parsed?.favoritesByUser ?? parsed ?? {};
    }
    rebuildIndex();
  }

  function persist() {
    fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2), "utf-8");
    fs.writeFileSync(runsFile, JSON.stringify({ runs, items: runItemsByRunId }, null, 2), "utf-8");
  }

  function persistFavorites() {
    fs.writeFileSync(favoritesFile, JSON.stringify({ favoritesByUser }, null, 2), "utf-8");
  }

  function favoriteKey(uniqueName: string) {
    return String(uniqueName ?? "").trim().toLowerCase();
  }

  function favoriteResponse(uniqueName: string): FavoriteCatalogResponse {
    const key = favoriteKey(uniqueName);
    const codes = Array.from(new Set((favoritesByUser[key] ?? []).filter((c) => byCode.has(c)))).sort((a, b) => a - b);
    favoritesByUser[key] = codes;
    return {
      uniqueName,
      codes,
      rows: codes.map((code) => byCode.get(code)).filter(Boolean) as CatalogRow[],
    };
  }

  load();

  return {
    async importCatalogXlsx(filePath: string) {
      const wb = xlsx.readFile(filePath);
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];

      // defval "" -> células vazias viram string vazia
      const rows = xlsx.utils.sheet_to_json(ws, { defval: "" }) as any[];
      const detectedHeaders = rows.length ? Object.keys(rows[0] ?? {}) : [];

      const imported: CatalogRow[] = [];
      let codigo = 0;

      // ✅ forward-fill (para lidar com células mescladas / vazias)
      let lastGrupo = "";
      let lastSubgrupo = "";
      let lastAtividade = "";
      let lastTipo = "";

      for (const row of rows) {
        // aceita variações de header (sua planilha usa Complexa/UST)
        let grupo = norm(pick(row, ["Grupo", "GRUPO"]));
        let subgrupo = norm(pick(row, ["Subgrupo", "SUBGRUPO"]));
        let atividade = norm(pick(row, ["Atividade", "ATIVIDADE"]));
        let tipo = norm(pick(row, ["Tipo", "TIPO"]));

        const complexidade = norm(pick(row, ["Complexidade", "COMPLEXIDADE", "Complexa", "COMPLEXA"]));
        const ust = parsePeso(pick(row, ["Peso", "PESO", "UST", "Ust", "ust"]));

        // forward-fill: se vier vazio, usa o último valor
        if (isBlank(grupo)) grupo = lastGrupo;
        if (isBlank(subgrupo)) subgrupo = lastSubgrupo;
        if (isBlank(tipo)) tipo = lastTipo;

        // Atividade: se vier vazio/ "_" / "-", usa lastAtividade; se ainda vazio, usa Subgrupo como fallback
        if (isBlank(atividade)) atividade = lastAtividade;
        if (isBlank(atividade)) atividade = subgrupo;

        // guarda últimos valores úteis
        if (!isBlank(grupo)) lastGrupo = grupo;
        if (!isBlank(subgrupo)) lastSubgrupo = subgrupo;
        if (!isBlank(tipo)) lastTipo = tipo;
        if (!isBlank(atividade)) lastAtividade = atividade;

        // Regras mínimas: grupo/subgrupo/complexidade/ust precisam existir
        if (isBlank(grupo) || isBlank(subgrupo) || isBlank(complexidade) || ust == null) continue;

        codigo += 1;
        imported.push({
          codigo,
          grupo,
          subgrupo,
          atividade,
          tipo,
          complexidade,
          ust,
        });
      }

      if (imported.length === 0) {
        throw new Error(
          `Nenhuma linha importada. Verifique cabeçalhos.\n` +
          `Detectado: ${detectedHeaders.join(", ")}\n` +
          `Esperado: Grupo, Subgrupo, Atividade, Tipo, (Complexidade|Complexa), (Peso|UST)`
        );
      }

      catalog = imported;
      rebuildIndex();
      persist();

      return { totalImported: catalog.length, sheetName, detectedHeaders };
    },

    lookupUstByCode(codigo: number, complexidadeTfs?: string | null): LookupResult | null {
      const row = byCode.get(codigo);
      if (!row) return null;

      const tfs = normComp(complexidadeTfs);
      const cat = normComp(row.complexidade);

      if (tfs && cat && tfs !== cat) {
        return {
          ok: false,
          reason: "COMPLEXIDADE_DIVERGENTE",
          codigo,
          row,
          expectedComplexidade: row.complexidade,
          gotComplexidade: complexidadeTfs ?? null,
        };
      }

      return {
        ok: true,
        ust: row.ust,
        codigo,
        row,
        audit: `catalogCode(${codigo}) -> Peso=${row.ust} | Cat.Comp=${row.complexidade} | TFS.Comp=${complexidadeTfs ?? ""}`,
      };
    },

    suggestCatalogForText(text: string, limit = 3): CatalogSuggestion[] {
      const terms = tokenizeSearch(text);
      if (!terms.length) return [];

      const scored = catalog
        .map((row) => {
          const fields = {
            grupo: normalizeSearch(row.grupo),
            subgrupo: normalizeSearch(row.subgrupo),
            atividade: normalizeSearch(row.atividade),
            tipo: normalizeSearch(row.tipo),
          };
          const hay = `${fields.grupo} ${fields.subgrupo} ${fields.atividade} ${fields.tipo}`;
          const matchedTerms: string[] = [];
          let score = 0;

          for (const term of terms) {
            if (!hay.includes(term)) continue;
            matchedTerms.push(term);
            if (fields.atividade.includes(term)) score += 5;
            else if (fields.subgrupo.includes(term)) score += 4;
            else if (fields.grupo.includes(term)) score += 3;
            else score += 1;
          }

          const activity = fields.atividade || fields.subgrupo;
          if (activity && normalizeSearch(text).includes(activity)) score += 8;
          if (fields.subgrupo && normalizeSearch(text).includes(fields.subgrupo)) score += 5;

          return { ...row, score, matchedTerms };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score || a.codigo - b.codigo);

      return scored.slice(0, Math.min(Math.max(limit, 1), 10));
    },

    getCatalogPage(query: CatalogPageQuery) {
      const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 500);
      const offset = Math.max(Number(query.offset ?? 0), 0);
      const qRaw = (query.q ?? "").trim();

      let filtered = catalog;
      if (qRaw) {
        const q = normalizeSearch(qRaw);
        filtered = catalog.filter((r) => {
          const hay = normalizeSearch(
            `${r.codigo} ${r.grupo} ${r.subgrupo} ${r.atividade} ${r.tipo} ${r.complexidade} ${r.ust}`
          );
          return hay.includes(q);
        });
      }

      const total = filtered.length;
      const pageRows = filtered.slice(offset, offset + limit);
      return { total, offset, limit, rows: pageRows };
    },

    getCatalogByCode(code: number) {
      return byCode.get(code) ?? null;
    },

    getFavoriteCatalog(uniqueName: string) {
      return favoriteResponse(uniqueName);
    },

    addFavoriteCatalog(uniqueName: string, code: number) {
      if (!byCode.has(code)) throw new Error("CATALOG_NOT_FOUND");
      const key = favoriteKey(uniqueName);
      const current = new Set(favoritesByUser[key] ?? []);
      current.add(code);
      favoritesByUser[key] = Array.from(current).sort((a, b) => a - b);
      persistFavorites();
      return favoriteResponse(uniqueName);
    },

    removeFavoriteCatalog(uniqueName: string, code: number) {
      const key = favoriteKey(uniqueName);
      favoritesByUser[key] = (favoritesByUser[key] ?? []).filter((c) => c !== code);
      persistFavorites();
      return favoriteResponse(uniqueName);
    },

    async createRun(summary, items) {
      const id = (runs[runs.length - 1]?.id ?? 0) + 1;
      runs.push({ id, ...summary });
      runItemsByRunId[id] = items;
      persist();
      return id;
    },

    async readRunItems(runId: number) {
      return runItemsByRunId[runId] ?? [];
    },
  };
}
