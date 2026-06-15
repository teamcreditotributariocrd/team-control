import React, { useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, CheckCircle2, Database, RefreshCw, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet, type Session } from "../lib/api";
import type { ParcelamentoHealth } from "../types";

export default function ParcelamentoHealthPage({ session }: { session: Session }) {
    const [data, setData] = useState<ParcelamentoHealth | null>(null);
    const [days, setDays] = useState(30);
    const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    async function load() {
        setLoading(true);
        setErr("");
        try {
            setData(await apiGet<ParcelamentoHealth>(`/api/parcelamentos/health?days=${days}&endDate=${endDate}`, session));
        } catch (e: any) {
            setData(null);
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days, endDate]);

    const chartRows = useMemo(() => {
        return [...(data?.daily ?? [])]
            .reverse()
            .map((row) => ({
                Dia: formatDay(row.dia),
                Total: row.total,
                Homologados: row.homologados,
                Pendentes: row.semHomologacao,
            }));
    }, [data]);

    const averageDaily = data?.daily.length ? data.summary.total / data.daily.length : 0;
    const homologationRate = data?.summary.total ? (data.summary.homologados / data.summary.total) * 100 : 0;

    return (
        <div>
            <div className="pageHeader">
                <div>
                    <div className="h1">Saude de Parcelamentos</div>
                    <div className="muted">Entradas de parcelamentos por dia a partir de CREDTRIB.Parcelamento.</div>
                </div>
                <div className="pageHeaderRight">
                    <div>
                        <div className="label">Janela</div>
                        <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                            <option value={7}>7 dias</option>
                            <option value={15}>15 dias</option>
                            <option value={30}>30 dias</option>
                            <option value={60}>60 dias</option>
                            <option value={90}>90 dias</option>
                        </select>
                    </div>
                    <div>
                        <div className="label">Ate</div>
                        <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <button className="btn ghost" onClick={load} disabled={loading}>
                        <RefreshCw size={16} />
                        {loading ? "Lendo..." : "Atualizar"}
                    </button>
                </div>
            </div>

            {err ? (
                <div className="alert">
                    {err}
                    <div className="muted small" style={{ marginTop: 8 }}>
                        Esta consulta exige que a API rode no servidor com uma conta de dominio com acesso read-only ao SQL Server.
                    </div>
                </div>
            ) : null}

            <section className="grid4" style={{ marginBottom: 14 }}>
                <Kpi label="Parcelamentos" value={data?.summary.total ?? 0} icon={<Database size={20} />} />
                <Kpi label="Media diaria" value={formatNumber(averageDaily)} icon={<TrendingUp size={20} />} />
                <Kpi label="Homologados" value={`${formatNumber(homologationRate)}%`} icon={<CheckCircle2 size={20} />} />
                <Kpi label="Debito automatico" value={data?.summary.debitoAutomatico ?? 0} icon={<Activity size={20} />} />
            </section>

            <section className="grid2" style={{ marginBottom: 14 }}>
                <div className="card">
                    <div className="cardTitle">Entradas por dia</div>
                    <div style={{ height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartRows}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" />
                                <XAxis dataKey="Dia" stroke="#98A2B3" fontSize={12} />
                                <YAxis stroke="#98A2B3" fontSize={12} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: "#151A21", border: "1px solid rgba(255,255,255,.12)", color: "#F2F4F7" }} />
                                <Bar dataKey="Total" fill="#7AA7FF" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="Homologados" fill="#4CC9A6" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card">
                    <div className="cardTitle">Resumo da janela</div>
                    <div style={{ display: "grid", gap: 10 }}>
                        <InfoLine label="Periodo" value={data ? `${formatDate(data.from)} ate ${formatDate(data.to)}` : "-"} />
                        <InfoLine label="Sem homologacao" value={data?.summary.semHomologacao ?? 0} />
                        <InfoLine label="Media de parcelas" value={formatNumber(data?.summary.mediaParcelas ?? 0)} />
                        <InfoLine label="Valor tributo UAM" value={formatNumber(data?.summary.valorTributoUam ?? 0)} />
                        <InfoLine label="Ultima protocolizacao" value={data?.summary.ultimaProtocolizacao ? formatDateTime(data.summary.ultimaProtocolizacao) : "-"} />
                    </div>
                </div>
            </section>

            <section className="card">
                <div className="cardTitle">Ultimos parcelamentos protocolizados</div>
                <div className="tableWrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>PPD</th>
                                <th>Protocolizacao</th>
                                <th>Situacao</th>
                                <th>Homologacao</th>
                                <th>Parcelas</th>
                                <th>Local</th>
                                <th>Debito auto.</th>
                                <th>Valor UAM</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data?.latest ?? []).map((row) => (
                                <tr key={row.parcelamentoId}>
                                    <td className="mono">{row.numeroPpd || row.parcelamentoId}</td>
                                    <td>{row.dataProtocolizacao ? formatDateTime(row.dataProtocolizacao) : "-"}</td>
                                    <td>{row.dominioIdSituacao}</td>
                                    <td>{row.dataHomologacao ? formatDateTime(row.dataHomologacao) : <span className="pill warn">Pendente</span>}</td>
                                    <td>{row.quantidadeParcelas}</td>
                                    <td>{row.localPpd ?? "-"}</td>
                                    <td>{row.debitoAutomaticoAutorizado === "S" ? <span className="pill ok">Sim</span> : "Nao"}</td>
                                    <td>{formatNumber(row.valorTributoUam)}</td>
                                </tr>
                            ))}
                            {!data?.latest.length && !loading ? (
                                <tr>
                                    <td colSpan={8}>
                                        <div className="emptyState">Nenhum parcelamento encontrado na janela.</div>
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function Kpi({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
    return (
        <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted small">{label}</span>
                {icon}
            </div>
            <div className="kpi">{value}</div>
        </div>
    );
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            <span className="muted">{label}</span>
            <span className="strong" style={{ textAlign: "right" }}>{value}</span>
        </div>
    );
}

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function formatDay(value: string) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(value: string) {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
