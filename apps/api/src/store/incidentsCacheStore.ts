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

type IncidentClassification = {
    theme: string;
    symptom: string;
    object: string;
    suggestedAction: string;
    confidence: number;
};

type ThemeDetail = {
    theme: string;
    count: number;
    pct: number;
    suggestedAction: string;
    rows: Array<GlpiIncident & { classification: IncidentClassification }>;
    requesters: IncidentParetoRow[];
    statuses: IncidentParetoRow[];
    priorities: IncidentParetoRow[];
};

type CacheFile = {
    updatedAt: string | null;
    rows: GlpiIncident[];
};

function statusSummary(rows: GlpiIncident[]) {
    const count = (status: string) => rows.filter((row) => String(row.status ?? "").toUpperCase() === status).length;
    const NEW = count("NEW");
    const ASSIGNED = count("ASSIGNED");
    const PLANNED = count("PLANNED");
    const PENDING = count("PENDING");
    const WAITING_APPROVAL = count("WAITING_APPROVAL");
    const SOLVED = count("SOLVED");
    const CLOSED = count("CLOSED");
    const OPEN = rows.filter((row) => {
        const s = String(row.status ?? "").toUpperCase();
        return s !== "SOLVED" && s !== "CLOSED";
    }).length;

    return {
        total: rows.length,
        NEW,
        ASSIGNED,
        PLANNED,
        PENDING,
        WAITING_APPROVAL,
        SOLVED,
        CLOSED,
        OPEN,
        IN_ATTENDANCE: ASSIGNED + PLANNED + PENDING + WAITING_APPROVAL,
    };
}

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

function hasAny(text: string, terms: string[]) {
    return terms.some((term) => text.includes(normText(term)));
}

function classifyIncident(row: GlpiIncident): IncidentClassification {
    const text = normText(`${row.title ?? ""} ${row.descriptionText ?? ""}`);
    let theme = "Geral";
    let object = "Nao classificado";
    let symptom = "Solicitacao/analise";
    let suggestedAction = "Revisar titulo e descricao do chamado para identificar acao tecnica.";
    let confidence = 0.35;

    const themes = [
        { label: "Parcelamento", object: "Parcelamento", terms: ["parcelamento", "parcela", "ipva", "ppd", "pva", "pvad"] },
        { label: "Acesso/Permissao", object: "Acesso", terms: ["acesso", "permissao", "login", "senha", "usuario", "perfil", "autorizacao"] },
        { label: "BI/Relatorio", object: "Relatorio/BI", terms: ["relatorio", "painel", "bi", "indicador", "consulta", "dashboard"] },
        { label: "ALIM/Batimento", object: "ALIM/Batimento", terms: ["alim", "batimento", "baixa", "pagamento", "quitado"] },
        { label: "Notificacao", object: "Notificacao", terms: ["notificacao", "notificar", "publicacao", "publicar", "edital"] },
        { label: "ACT", object: "ACT", terms: ["act"] },
        { label: "Omissos/EFD", object: "Omissos/EFD", terms: ["omisso", "omissos", "efd", "carga"] },
        { label: "Assinatura", object: "Assinatura", terms: ["assinatura", "govbr", "gov br", "certificado"] },
        { label: "Integracao", object: "Integracao", terms: ["integracao", "webservice", "api", "retorno", "sincronizacao"] },
    ];

    for (const t of themes) {
        if (hasAny(text, t.terms)) {
            theme = t.label;
            object = t.object;
            confidence += 0.25;
            break;
        }
    }

    if (hasAny(text, ["acesso", "permissao", "login", "senha", "perfil"])) {
        symptom = "Acesso/permissao";
        suggestedAction = "Validar perfil, lotacao/grupo e regra de autorizacao antes de alterar codigo.";
        confidence += 0.18;
    } else if (hasAny(text, ["divergencia", "valor", "diferenca", "inconsistencia", "incorreto", "errado"])) {
        symptom = "Divergencia de dados/valores";
        suggestedAction = "Comparar fonte de dados, regra de calculo e consulta usada no sistema; anexar caso exemplo.";
        confidence += 0.2;
    } else if (hasAny(text, ["erro", "falha", "exception", "nao gera", "nao abre", "nao funciona", "problema"])) {
        symptom = "Erro funcional";
        suggestedAction = "Reproduzir o fluxo, coletar mensagem/print/log e criar correcao com teste do cenario.";
        confidence += 0.18;
    } else if (hasAny(text, ["lento", "lentidao", "demora", "timeout", "travando"])) {
        symptom = "Performance/timeout";
        suggestedAction = "Medir tempo de resposta, revisar consulta/indice e verificar volume de dados do caso.";
        confidence += 0.18;
    } else if (hasAny(text, ["incluir", "alterar", "ajustar", "solicito", "solicitacao"])) {
        symptom = "Solicitacao de ajuste";
        suggestedAction = "Confirmar regra de negocio, impacto e criterio de aceite antes de implementar.";
        confidence += 0.12;
    }

    if (theme === "Parcelamento" && symptom === "Erro funcional") {
        suggestedAction = "Revisar regra de parcelamento, datas de vencimento/dia util e integracao PVA/PVAD com caso exemplo.";
        confidence += 0.1;
    }
    if (theme === "BI/Relatorio" && symptom === "Divergencia de dados/valores") {
        suggestedAction = "Comparar query do painel/relatorio com a fonte oficial e validar filtros de periodo/status.";
        confidence += 0.1;
    }
    if (theme === "ALIM/Batimento") {
        suggestedAction = "Validar rotina de batimento/baixa, status financeiro e lista de documentos afetados.";
        confidence += 0.08;
    }

    return {
        theme,
        symptom,
        object,
        suggestedAction,
        confidence: Number(Math.min(confidence, 0.95).toFixed(2)),
    };
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

function buildPareto(rows: GlpiIncident[], groupBy: "theme" | "symptom" | "object" | "requester" | "status" | "priority", limit = 10) {
    const map = new Map<string, { label: string; count: number; sampleIds: number[] }>();
    for (const row of rows) {
        const classification = classifyIncident(row);
        const label =
            groupBy === "theme" || groupBy === "symptom" || groupBy === "object" ? classification[groupBy] :
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
        getById(id: number) {
            return cache.rows.find((row) => row.id === id) ?? null;
        },
        analytics(q: GlpiIncidentsQuery) {
            const rows = filterRows(cache.rows, q);
            const kpis = statusSummary(rows);
            const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
                const key = String(row.status ?? "Nao classificado");
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
            }, {});
            const openRows = rows.filter((row) => {
                const s = String(row.status ?? "").toUpperCase();
                return s !== "SOLVED" && s !== "CLOSED";
            });
            const topTheme = buildPareto(rows, "theme", 1)[0] ?? null;
            const topSymptom = buildPareto(rows, "symptom", 1)[0] ?? null;
            const topRequester = buildPareto(rows, "requester", 1)[0] ?? null;
            const recommendations = buildPareto(rows, "theme", 6).map((item) => {
                const incident = rows.find((row) => classifyIncident(row).theme === item.label);
                const classification = incident ? classifyIncident(incident) : null;
                return {
                    theme: item.label,
                    count: item.count,
                    pct: item.pct,
                    sampleIds: item.sampleIds,
                    suggestedAction: classification?.suggestedAction ?? "Revisar incidentes agrupados e definir acao corretiva.",
                };
            });
            const insights = [
                topTheme ? `Tema mais recorrente: ${topTheme.label} (${topTheme.count} chamados).` : null,
                topSymptom ? `Sintoma mais comum: ${topSymptom.label} (${topSymptom.count} chamados).` : null,
                topRequester ? `Solicitante com maior volume no filtro: ${topRequester.label} (${topRequester.count} chamados).` : null,
                `Chamados em aberto no filtro: ${openRows.length}.`,
                rows.length ? `Fechados/resolvidos representam ${Math.round((((statusCounts.CLOSED ?? 0) + (statusCounts.SOLVED ?? 0)) / rows.length) * 100)}% do filtro.` : null,
            ].filter(Boolean);

            return {
                total: rows.length,
                kpis,
                cache: this.getMeta(),
                insights,
                recommendations,
                pareto: {
                    theme: buildPareto(rows, "theme", 10),
                    symptom: buildPareto(rows, "symptom", 10),
                    requester: buildPareto(rows, "requester", 10),
                    status: buildPareto(rows, "status", 10),
                    priority: buildPareto(rows, "priority", 10),
                },
            };
        },
        themeDetail(q: GlpiIncidentsQuery, theme: string): ThemeDetail | null {
            const rows = filterRows(cache.rows, q)
                .map((row) => ({ ...row, classification: classifyIncident(row) }))
                .filter((row) => row.classification.theme === theme);
            if (!rows.length) return null;
            const allRows = filterRows(cache.rows, q);
            const first = rows[0].classification;
            return {
                theme,
                count: rows.length,
                pct: Number(((rows.length / Math.max(allRows.length, 1)) * 100).toFixed(1)),
                suggestedAction: first.suggestedAction,
                rows: rows.slice(0, 200),
                requesters: buildPareto(rows, "requester", 8),
                statuses: buildPareto(rows, "status", 8),
                priorities: buildPareto(rows, "priority", 8),
            };
        },
    };
}
