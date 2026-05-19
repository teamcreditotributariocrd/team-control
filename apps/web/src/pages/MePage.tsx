import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { Download, Star, TrendingDown, TrendingUp } from "lucide-react";

import PageOverlayLoading from "../components/PageOverlayLoading";
import MonthPicker from "./_shared/MonthPicker";
import StatusPill from "../components/StatusPill";
import { formatPct } from "../lib/utils";
import { apiGet } from "../lib/api";
import type { FavoriteCatalogResponse, TeamSummary, UserHistoryResponse, UserItemsResponse } from "../types";

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

