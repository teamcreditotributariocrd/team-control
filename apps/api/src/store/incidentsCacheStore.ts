import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GlpiIncident, GlpiIncidentsQuery } from "../services/glpiClient.js";

export type IncidentParetoRow = {
    label: string;
    count: number;
    pct: number;
    cumulativePct: number;
    sampleIds: number[];
};

type CacheFile = {
    updatedAt: string | null;
    rows: GlpiIncident[];
};

function resolveApiDataDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "..", "..", "data");
}

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function dateKey(value?: string | null) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

function normText(value: string) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function titlePatternKey(row: GlpiIncident) {
    const text = normText(row.title ?? "");
    const stop = new Set([
        "solicitacao", "chamado", "erro", "problema", "favor", "verificar", "ajuste", "acesso",
        "solicito", "realizar", "realizacao", "sistema", "usuario", "demanda", "analise",
        "incidente", "duvida", "informacao", "incluir", "alterar", "corrigir", "validar",
        "acessar", "abrir", "gerar", "emitir", "falha",
    ]);
    const words = text.split(" ").filter((w) => w.length >= 4 && !stop.has(w));
    return words.slice(0, 5).join(" ") || text.slice(0, 60) || "Nao classificado";
}

function filterRows(rows: GlpiIncident[], q: GlpiIncidentsQuery) {
    const wantOpen = String(q.status ?? "").toUpperCase() === "OPEN";
    const wantStatus = String(q.status ?? "").toUpperCase();
    const searchTxt = normText(String(q.search ?? ""));
    const from = q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : "";
    const to = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : "";

    return rows.filter((r) => {
        const incidentDate = dateKey(r.openedAt || r.updatedAt);
        if (from && (!incidentDate || incidentDate < from)) return false;
        if (to && (!incidentDate || incidentDate > to)) return false;

        const status = String(r.status ?? "").toUpperCase();
        if (wantOpen && (status === "SOLVED" || status === "CLOSED")) return false;
        if (!wantOpen && wantStatus && wantStatus !== "ALL" && status !== wantStatus) return false;

        if (searchTxt) {
            const hay = normText(`${r.id} ${r.title} ${r.requester ?? ""} ${r.groupTech ?? ""} ${r.techAssignee ?? ""} ${r.descriptionText ?? ""}`);
            if (!hay.includes(searchTxt)) return false;
        }

        return true;
    });
}

function buildPareto(rows: GlpiIncident[], groupBy: "titlePattern" | "requester" | "status" | "priority", limit = 10) {
    const map = new Map<string, { label: string; count: number; sampleIds: number[] }>();
    for (const row of rows) {
        const label =
            groupBy === "titlePattern" ? titlePatternKey(row) :
                String((row as any)[groupBy] ?? "").trim() || "Nao classificado";
        const current = map.get(label) ?? { label, count: 0, sampleIds: [] };
        current.count += 1;
        if (current.sampleIds.length < 5) current.sampleIds.push(row.id);
        map.set(label, current);
    }

    const total = rows.length || 1;
    let acc = 0;
    return Array.from(map.values())
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, limit)
        .map((row) => {
            acc += row.count;
            return {
                ...row,
                pct: Number(((row.count / total) * 100).toFixed(1)),
                cumulativePct: Number(((acc / total) * 100).toFixed(1)),
            };
        });
}

export function createIncidentsCacheStore(dataDir = resolveApiDataDir()) {
    ensureDir(dataDir);
    const file = path.join(dataDir, "incidentsCache.json");
    let cache: CacheFile = { updatedAt: null, rows: [] };

    function persist() {
        fs.writeFileSync(file, JSON.stringify(cache, null, 2), "utf-8");
    }

    function load() {
        if (!fs.existsSync(file)) {
            persist();
            return;
        }
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        cache = {
            updatedAt: parsed?.updatedAt ?? null,
            rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
        };
    }

    load();

    return {
        getMeta() {
            return { updatedAt: cache.updatedAt, totalCached: cache.rows.length };
        },
        replace(rows: GlpiIncident[]) {
            const byId = new Map<number, GlpiIncident>();
            for (const row of rows) byId.set(row.id, row);
            cache = {
                updatedAt: new Date().toISOString(),
                rows: Array.from(byId.values()).sort((a, b) => b.id - a.id),
            };
            persist();
            return this.getMeta();
        },
        query(q: GlpiIncidentsQuery) {
            const limit = Math.max(1, Math.min(Number(q.limit ?? 500), 5000));
            const filtered = filterRows(cache.rows, q);
            return {
                rows: filtered.slice(0, limit),
                total: filtered.length,
                scanned: cache.rows.length,
                cache: this.getMeta(),
            };
        },
        analytics(q: GlpiIncidentsQuery) {
            const rows = filterRows(cache.rows, q);
            const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
                const key = String(row.status ?? "Nao classificado");
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
            }, {});
            const openRows = rows.filter((row) => {
                const s = String(row.status ?? "").toUpperCase();
                return s !== "SOLVED" && s !== "CLOSED";
            });
            const topTitlePattern = buildPareto(rows, "titlePattern", 1)[0] ?? null;
            const topRequester = buildPareto(rows, "requester", 1)[0] ?? null;
            const insights = [
                topTitlePattern ? `Padrao mais recorrente nos titulos: "${topTitlePattern.label}" (${topTitlePattern.count} chamados).` : null,
                topRequester ? `Solicitante com maior volume no filtro: ${topRequester.label} (${topRequester.count} chamados).` : null,
                `Chamados em aberto no filtro: ${openRows.length}.`,
                rows.length ? `Fechados/resolvidos representam ${Math.round((((statusCounts.CLOSED ?? 0) + (statusCounts.SOLVED ?? 0)) / rows.length) * 100)}% do filtro.` : null,
            ].filter(Boolean);

            return {
                total: rows.length,
                cache: this.getMeta(),
                insights,
                pareto: {
                    titlePattern: buildPareto(rows, "titlePattern", 10),
                    requester: buildPareto(rows, "requester", 10),
                    status: buildPareto(rows, "status", 10),
                    priority: buildPareto(rows, "priority", 10),
                },
            };
        },
    };
}
