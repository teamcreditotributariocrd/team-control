import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

import PageOverlayLoading from "../components/PageOverlayLoading";
import MonthPicker from "./_shared/MonthPicker";
import StatusPill from "../components/StatusPill";
import { formatPct } from "../lib/utils";
import { apiGet } from "../lib/api";
import type { TeamSummary, UserItemsResponse } from "../types";

export default function UserDrilldownPage({ session }: { session: any }) {
    const nav = useNavigate();
    const params = useParams();
    const uniqueName = decodeURIComponent(String(params.uniqueName ?? ""));
    const [search] = useSearchParams();
    const [month, setMonth] = useState(() => search.get("month") ?? new Date().toISOString().slice(0, 7));

    const [data, setData] = useState<UserItemsResponse | null>(null);
    const [summary, setSummary] = useState<TeamSummary | null>(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const row = useMemo(() => {
        if (!summary) return null;
        return summary.rows.find(r => r.uniqueName === uniqueName) ?? null;
    }, [summary, uniqueName]);

    async function refresh() {
        setLoading(true);
        setErr("");
        try {
            // 1) Auditoria (itens)
            const d = await apiGet<UserItemsResponse>(
                `/api/ust/user/${encodeURIComponent(uniqueName)}/items?month=${month}`,
                session
            );
            setData(d);

            // 2) Meta/% vem do summary
            const s = await apiGet<TeamSummary>(`/api/ust/summary?month=${month}`, session);
            setSummary(s);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uniqueName, month, session.uniqueName, session.role]);

    const byDayRows = useMemo(() => {
        if (!data?.byDay) return [];
        const days = Object.keys(data.byDay).sort();
        let acc = 0;
        return days.map((d) => {
            acc += data.byDay[d];
            return { day: d.slice(8, 10), acumulado: Number(acc.toFixed(2)) };
        });
    }, [data]);

    const pct = row?.pct ?? (row?.goal ? (data?.totalUst ?? 0) / row.goal * 100 : 0);

    return (
        <div>
            <PageOverlayLoading show={loading} label="Carregando auditoria..." />

            <div className="pageHeader">
                <div>
                    <div className="h1">Detalhe do Colaborador</div>
                    <div className="muted">{uniqueName} | Drill-down auditavel</div>
                </div>
                <div className="pageHeaderRight">
                    <MonthPicker month={month} setMonth={setMonth} />
                    <button className="btn ghost" onClick={refresh} disabled={loading}>
                        Atualizar
                    </button>
                    <button className="btn ghost" onClick={() => nav(-1)}>
                        Voltar
                    </button>
                </div>
            </div>

            {err && <div className="alert">{err}</div>}

            {!data ? (
                <div className="muted">{loading ? "Carregando..." : "Sem dados"}</div>
            ) : (
                <>
                    <div className="grid4">
                        <div className="card">
                            <div className="muted small">UST no mes</div>
                            <div className="kpi">{data.totalUst}</div>
                            <div className="muted small">Tasks: {data.count}</div>
                        </div>

                        <div className="card">
                            <div className="muted small">Meta</div>
                            <div className="kpi">{row?.goal ?? "-"}</div>
                            <div className="muted small">Mes: {data.month}</div>
                        </div>

                        <div className="card">
                            <div className="muted small">% Realizado</div>
                            <div className="kpi">{Number.isFinite(pct) ? `${pct.toFixed(1)}%` : "-"}</div>
                            <div className="muted small">{row ? <StatusPill status={row.status} /> : null}</div>
                        </div>

                        <div className="card">
                            <div className="muted small">Unmapped</div>
                            <div className="kpi">{data.unmappedCount}</div>
                            <div className="muted small">Divergencias inclusas</div>
                        </div>
                    </div>

                    <div className="card" style={{ marginTop: 14 }}>
                        <div className="cardTitle">Acumulado diario</div>
                        <div style={{ height: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={byDayRows}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="day" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="acumulado" dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="card" style={{ marginTop: 14 }}>
                        <div className="cardTitle">Tasks (auditavel)</div>
                        <div className="tableWrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Data Exec.</th>
                                        <th>State</th>
                                        <th>Titulo</th>
                                        <th>Codigo</th>
                                        <th>Comp (TFS)</th>
                                        <th>Comp (Cat)</th>
                                        <th>UST</th>
                                        <th>Link</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.items.map((it) => (
                                        <tr key={it.id}>
                                            <td className="mono">{it.id}</td>
                                            <td className="mono">{it.execDate}</td>
                                            <td className="mono">{it.state ?? "-"}</td>
                                            <td style={{ maxWidth: 540 }}>{it.title}</td>
                                            <td className="mono">{it.code}</td>
                                            <td className="mono">{it.complexidade ?? "-"}</td>
                                            <td className="mono">{it.expectedComplexidade}</td>
                                            <td>{it.ust}</td>
                                            <td>
                                                {it.workItemUrl ? (
                                                    <a className="link" href={it.workItemUrl} target="_blank" rel="noreferrer">
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

                        {data.unmappedCount > 0 && (
                            <div style={{ marginTop: 14 }}>
                                <div className="cardTitle">Unmapped (motivos)</div>
                                <div className="tableWrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Motivo</th>
                                                <th>Exec</th>
                                                <th>Code</th>
                                                <th>Comp esperada</th>
                                                <th>Comp informada</th>
                                                <th>Titulo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.unmapped.map((u: any, idx: number) => (
                                                <tr key={idx}>
                                                    <td className="mono">{u.id}</td>
                                                    <td className="mono">{u.reason}</td>
                                                    <td className="mono">{u.exec ?? "-"}</td>
                                                    <td className="mono">{u.code ?? "-"}</td>
                                                    <td className="mono">{u.expectedComplexidade ?? "-"}</td>
                                                    <td className="mono">{u.gotComplexidade ?? "-"}</td>
                                                    <td style={{ maxWidth: 520 }}>{u.title}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
