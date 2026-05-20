import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { AlertTriangle, CheckCircle2, ClipboardList, Download, Sparkles, Star, TrendingDown, TrendingUp } from "lucide-react";

import PageOverlayLoading from "../components/PageOverlayLoading";
import MonthPicker from "./_shared/MonthPicker";
import StatusPill from "../components/StatusPill";
import { formatPct } from "../lib/utils";
import { apiGet } from "../lib/api";
import type { FavoriteCatalogResponse, TeamSummary, UserHistoryResponse, UserItemsResponse } from "../types";

type ReviewAction = {
    severity: "bad" | "warn" | "ok";
    title: string;
    detail: string;
    action: string;
    workItemUrl?: string | null;
};

function issueLabel(reason: string) {
    const labels: Record<string, string> = {
        SEM_DATA_EXECUCAO: "Sem data de execucao",
        SEM_CODIGO: "Sem atividade UST",
        CODIGO_FORA_CATALOGO: "Codigo fora do catalogo",
        COMPLEXIDADE_DIVERGENTE: "Complexidade divergente",
    };
    return labels[reason] ?? reason;
}

function normalizeTitle(title: string) {
    return String(title ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\b(de|da|do|das|dos|e|em|para|por|com|no|na|nos|nas|o|a|os|as)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isGenericTitle(title: string) {
    const t = normalizeTitle(title);
    if (t.length < 14) return true;
    return /^(ajuste|correcao|reuniao|alinhamento|atividade|demanda|tarefa|suporte|analise)( \d+)?$/.test(t);
}

function buildProfileRows(items: UserItemsResponse["items"], selector: (item: UserItemsResponse["items"][number]) => string | null | undefined) {
    const map = new Map<string, { label: string; totalUst: number; count: number }>();
    for (const item of items) {
        const label = String(selector(item) || "Nao classificado").trim() || "Nao classificado";
        const current = map.get(label) ?? { label, totalUst: 0, count: 0 };
        current.totalUst += Number(item.ust ?? 0);
        current.count += 1;
        map.set(label, current);
    }
    const total = Array.from(map.values()).reduce((sum, row) => sum + row.totalUst, 0);
    return Array.from(map.values())
        .map((row) => ({
            ...row,
            totalUst: Number(row.totalUst.toFixed(2)),
            pct: total > 0 ? Number(((row.totalUst / total) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.totalUst - a.totalUst || a.label.localeCompare(b.label));
}

export default function MePage({ session }: { session: any }) {
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [historyWindow, setHistoryWindow] = useState(3);
    const [summary, setSummary] = useState<TeamSummary | null>(null);
    const [items, setItems] = useState<UserItemsResponse | null>(null);
    const [history, setHistory] = useState<UserHistoryResponse | null>(null);
    const [favorites, setFavorites] = useState<FavoriteCatalogResponse | null>(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingLabel, setLoadingLabel] = useState("Carregando seu painel...");

    const myRow = useMemo(() => {
        if (!summary) return null;
        return summary.rows.find((r) => r.uniqueName === session.uniqueName) ?? null;
    }, [summary, session.uniqueName]);

    async function refresh() {
        setLoading(true);
        setLoadingLabel(`Consultando painel de ${month}...`);
        setErr("");
        try {
            const s = await apiGet<TeamSummary>(`/api/ust/summary?month=${month}`, session);
            setSummary(s);

            setLoadingLabel(`Consultando auditoria de ${month}...`);
            const d = await apiGet<UserItemsResponse>(
                `/api/ust/user/${encodeURIComponent(session.uniqueName)}/items?month=${month}`,
                session
            );
            setItems(d);

            const historyMonths = Array.from({ length: historyWindow }, (_, i) => i)
                .map((i) => {
                    const [year, monthNumber] = month.split("-").map(Number);
                    const date = new Date(Date.UTC(year, monthNumber - 1 - (historyWindow - 1 - i), 1));
                    return date.toISOString().slice(0, 7);
                });
            setLoadingLabel(`Consultando historico: ${historyMonths.join(", ")}...`);
            const h = await apiGet<UserHistoryResponse>(
                `/api/ust/user/${encodeURIComponent(session.uniqueName)}/history?months=${historyWindow}&endMonth=${month}`,
                session
            );
            setHistory(h);

            setLoadingLabel("Consultando favoritos do catalogo...");
            const f = await apiGet<FavoriteCatalogResponse>("/api/favorites", session);
            setFavorites(f);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
            setLoadingLabel("Carregando seu painel...");
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [month, historyWindow, session.uniqueName, session.role]);

    const lineData = useMemo(() => {
        if (!items?.byDay) return [];
        const days = Object.keys(items.byDay).sort();
        let acc = 0;
        return days.map((d) => {
            acc += items.byDay[d];
            return { day: d.slice(8, 10), acumulado: Number(acc.toFixed(2)) };
        });
    }, [items]);

    const historyChart = useMemo(() => {
        return (history?.rows ?? []).map((r) => ({
            month: r.month.slice(5, 7) + "/" + r.month.slice(2, 4),
            Meta: r.goal,
            Realizado: r.totalUst,
        }));
    }, [history]);

    const historyTrend = useMemo(() => {
        const rows = history?.rows ?? [];
        if (rows.length < 2) return null;
        const current = rows[rows.length - 1];
        const previous = rows[rows.length - 2];
        const delta = Number((current.totalUst - previous.totalUst).toFixed(2));
        const pctDelta = previous.totalUst > 0 ? Number(((delta / previous.totalUst) * 100).toFixed(1)) : null;
        return { current, previous, delta, pctDelta };
    }, [history]);

    function exportHistoryCsv() {
        const rows = history?.rows ?? [];
        if (rows.length === 0) return;

        const escapeCsv = (value: any) => {
            const text = String(value ?? "");
            return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const header = ["Mes", "Meta", "Realizado", "Percentual", "Status", "Forecast", "Ritmo", "Tasks", "Inconsistencias"];
        const lines = rows.map((r) => [
            r.month,
            r.goal,
            r.totalUst,
            r.pct,
            r.status,
            r.forecast,
            r.pace,
            r.count,
            r.unmappedCount,
        ].map(escapeCsv).join(";"));

        const csv = [header.join(";"), ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `historico-ust-${session.uniqueName}-${month}-${historyWindow}m.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    const inconsistencySummary = useMemo(() => {
        const counts = new Map<string, number>();
        for (const item of items?.unmapped ?? []) {
            const reason = String(item.reason ?? "OUTRO");
            counts.set(reason, (counts.get(reason) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([reason, count]) => ({ reason, count }));
    }, [items]);

    const monthReview = useMemo(() => {
        const actions: ReviewAction[] = [];
        const mapped = items?.items ?? [];
        const unmapped = items?.unmapped ?? [];
        const allTasks = [
            ...mapped.map((x) => ({ id: x.id, title: x.title, workItemUrl: x.workItemUrl })),
            ...unmapped.map((x: any) => ({ id: x.id, title: x.title, workItemUrl: x.workItemUrl })),
        ];

        for (const u of unmapped.slice(0, 6)) {
            const suggestions = Array.isArray(u.suggestions) ? u.suggestions.slice(0, 3) : [];
            const suggestionText = suggestions.length
                ? ` Sugestoes: ${suggestions.map((s: any) => `${s.codigo} - ${s.atividade || s.subgrupo} (${s.complexidade}, ${s.ust} UST)`).join("; ")}.`
                : "";
            actions.push({
                severity: u.reason === "COMPLEXIDADE_DIVERGENTE" ? "warn" : "bad",
                title: `${issueLabel(String(u.reason ?? "OUTRO"))} #${u.id ?? ""}`.trim(),
                detail: `${String(u.title ?? "Task sem titulo")}${suggestionText}`,
                action: String(u.action ?? "Conferir campos UST no TFS."),
                workItemUrl: u.workItemUrl,
            });
        }

        if (myRow?.goal === 0) {
            actions.push({
                severity: "warn",
                title: "Meta mensal nao configurada",
                detail: "Sem meta, o painel nao consegue calcular ritmo, gap e risco do mes.",
                action: "Solicite ao admin o cadastro da meta mensal.",
            });
        } else if (myRow?.status === "OFF_TRACK" || myRow?.status === "AT_RISK") {
            actions.push({
                severity: myRow.status === "OFF_TRACK" ? "bad" : "warn",
                title: myRow.status === "OFF_TRACK" ? "Risco alto de fechar abaixo da meta" : "Ritmo abaixo do ideal",
                detail: `Forecast ${myRow.forecast} para meta ${myRow.goal}. Gap atual: ${myRow.gap}.`,
                action: `Priorize lancamentos pendentes e mantenha cerca de ${myRow.neededPerDay} UST por dia util restante.`,
            });
        }

        if ((items?.count ?? 0) === 0 && (items?.unmappedCount ?? 0) === 0) {
            actions.push({
                severity: "warn",
                title: "Nenhuma task localizada no mes",
                detail: "Nao ha atividades contabilizadas nem inconsistencias para o periodo selecionado.",
                action: "Confira se as tasks estao em Done, atribuidas ao seu usuario e com Data Execucao no mes.",
            });
        }

        const duplicates = new Map<string, Array<{ id: number; title: string; workItemUrl?: string | null }>>();
        for (const task of allTasks) {
            const key = normalizeTitle(task.title);
            if (!key || key.length < 10) continue;
            const bucket = duplicates.get(key) ?? [];
            bucket.push(task);
            duplicates.set(key, bucket);
        }
        const duplicated = Array.from(duplicates.values()).find((group) => group.length > 1);
        if (duplicated) {
            actions.push({
                severity: "warn",
                title: "Possiveis titulos duplicados",
                detail: duplicated.map((x) => `#${x.id}`).join(", ") + " usam titulo muito parecido.",
                action: "Confirme se sao demandas distintas ou detalhe melhor os titulos antes do fechamento.",
                workItemUrl: duplicated[0]?.workItemUrl,
            });
        }

        const generic = allTasks.find((task) => isGenericTitle(task.title));
        if (generic) {
            actions.push({
                severity: "warn",
                title: "Titulo pouco descritivo",
                detail: `#${generic.id}: ${generic.title || "sem titulo"}`,
                action: "Inclua sistema, objeto e resultado esperado no titulo da task.",
                workItemUrl: generic.workItemUrl,
            });
        }

        if (actions.length === 0) {
            actions.push({
                severity: "ok",
                title: "Mes pronto para fechamento",
                detail: "Nao encontrei pendencias deterministicas nas suas tasks do periodo.",
                action: "Mantenha a revisao antes de novos lancamentos.",
            });
        }

        const bad = actions.filter((a) => a.severity === "bad").length;
        const warn = actions.filter((a) => a.severity === "warn").length;
        const score = Math.max(0, Math.min(100, 100 - bad * 18 - warn * 8));
        const status = score >= 85 ? "ok" : score >= 65 ? "warn" : "bad";
        const checklist = [
            { label: "Sem inconsistencias de UST", ok: (items?.unmappedCount ?? 0) === 0 },
            { label: "Meta mensal configurada", ok: (myRow?.goal ?? 0) > 0 },
            { label: "Forecast cobre a meta", ok: myRow?.status === "ON_TRACK" || myRow?.status === "NO_GOAL" },
            { label: "Ha tasks no periodo", ok: ((items?.count ?? 0) + (items?.unmappedCount ?? 0)) > 0 },
            { label: "Titulos sem alerta simples", ok: !allTasks.some((task) => isGenericTitle(task.title)) },
        ];

        return { actions: actions.slice(0, 8), score, status, checklist };
    }, [items, myRow]);

    const workProfile = useMemo(() => {
        const rows = items?.items ?? [];
        const byType = buildProfileRows(rows, (item) => item.catalog?.tipo);
        const byGroup = buildProfileRows(rows, (item) => item.catalog?.grupo);
        const byComplexity = buildProfileRows(rows, (item) => item.catalog?.complexidade ?? item.expectedComplexidade);
        const dominantType = byType[0] ?? null;
        const dominantGroup = byGroup[0] ?? null;
        const dominantComplexity = byComplexity[0] ?? null;
        const reading = rows.length === 0
            ? "Ainda nao ha atividades contabilizadas para montar o perfil do mes."
            : `Maior concentracao em ${dominantType?.label ?? "Nao classificado"} (${dominantType?.pct ?? 0}%)` +
            `${dominantGroup ? `, principalmente em ${dominantGroup.label}` : ""}` +
            `${dominantComplexity ? `, com complexidade predominante ${dominantComplexity.label}.` : "."}`;

        return { byType, byGroup, byComplexity, reading };
    }, [items]);

    return (
        <div>
            <PageOverlayLoading show={loading} label={loadingLabel} />

            <div className="pageHeader">
                <div>
                    <div className="h1">Meu painel</div>
                    <div className="muted">Resumo pessoal + auditoria</div>
                </div>
                <div className="pageHeaderRight">
                    <MonthPicker month={month} setMonth={setMonth} />
                    <div>
                        <div className="label">Historico</div>
                        <select className="input" value={historyWindow} onChange={(e) => setHistoryWindow(Number(e.target.value))}>
                            <option value={3}>3 meses</option>
                            <option value={6}>6 meses</option>
                            <option value={12}>12 meses</option>
                        </select>
                    </div>
                    <button className="btn ghost" onClick={refresh} disabled={loading}>
                        Atualizar
                    </button>
                </div>
            </div>

            {err && <div className="alert">{err}</div>}

            {!myRow ? (
                <div className="muted">{loading ? "Carregando..." : "Sem dados"}</div>
            ) : (
                <>
                    <div className="grid4">
                        <div className="card">
                            <div className="muted small">Realizado</div>
                            <div className="kpi">{myRow.totalUst}</div>
                            <div style={{ marginTop: 8 }}>
                                <StatusPill status={myRow.status} />
                            </div>
                        </div>
                        <div className="card">
                            <div className="muted small">Meta</div>
                            <div className="kpi">{myRow.goal}</div>
                            <div className="muted small">%: {formatPct(myRow.pct)}</div>
                        </div>
                        <div className="card">
                            <div className="muted small">Ritmo</div>
                            <div className="kpi">{myRow.pace}</div>
                            <div className="muted small">Nec./dia: {myRow.neededPerDay}</div>
                        </div>
                        <div className="card">
                            <div className="muted small">Forecast</div>
                            <div className="kpi">{myRow.forecast}</div>
                            <div className="muted small">Gap: {myRow.gap}</div>
                        </div>
                    </div>

                    <div className="card" style={{ marginTop: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                            <div>
                                <div className="cardTitle" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                    <Sparkles size={16} />
                                    <span>Revisar meu mes</span>
                                </div>
                                <div className="muted small">Checklist deterministico para corrigir lancamentos antes do fechamento.</div>
                            </div>
                            <span className={`pill ${monthReview.status}`}>Nota {monthReview.score}/100</span>
                        </div>

                        <div className="grid2">
                            <div>
                                <div className="muted small" style={{ marginBottom: 8 }}>Checklist</div>
                                <div style={{ display: "grid", gap: 8 }}>
                                    {monthReview.checklist.map((item) => (
                                        <div key={item.label} className="check">
                                            <CheckCircle2 size={16} style={{ color: item.ok ? "#6EE7C4" : "#FDB022" }} />
                                            <span>{item.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="muted small" style={{ marginBottom: 8 }}>Acoes sugeridas</div>
                                <div style={{ display: "grid", gap: 10 }}>
                                    {monthReview.actions.map((action, idx) => (
                                        <div
                                            key={`${action.title}-${idx}`}
                                            style={{
                                                border: "1px solid rgba(255,255,255,.10)",
                                                borderRadius: 8,
                                                padding: 12,
                                                background: "rgba(255,255,255,.025)",
                                            }}
                                        >
                                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                                {action.severity === "ok" ? (
                                                    <CheckCircle2 size={16} style={{ color: "#6EE7C4" }} />
                                                ) : action.severity === "bad" ? (
                                                    <AlertTriangle size={16} style={{ color: "#F97066" }} />
                                                ) : (
                                                    <ClipboardList size={16} style={{ color: "#FDB022" }} />
                                                )}
                                                <strong>{action.title}</strong>
                                            </div>
                                            <div className="muted small">{action.detail}</div>
                                            <div className="small" style={{ marginTop: 8 }}>{action.action}</div>
                                            {action.workItemUrl && (
                                                <a className="link small" href={action.workItemUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8 }}>
                                                    Abrir no TFS
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ marginTop: 14 }}>
                        <div className="cardTitle" style={{ marginBottom: 4 }}>Mapa de perfil de trabalho</div>
                        <div className="muted small" style={{ marginBottom: 12 }}>{workProfile.reading}</div>
                        <div className="grid3">
                            <ProfileColumn title="Por tipo" rows={workProfile.byType} />
                            <ProfileColumn title="Por grupo" rows={workProfile.byGroup} />
                            <ProfileColumn title="Por complexidade" rows={workProfile.byComplexity} />
                        </div>
                    </div>

                    <div className="grid2" style={{ marginTop: 14 }}>
                        <div className="card">
                            <div className="cardTitle">Acumulado diario</div>
                            <div style={{ height: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={lineData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.10)" />
                                        <XAxis dataKey="day" tick={{ fill: "#A8B0BE" }} axisLine={{ stroke: "rgba(255,255,255,.16)" }} />
                                        <YAxis tick={{ fill: "#A8B0BE" }} axisLine={{ stroke: "rgba(255,255,255,.16)" }} />
                                        <Tooltip
                                            cursor={false}
                                            contentStyle={{ background: "#11161C", border: "1px solid rgba(255,255,255,.12)", color: "#F2F4F7" }}
                                            labelStyle={{ color: "#F2F4F7" }}
                                        />
                                        <Legend wrapperStyle={{ color: "#A8B0BE" }} />
                                        <Line type="monotone" dataKey="acumulado" dot={false} stroke="#6EE7C4" strokeWidth={2.5} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="card">
                            <div className="cardTitle">Qualidade</div>
                            <div className="muted small">
                                Unmapped (divergencia/codigo/data) nao entra na soma. Isso evidencia inconsistencias do TFS/catalogo.
                            </div>
                            <div style={{ marginTop: 12 }} className="grid2">
                                <div className="card" style={{ padding: 12 }}>
                                    <div className="muted small">Contabilizadas</div>
                                    <div className="kpi">{items?.count ?? 0}</div>
                                </div>
                                <div className="card" style={{ padding: 12 }}>
                                    <div className="muted small">Unmapped</div>
                                    <div className="kpi">{items?.unmappedCount ?? 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ marginTop: 14 }}>
                        <div className="cardTitle">Meus favoritos do catalogo</div>
                        {(favorites?.rows?.length ?? 0) === 0 ? (
                            <div className="muted small">
                                Marque itens com estrela no Catalogo para criar uma lista rapida de atividades UST usadas com frequencia.
                            </div>
                        ) : (
                            <div className="tableWrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Codigo</th>
                                            <th>Grupo</th>
                                            <th>Atividade</th>
                                            <th>Tipo</th>
                                            <th>Complexidade</th>
                                            <th>UST</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {favorites?.rows.map((r) => (
                                            <tr key={`${r.codigo}-${r.complexidade}`}>
                                                <td className="mono">
                                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                                        <Star size={14} fill="currentColor" style={{ color: "#FEDF89" }} />
                                                        {r.codigo}
                                                    </span>
                                                </td>
                                                <td>{r.grupo}</td>
                                                <td style={{ maxWidth: 560 }}>{r.atividade || r.subgrupo}</td>
                                                <td>{r.tipo}</td>
                                                <td>{r.complexidade}</td>
                                                <td>{r.ust}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {history && (
                        <div className="card" style={{ marginTop: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                                <div>
                                    <div className="cardTitle" style={{ marginBottom: 4 }}>Historico dos ultimos {historyWindow} meses</div>
                                    <div className="muted small">Meta, realizado, tendencia e inconsistencias do periodo selecionado.</div>
                                </div>
                                <button className="btn ghost" onClick={exportHistoryCsv} disabled={(history?.rows?.length ?? 0) === 0}>
                                    <Download size={16} />
                                    <span>Exportar CSV</span>
                                </button>
                            </div>
                            <div className="grid4">
                                {historyTrend && (
                                    <div className="card" style={{ padding: 12 }}>
                                        <div className="muted small">Tendencia</div>
                                        <div className="kpi" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {historyTrend.delta >= 0 ? (
                                                <TrendingUp size={24} style={{ color: "#6EE7C4" }} />
                                            ) : (
                                                <TrendingDown size={24} style={{ color: "#F97066" }} />
                                            )}
                                            {historyTrend.delta >= 0 ? "+" : ""}{historyTrend.delta}
                                        </div>
                                        <div className="muted small">
                                            vs. {historyTrend.previous.month}
                                            {historyTrend.pctDelta !== null ? ` / ${historyTrend.pctDelta >= 0 ? "+" : ""}${historyTrend.pctDelta}%` : ""}
                                        </div>
                                    </div>
                                )}
                                {history.rows.map((r) => (
                                    <div className="card" key={r.month} style={{ padding: 12 }}>
                                        <div className="muted small">{r.month}</div>
                                        <div className="kpi">{r.totalUst}</div>
                                        <div className="muted small">Meta: {r.goal} / {formatPct(r.pct)}</div>
                                        <div style={{ marginTop: 8 }}>
                                            <StatusPill status={r.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ height: 320, marginTop: 14 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={historyChart}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.10)" />
                                        <XAxis dataKey="month" tick={{ fill: "#A8B0BE" }} axisLine={{ stroke: "rgba(255,255,255,.16)" }} />
                                        <YAxis tick={{ fill: "#A8B0BE" }} axisLine={{ stroke: "rgba(255,255,255,.16)" }} />
                                        <Tooltip cursor={false} contentStyle={{ background: "#11161C", border: "1px solid rgba(255,255,255,.12)", color: "#F2F4F7" }} labelStyle={{ color: "#F2F4F7" }} />
                                        <Legend wrapperStyle={{ color: "#A8B0BE" }} />
                                        <Bar dataKey="Meta" fill="#8DB7FF" radius={[6, 6, 0, 0]} />
                                        <Bar dataKey="Realizado" fill="#6EE7C4" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="tableWrap" style={{ marginTop: 14 }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Mes</th>
                                            <th>Meta</th>
                                            <th>Realizado</th>
                                            <th>%</th>
                                            <th>Forecast</th>
                                            <th>Ritmo</th>
                                            <th>Tasks</th>
                                            <th>Inconsistencias</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.rows.map((r) => (
                                            <tr key={`history-${r.month}`}>
                                                <td className="mono">{r.month}</td>
                                                <td>{r.goal}</td>
                                                <td>{r.totalUst}</td>
                                                <td>{formatPct(r.pct)}</td>
                                                <td>{r.forecast}</td>
                                                <td>{r.pace}</td>
                                                <td>{r.count}</td>
                                                <td>{r.unmappedCount}</td>
                                                <td><StatusPill status={r.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="card" style={{ marginTop: 14 }}>
                        <div className="cardTitle">Minhas inconsistencias</div>
                        <div className="muted small" style={{ marginBottom: 12 }}>
                            Tasks do TFS que nao entraram na soma de UST por falta de data, codigo, catalogo ou divergencia de complexidade.
                        </div>
                        {(items?.unmappedCount ?? 0) === 0 ? (
                            <div className="muted small">Nenhuma inconsistencia encontrada para o mes selecionado.</div>
                        ) : (
                            <>
                                <div className="grid4">
                                    {inconsistencySummary.map((x) => (
                                        <div className="card" key={x.reason} style={{ padding: 12 }}>
                                            <div className="muted small">{x.reason}</div>
                                            <div className="kpi">{x.count}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="tableWrap" style={{ marginTop: 14 }}>
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Motivo</th>
                                                <th>Data</th>
                                                <th>Codigo</th>
                                                <th>Complexidade</th>
                                                <th>Titulo</th>
                                                <th>Sugestoes</th>
                                                <th>Acao</th>
                                                <th>Link</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(items?.unmapped ?? []).map((u: any) => (
                                                <tr key={`${u.id}-${u.reason}`}>
                                                    <td className="mono">{u.id}</td>
                                                    <td className="mono">{u.reason}</td>
                                                    <td className="mono">{u.exec ?? "-"}</td>
                                                    <td className="mono">{u.code ?? "-"}</td>
                                                    <td className="mono">
                                                        {u.gotComplexidade ?? "-"}
                                                        {u.expectedComplexidade ? ` / esperado: ${u.expectedComplexidade}` : ""}
                                                    </td>
                                                    <td style={{ maxWidth: 460 }}>{u.title}</td>
                                                    <td style={{ maxWidth: 420 }}>
                                                        {Array.isArray(u.suggestions) && u.suggestions.length ? (
                                                            <div style={{ display: "grid", gap: 6 }}>
                                                                {u.suggestions.slice(0, 3).map((s: any) => (
                                                                    <div key={`${u.id}-${s.codigo}-${s.complexidade}`}>
                                                                        <span className="mono">{s.codigo}</span>{" "}
                                                                        {s.atividade || s.subgrupo}
                                                                        <div className="muted small">
                                                                            {s.complexidade} / {s.ust} UST / score {s.score}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="muted small">-</span>
                                                        )}
                                                    </td>
                                                    <td>{u.action ?? "Conferir campos UST no TFS."}</td>
                                                    <td>
                                                        {u.workItemUrl ? (
                                                            <a className="link" href={u.workItemUrl} target="_blank" rel="noreferrer">
                                                                Abrir
                                                            </a>
                                                        ) : (
                                                            <span className="muted small">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function ProfileColumn({
    title,
    rows,
}: {
    title: string;
    rows: Array<{ label: string; totalUst: number; count: number; pct: number }>;
}) {
    return (
        <div>
            <div className="muted small" style={{ marginBottom: 8 }}>{title}</div>
            {rows.length === 0 ? (
                <div className="muted small">Sem dados contabilizados.</div>
            ) : (
                <div style={{ display: "grid", gap: 10 }}>
                    {rows.slice(0, 5).map((row) => (
                        <div key={`${title}-${row.label}`}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</div>
                                <div className="mono small">{row.pct}%</div>
                            </div>
                            <div
                                aria-hidden="true"
                                style={{
                                    height: 8,
                                    borderRadius: 999,
                                    background: "rgba(255,255,255,.08)",
                                    overflow: "hidden",
                                    marginTop: 6,
                                }}
                            >
                                <div
                                    style={{
                                        width: `${Math.max(3, row.pct)}%`,
                                        height: "100%",
                                        borderRadius: 999,
                                        background: "linear-gradient(90deg, #6EE7C4, #8DB7FF)",
                                    }}
                                />
                            </div>
                            <div className="muted small" style={{ marginTop: 4 }}>
                                {row.totalUst} UST em {row.count} task{row.count === 1 ? "" : "s"}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

