import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line } from "recharts";

import PageOverlayLoading from "../components/PageOverlayLoading";
import MonthPicker from "./_shared/MonthPicker"; // vou falar ja
import StatusPill from "../components/StatusPill";
import { formatPct } from "../lib/utils";
import { apiGet } from "../lib/api";
import type { TeamHistoryResponse, TeamSummary } from "../types";

export default function DashboardAdmin({ session }: { session: any }) {
    const nav = useNavigate();
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [data, setData] = useState<TeamSummary | null>(null);
    const [history, setHistory] = useState<TeamHistoryResponse | null>(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    async function refresh() {
        setLoading(true);
        setErr("");
        try {
            const d = await apiGet<TeamSummary>(`/api/ust/summary?month=${month}`, session);
            setData(d);
            const h = await apiGet<TeamHistoryResponse>(`/api/ust/team/history?months=3&endMonth=${month}`, session);
            setHistory(h);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [month, session.uniqueName, session.role]);

    const bars = useMemo(() => {
        if (!data) return [];
        return data.rows.map((r) => ({
            name: r.displayName.split(" ")[0],
            Meta: r.goal,
            Realizado: r.totalUst,
        }));
    }, [data]);

    const teamHistoryBars = useMemo(() => {
        return (history?.rows ?? []).map((r) => ({
            month: r.month.slice(5, 7) + "/" + r.month.slice(2, 4),
            Meta: r.goal,
            Realizado: r.totalUst,
            Percentual: r.pct,
        }));
    }, [history]);

    return (
        <div>
            <PageOverlayLoading show={loading} label="Atualizando dashboard..." />

            <div className="pageHeader">
                <div>
                    <div className="h1">Dashboard do Time</div>
                    <div className="muted">Clique em um colaborador para drill-down auditavel.</div>
                </div>
                <div className="pageHeaderRight">
                    <MonthPicker month={month} setMonth={setMonth} />
                    <button className="btn ghost" onClick={refresh} disabled={loading}>
                        Atualizar
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
                            <div className="muted small">UST (time)</div>
                            <div className="kpi">{data.team.totalUst}</div>
                            <div className="muted small">Meta: {data.team.goal}</div>
                        </div>
                        <div className="card">
                            <div className="muted small">% Meta (time)</div>
                            <div className="kpi">{formatPct(data.team.pct)}</div>
                            <div className="muted small">
                                Dias uteis: {data.workDaysPassed}/{data.workDaysTotal}
                            </div>
                        </div>
                        <div className="card">
                            <div className="muted small">Ritmo (UST/dia util)</div>
                            <div className="kpi">{data.team.pace}</div>
                            <div className="muted small">Baseado em dias uteis passados</div>
                        </div>
                        <div className="card">
                            <div className="muted small">Projecao (forecast)</div>
                            <div className="kpi">{data.team.forecast}</div>
                            <div className="muted small">Se mantiver o ritmo</div>
                        </div>
                    </div>

                    <div className="grid2" style={{ marginTop: 14 }}>
                        <div className="card">
                            <div className="cardTitle">Realizado vs Meta</div>
                            <div style={{ height: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={bars}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.10)" />
                                        <XAxis dataKey="name" tick={{ fill: "#A8B0BE" }} axisLine={{ stroke: "rgba(255,255,255,.16)" }} />
                                        <YAxis tick={{ fill: "#A8B0BE" }} axisLine={{ stroke: "rgba(255,255,255,.16)" }} />
                                        <Tooltip cursor={false} contentStyle={{ background: "#11161C", border: "1px solid rgba(255,255,255,.12)", color: "#F2F4F7" }} labelStyle={{ color: "#F2F4F7" }} />
                                        <Legend wrapperStyle={{ color: "#A8B0BE" }} />
                                        <Bar dataKey="Meta" fill="#8DB7FF" radius={[6, 6, 0, 0]} />
                                        <Bar dataKey="Realizado" fill="#6EE7C4" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="card">
                            <div className="cardTitle">Ranking (clique para detalhar)</div>
                            <div className="tableWrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Colaborador</th>
                                            <th>Realizado</th>
                                            <th>Meta</th>
                                            <th>%</th>
                                            <th>Gap</th>
                                            <th>Nec./dia</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.rows.map((r) => (
                                            <tr
                                                key={r.uniqueName}
                                                className="rowLink"
                                                onClick={() => nav(`/user/${encodeURIComponent(r.uniqueName)}?month=${month}`)}
                                            >
                                                <td>
                                                    <div className="strong">{r.displayName}</div>
                                                    <div className="muted small mono">{r.uniqueName}</div>
                                                </td>
                                                <td>{r.totalUst}</td>
                                                <td>{r.goal}</td>
                                                <td>{formatPct(r.pct)}</td>
                                                <td>{r.gap}</td>
                                                <td>{r.neededPerDay}</td>
                                                <td>
                                                    <StatusPill status={r.status} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="muted small" style={{ marginTop: 10 }}>
                                Divergencias de complexidade entram como UNMAPPED no drill-down.
                            </div>
                        </div>
                    </div>

                    {history && (
                        <div className="grid2" style={{ marginTop: 14 }}>
                            <div className="card">
                                <div className="cardTitle">Historico do time</div>
                                <div style={{ height: 320 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={teamHistoryBars}>
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
                            </div>

                            <div className="card">
                                <div className="cardTitle">Percentual do time</div>
                                <div style={{ height: 320 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={teamHistoryBars}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.10)" />
                                            <XAxis dataKey="month" tick={{ fill: "#A8B0BE" }} axisLine={{ stroke: "rgba(255,255,255,.16)" }} />
                                            <YAxis tick={{ fill: "#A8B0BE" }} axisLine={{ stroke: "rgba(255,255,255,.16)" }} />
                                            <Tooltip contentStyle={{ background: "#11161C", border: "1px solid rgba(255,255,255,.12)", color: "#F2F4F7" }} labelStyle={{ color: "#F2F4F7" }} />
                                            <Legend wrapperStyle={{ color: "#A8B0BE" }} />
                                            <Line type="monotone" dataKey="Percentual" stroke="#FDB022" strokeWidth={2.5} dot />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="card" style={{ gridColumn: "1 / -1" }}>
                                <div className="cardTitle">Variacao por colaborador</div>
                                <div className="tableWrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Colaborador</th>
                                                <th>Mes atual</th>
                                                <th>Mes anterior</th>
                                                <th>Variacao</th>
                                                <th>Meta</th>
                                                <th>%</th>
                                                <th>Inconsistencias</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.collaborators.map((r) => (
                                                <tr key={r.uniqueName} className="rowLink" onClick={() => nav(`/user/${encodeURIComponent(r.uniqueName)}?month=${month}`)}>
                                                    <td>
                                                        <div className="strong">{r.displayName}</div>
                                                        <div className="muted small mono">{r.uniqueName}</div>
                                                    </td>
                                                    <td>{r.currentUst}</td>
                                                    <td>{r.previousUst}</td>
                                                    <td style={{ color: r.delta >= 0 ? "#6EE7C4" : "#F97066" }}>{r.delta >= 0 ? "+" : ""}{r.delta}</td>
                                                    <td>{r.goal}</td>
                                                    <td>{formatPct(r.pct)}</td>
                                                    <td>{r.unmappedCount}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

