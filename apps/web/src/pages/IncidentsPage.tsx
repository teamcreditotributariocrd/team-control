import React, { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, type Session } from "../lib/api";

type IncidentRow = {
    id: number | string;
    title: string;
    type?: string | null;
    status: string;
    priority?: string | null;
    openedAt?: string | null;
    updatedAt?: string | null;
    solvedAt?: string | null;
    groupTech?: string | null;
    techAssignee?: string | null;
    descriptionText?: string | null;
    descriptionHtml?: string | null;
    requester?: string | null;
    category?: string | null;
    url?: string | null;
    source?: "GLPI" | "TFS" | string;
};

type IncidentCacheMeta = {
    updatedAt: string | null;
    totalCached: number;
};

type ParetoRow = {
    label: string;
    count: number;
    pct: number;
    cumulativePct: number;
    sampleIds: number[];
};

type ParetoResponse = {
    total: number;
    cache: IncidentCacheMeta;
    insights: string[];
    recommendations: Array<{
        theme: string;
        count: number;
        pct: number;
        sampleIds: number[];
        suggestedAction: string;
    }>;
    pareto: {
        theme: ParetoRow[];
        symptom: ParetoRow[];
        object: ParetoRow[];
        requester: ParetoRow[];
        status: ParetoRow[];
        priority: ParetoRow[];
    };
};

function cls(...xs: (string | false | null | undefined)[]) {
    return xs.filter(Boolean).join(" ");
}

function isoDate(d = new Date()) {
    return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
    const dt = new Date(iso + "T00:00:00");
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
}

function fmtDateTime(s?: string | null) {
    if (!s) return "-";
    const x = String(s).trim();
    if (!x) return "-";
    if (x.length >= 16 && x[4] === "-" && x[7] === "-") return x.slice(0, 16).replace("T", " ");
    return x.length > 16 ? x.slice(0, 16) : x;
}

function clip(s?: string | null, n = 140) {
    const x = String(s ?? "").trim();
    if (!x) return "-";
    return x.length > n ? x.slice(0, n - 1) + "-" : x;
}

function statusBadge(status?: string) {
    const s = String(status ?? "").toUpperCase();
    if (s === "NEW") return { label: "Novo", color: "#60a5fa" };
    if (s === "ASSIGNED") return { label: "Atribuido", color: "#facc15" };
    if (s === "PLANNED") return { label: "Planejado", color: "#a78bfa" };
    if (s === "PENDING") return { label: "Pendente", color: "#fb923c" };
    if (s === "SOLVED") return { label: "Resolvido", color: "#34d399" };
    if (s === "CLOSED") return { label: "Fechado", color: "#94a3b8" };
    return { label: status ?? "-", color: "#94a3b8" };
}

function priorityBadge(p?: string | null) {
    const s = String(p ?? "").toLowerCase();
    if (!s) return "-";
    if (s.includes("muito alta") || s.includes("crit")) return "Muito Alta";
    if (s.includes("alta")) return "Alta";
    if (s.includes("media") || s.includes("média")) return "Media";
    if (s.includes("baixa")) return "Baixa";
    return p ?? "-";
}

function typeBadge(t?: string | null) {
    const s = String(t ?? "").toUpperCase().trim();
    if (s === "REQUEST" || s.includes("REQUIS")) return "Requisicao";
    if (s === "INCIDENT" || s.includes("INCIDENT")) return "Incidente";
    return t ?? "-";
}

function kpiCounts(rows: IncidentRow[]) {
    const norm = (x: string) => String(x ?? "").toUpperCase();
    const total = rows.length;
    const NEW = rows.filter((r) => norm(r.status) === "NEW").length;
    const IN_PROGRESS = rows.filter((r) => ["ASSIGNED", "PLANNED", "PENDING"].includes(norm(r.status))).length;
    const SOLVED = rows.filter((r) => norm(r.status) === "SOLVED").length;
    const CLOSED = rows.filter((r) => norm(r.status) === "CLOSED").length;
    return { total, NEW, IN_PROGRESS, SOLVED, CLOSED };
}

function Badge({ label, color }: { label: string; color: string }) {
    return (
        <span className="pill" style={{ borderColor: `${color}55`, background: `${color}18`, color }}>
            {label}
        </span>
    );
}

function SpinnerLine({ label }: { label?: string }) {
    return (
        <div className="muted small" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="spinner" style={{ width: 16, height: 16 }} />
            <span>{label ?? "Carregando..."}</span>
        </div>
    );
}

function Drawer({
    open,
    onClose,
    row,
}: {
    open: boolean;
    onClose: () => void;
    row: IncidentRow | null;
}) {
    if (!open || !row) return null;

    const sb = statusBadge(row.status);

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.55)",
                display: "flex",
                justifyContent: "flex-end",
                zIndex: 1000,
            }}
        >
            <div
                className="card"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "min(720px, 96vw)",
                    height: "100%",
                    borderRadius: 0,
                    padding: 16,
                    overflow: "auto",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div>
                        <div className="muted small">{row.source ?? "GLPI"} | ID <span className="mono">{row.id}</span></div>
                        <div className="h2" style={{ marginTop: 6 }}>{row.title}</div>
                        <div className="muted small" style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <Badge label={sb.label} color={sb.color} />
                            <span className="pill">{priorityBadge(row.priority)}</span>
                            <span className="pill">{typeBadge(row.type)}</span>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                        {row.url ? (
                            <a className="btn ghost" href={row.url} target="_blank" rel="noreferrer">
                                Abrir GLPI
                            </a>
                        ) : null}
                        <button className="btn" onClick={onClose}>Fechar</button>
                    </div>
                </div>

                <div className="grid2" style={{ marginTop: 14, gap: 12 }}>
                    <div className="card" style={{ padding: 12 }}>
                        <div className="cardTitle" style={{ marginBottom: 10 }}>Campos</div>
                        <div className="row2" style={{ gap: 10 }}>
                            <KV k="Tipo" v={typeBadge(row.type)} />
                            <KV k="Status" v={sb.label} />
                        </div>
                        <div className="row2" style={{ gap: 10, marginTop: 10 }}>
                            <KV k="Prioridade" v={priorityBadge(row.priority)} />
                            <KV k="Solicitante" v={row.requester ?? "-"} mono />
                        </div>
                        <div className="row2" style={{ gap: 10, marginTop: 10 }}>
                            <KV k="Grupo tecnico" v={row.groupTech ?? "-"} mono />
                            <KV k="Tecnico" v={row.techAssignee ?? "-"} mono />
                        </div>
                        <div className="row2" style={{ gap: 10, marginTop: 10 }}>
                            <KV k="Abertura" v={fmtDateTime(row.openedAt)} mono />
                            <KV k="Ultima atualizacao" v={fmtDateTime(row.updatedAt)} mono />
                        </div>
                    </div>

                    <div className="card" style={{ padding: 12 }}>
                        <div className="cardTitle" style={{ marginBottom: 10 }}>Descricao do usuario</div>
                        <div
                            className="mono"
                            style={{
                                whiteSpace: "pre-wrap",
                                fontSize: 13,
                                lineHeight: 1.45,
                                padding: 12,
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,.08)",
                                background: "rgba(255,255,255,.03)",
                                maxHeight: 420,
                                overflow: "auto",
                            }}
                        >
                            {row.descriptionText?.trim() ? row.descriptionText : "-"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
    return (
        <div style={{ flex: 1 }}>
            <div className="muted small">{k}</div>
            <div className={cls("strong", mono && "mono")} style={{ marginTop: 4 }}>{v}</div>
        </div>
    );
}

export default function IncidentsPage({ session }: { session: Session }) {
    const [from, setFrom] = useState(() => addDays(isoDate(), -30));
    const [to, setTo] = useState(() => isoDate());
    const [status, setStatus] = useState<string>("ALL");
    const [search, setSearch] = useState<string>("");
    const [rows, setRows] = useState<IncidentRow[]>([]);
    const [serverTotal, setServerTotal] = useState<number | null>(null);
    const [scanned, setScanned] = useState<number | null>(null);
    const [cache, setCache] = useState<IncidentCacheMeta | null>(null);
    const [pareto, setPareto] = useState<ParetoResponse | null>(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [health, setHealth] = useState("");
    const [healthLoading, setHealthLoading] = useState(false);
    const [selected, setSelected] = useState<IncidentRow | null>(null);

    const query = useMemo(() => {
        const qs = new URLSearchParams();
        if (from) qs.set("from", from);
        if (to) qs.set("to", to);
        if (status) qs.set("status", status);
        if (search.trim()) qs.set("search", search.trim());
        qs.set("limit", "300");
        qs.set("pageSize", "200");
        qs.set("maxPages", "10");
        return qs.toString();
    }, [from, to, status, search]);

    async function refresh() {
        setLoading(true);
        setErr("");
        try {
            const data = await apiGet<{ rows: IncidentRow[]; total?: number; scanned?: number; cache?: IncidentCacheMeta }>(`/api/incidents?${query}`, session);
            setRows(Array.isArray(data?.rows) ? data.rows : []);
            setServerTotal(Number.isFinite(Number(data?.total)) ? Number(data.total) : null);
            setScanned(Number.isFinite(Number(data?.scanned)) ? Number(data.scanned) : null);
            setCache(data.cache ?? null);
            const analytics = await apiGet<ParetoResponse>(`/api/incidents/analytics/pareto?${query}`, session);
            setPareto(analytics);
            setCache(analytics.cache ?? data.cache ?? null);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
            setRows([]);
            setServerTotal(null);
            setScanned(null);
            setPareto(null);
        } finally {
            setLoading(false);
        }
    }

    async function syncGlpi() {
        setSyncing(true);
        setErr("");
        try {
            const qs = new URLSearchParams();
            qs.set("limit", "1000");
            qs.set("pageSize", "200");
            qs.set("maxPages", "20");
            await apiSend(`/api/incidents/sync?${qs.toString()}`, "POST", {}, session);
            await refresh();
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setSyncing(false);
        }
    }

    async function testGlpi() {
        setHealthLoading(true);
        setHealth("");
        try {
            const data = await apiGet<{ ok: boolean; sampleCount?: number }>("/api/incidents/_health/glpi", session);
            setHealth(data.ok ? "GLPI conectado" : "GLPI respondeu sem confirmar conexao");
        } catch (e: any) {
            setHealth(String(e?.message ?? e));
        } finally {
            setHealthLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, session.uniqueName, session.role]);

    const kpi = useMemo(() => kpiCounts(rows), [rows]);

    return (
        <div>
            <div className="pageHeader">
                <div>
                    <div className="h1">Incidentes</div>
                    <div className="muted">Fila GLPI com filtros, responsaveis e detalhes do chamado</div>
                </div>

                <div className="pageHeaderRight" style={{ gap: 10 }}>
                    <button className="btn ghost" onClick={testGlpi} disabled={healthLoading || loading}>
                        {healthLoading ? "Testando..." : "Testar GLPI"}
                    </button>
                    <button className="btn primary" onClick={syncGlpi} disabled={syncing || loading}>
                        {syncing ? "Sincronizando..." : "Atualizar cache GLPI"}
                    </button>
                    <button className="btn ghost" onClick={refresh} disabled={loading}>
                        Atualizar
                    </button>
                </div>
            </div>

            {loading && <SpinnerLine label="Consultando GLPI e montando a fila de incidentes..." />}
            {health && (
                <div
                    className="alert"
                    style={health.includes("GLPI conectado") ? {
                        borderColor: "rgba(50,213,131,.32)",
                        background: "rgba(50,213,131,.10)",
                        color: "#B7F7CF",
                    } : undefined}
                >
                    {health}
                </div>
            )}
            {err && <div className="alert">{err}</div>}

            <div className="grid2" style={{ gap: 12 }}>
                <div className="card" style={{ padding: 14 }}>
                    <div className="cardTitle">Visao geral</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: 10 }}>
                        <Kpi label="Total" value={kpi.total} />
                        <Kpi label="Novos" value={kpi.NEW} />
                        <Kpi label="Em andamento" value={kpi.IN_PROGRESS} />
                        <Kpi label="Resolvidos" value={kpi.SOLVED} />
                        <Kpi label="Fechados" value={kpi.CLOSED} />
                    </div>
                    <div className="muted small" style={{ marginTop: 10 }}>
                        Periodo: <span className="mono">{from}</span> ate <span className="mono">{to}</span>
                        {" "} | Filtro: <span className="mono">{status || "ALL"}</span>
                        {" "} | Retornados: <span className="mono">{rows.length}</span>
                        {serverTotal !== null ? <> / Total filtrado: <span className="mono">{serverTotal}</span></> : null}
                        {scanned !== null ? <> / Lidos do GLPI: <span className="mono">{scanned}</span></> : null}
                        {cache ? <> / Cache local: <span className="mono">{cache.totalCached}</span> chamados, atualizado em <span className="mono">{cache.updatedAt ? fmtDateTime(cache.updatedAt) : "nunca"}</span></> : null}
                    </div>
                </div>

                <div className="card" style={{ padding: 14 }}>
                    <div className="cardTitle">Filtros</div>

                    <div className="row2" style={{ marginTop: 10 }}>
                        <div>
                            <div className="label">De</div>
                            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                        <div>
                            <div className="label">Ate</div>
                            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                    </div>

                    <div className="row2" style={{ marginTop: 10 }}>
                        <div>
                            <div className="label">Status</div>
                            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                                <option value="ALL">Todos</option>
                                <option value="OPEN">Abertos</option>
                                <option value="NEW">Novo</option>
                                <option value="ASSIGNED">Atribuido</option>
                                <option value="PLANNED">Planejado</option>
                                <option value="PENDING">Pendente</option>
                                <option value="SOLVED">Resolvido</option>
                                <option value="CLOSED">Fechado</option>
                            </select>
                        </div>

                        <div>
                            <div className="label">Busca</div>
                            <input
                                className="input"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="id, titulo, grupo, tecnico..."
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn primary" onClick={refresh} disabled={loading}>
                            Aplicar
                        </button>
                        <button
                            className="btn ghost"
                            onClick={() => {
                                setFrom(addDays(isoDate(), -30));
                                setTo(isoDate());
                                setStatus("ALL");
                                setSearch("");
                            }}
                            disabled={loading}
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
                <div className="cardTitle">Analise profissional de incidentes</div>
                <div className="muted small" style={{ marginBottom: 12 }}>
                    Classificacao deterministica usando titulo e descricao para apontar temas, sintomas e acoes.
                </div>

                <div className="grid4" style={{ marginBottom: 14 }}>
                    {(pareto?.insights?.length ? pareto.insights : ["Sincronize o GLPI para gerar uma leitura operacional."]).slice(0, 4).map((text, idx) => (
                        <div className="card" key={`incident-insight-${idx}`} style={{ padding: 12 }}>
                            <div className="muted small">Insight {idx + 1}</div>
                            <div className="strong" style={{ marginTop: 6 }}>{text}</div>
                        </div>
                    ))}
                </div>

                <div className="grid2">
                    <ParetoColumn title="Temas recorrentes" rows={pareto?.pareto.theme ?? []} />
                    <ParetoColumn title="Sintomas recorrentes" rows={pareto?.pareto.symptom ?? []} />
                    <ParetoColumn title="Objetos afetados" rows={pareto?.pareto.object ?? []} />
                    <ParetoColumn title="Solicitantes" rows={pareto?.pareto.requester ?? []} />
                </div>

                <div className="card" style={{ marginTop: 14, padding: 12 }}>
                    <div className="cardTitle">Sugestoes de acao</div>
                    {pareto?.recommendations?.length ? (
                        <div className="tableWrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Tema</th>
                                        <th>Volume</th>
                                        <th>Acao sugerida</th>
                                        <th>Exemplos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pareto.recommendations.map((r) => (
                                        <tr key={r.theme}>
                                            <td className="strong">{r.theme}</td>
                                            <td className="mono">{r.count} ({r.pct}%)</td>
                                            <td>{r.suggestedAction}</td>
                                            <td className="mono">{r.sampleIds.join(", ")}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="muted small">Sem recomendacoes para os filtros atuais.</div>
                    )}
                </div>

                <div className="grid2" style={{ marginTop: 14 }}>
                    <ParetoColumn title="Status" rows={pareto?.pareto.status ?? []} />
                    <ParetoColumn title="Prioridade" rows={pareto?.pareto.priority ?? []} />
                </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
                <div className="cardTitle">Fila de Chamados</div>

                <div className="tableWrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: 90 }}>ID</th>
                                <th style={{ width: 120 }}>Status</th>
                                <th style={{ width: 130 }}>Tipo</th>
                                <th style={{ width: 130 }}>Prioridade</th>
                                <th>Titulo</th>
                                <th style={{ width: 210 }}>Grupo tecnico</th>
                                <th style={{ width: 180 }}>Tecnico</th>
                                <th style={{ width: 160 }}>Abertura</th>
                                <th style={{ width: 170 }}>Ultima atualizacao</th>
                            </tr>
                        </thead>

                        <tbody>
                            {rows.map((r) => {
                                const sb = statusBadge(r.status);
                                return (
                                    <tr
                                        key={String(r.id)}
                                        style={{ cursor: "pointer" }}
                                        onClick={() => setSelected(r)}
                                        title="Clique para ver detalhes"
                                    >
                                        <td className="mono">{r.id}</td>
                                        <td><Badge label={sb.label} color={sb.color} /></td>
                                        <td>{typeBadge(r.type)}</td>
                                        <td>{priorityBadge(r.priority)}</td>
                                        <td style={{ maxWidth: 560 }}>
                                            <div className="strong">{clip(r.title, 120)}</div>
                                            <div className="muted small" style={{ marginTop: 6 }}>
                                                {r.descriptionText?.trim() ? clip(r.descriptionText, 140) : "-"}
                                            </div>
                                        </td>
                                        <td className="mono">{r.groupTech ?? "-"}</td>
                                        <td className="mono">{r.techAssignee ?? "-"}</td>
                                        <td className="mono">{fmtDateTime(r.openedAt)}</td>
                                        <td className="mono">{fmtDateTime(r.updatedAt)}</td>
                                    </tr>
                                );
                            })}

                            {!rows.length && (
                                <tr>
                                    <td colSpan={9} className="muted small" style={{ padding: 14 }}>
                                        {loading ? "Carregando..." : "Nenhum incidente encontrado para os filtros atuais."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="muted small" style={{ marginTop: 10 }}>
                    Clique em um chamado para ver os campos principais e a descricao completa.
                </div>
            </div>

            <Drawer open={!!selected} onClose={() => setSelected(null)} row={selected} />
        </div>
    );
}

function Kpi({ label, value }: { label: string; value: number }) {
    return (
        <div style={{ padding: 12, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, background: "rgba(255,255,255,.03)" }}>
            <div className="muted small">{label}</div>
            <div className="kpi" style={{ marginTop: 6 }}>{value}</div>
        </div>
    );
}

function ParetoColumn({ title, rows }: { title: string; rows: ParetoRow[] }) {
    return (
        <div className="card" style={{ padding: 12 }}>
            <div className="cardTitle">{title}</div>
            {!rows.length ? (
                <div className="muted small">Sem dados para os filtros atuais.</div>
            ) : (
                <div style={{ display: "grid", gap: 10 }}>
                    {rows.slice(0, 6).map((row) => (
                        <div key={`${title}-${row.label}`}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                <div className="strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</div>
                                <div className="mono small">{row.count} | {row.pct}%</div>
                            </div>
                            <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden", marginTop: 6 }}>
                                <div style={{ width: `${Math.max(3, row.cumulativePct)}%`, height: "100%", background: "linear-gradient(90deg, #6EE7C4, #8DB7FF)" }} />
                            </div>
                            <div className="muted small" style={{ marginTop: 4 }}>
                                Acumulado {row.cumulativePct}% / Ex.: {row.sampleIds.join(", ")}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
