import React, { useEffect, useMemo, useState } from "react";
import { Activity, BadgeCheck, CircleDollarSign, Database, FileCheck2, Gauge, RefreshCw, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet, type Session } from "../lib/api";
import type { ParcelamentoHealth } from "../types";

const PRIORITY_SITUATION_IDS = [125, 126, 3222, 3237, 3238, 4];
const MAX_MAIN_SITUATIONS = 6;

const tooltipStyle = {
    background: "#151A21",
    border: "1px solid rgba(255,255,255,.12)",
    color: "#F2F4F7",
    borderRadius: 8,
} as const;

export default function ParcelamentoHealthPage({ session }: { session: Session }) {
    const [data, setData] = useState<ParcelamentoHealth | null>(null);
    const [days, setDays] = useState(180);
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

    const situationRows = data?.situations ?? [];
    const total = data?.summary.total ?? 0;
    const autoPct = percentOf(data?.summary.autoParcelamento ?? 0, total);
    const assinaturaPct = percentOf(data?.summary.assinaturaDigital ?? 0, total);
    const activeTotal = situationRows.find((row) => row.situacaoId === 125)?.total ?? 0;
    const latestRows = data?.latest.slice(0, 8) ?? [];

    const dailyChartRows = useMemo(() => {
        return [...(data?.daily ?? [])]
            .reverse()
            .map((row) => ({
                Dia: formatDay(row.dia),
                Total: row.total,
            }));
    }, [data]);

    const mainSituations = useMemo(() => buildMainSituations(situationRows), [situationRows]);
    const secondarySituations = situationRows.filter((row) => !mainSituations.some((item) => item.situacaoId === row.situacaoId));
    const situationChartRows = [...mainSituations, ...secondarySituations].map((row) => ({
        Situacao: displaySituationLabel(row.situacaoId, row.label),
        Total: row.total,
        fill: situationTone(row.situacaoId).solid,
    }));

    return (
        <div>
            <div className="pageHeader">
                <div>
                    <div className="h1">Parcelamentos</div>
                    <div className="muted">Resumo executivo por periodo, situacao e volume financeiro.</div>
                </div>
                <div className="pageHeaderRight">
                    <span className={err ? "pill bad" : "pill ok"}>
                        <Activity size={14} />
                        {err ? "Indisponivel" : "Conectado"}
                    </span>
                    <div>
                        <div className="label">Janela</div>
                        <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                            <option value={7}>7 dias</option>
                            <option value={15}>15 dias</option>
                            <option value={30}>30 dias</option>
                            <option value={60}>60 dias</option>
                            <option value={90}>90 dias</option>
                            <option value={180}>180 dias</option>
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

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 14 }}>
                <KpiCard label="Total no periodo" value={formatNumber(total)} detail={data ? `${formatDate(data.from)} ate ${formatDate(data.to)}` : "-"} icon={<Database size={20} />} accent="#7AA7FF" />
                <KpiCard label="Valor no periodo" value={formatCurrency(data?.summary.valorTributoUam ?? 0)} detail="Valor tributo UAM" icon={<Wallet size={20} />} accent="#4CC9A6" />
                <KpiCard label="Auto parcelamento" value={`${formatNumber(autoPct)}%`} detail={`${formatNumber(data?.summary.autoParcelamento ?? 0)} registros`} icon={<Gauge size={20} />} accent="#FDB022" />
                <KpiCard label="Assinatura digital" value={`${formatNumber(assinaturaPct)}%`} detail={`${formatNumber(data?.summary.assinaturaDigital ?? 0)} registros`} icon={<FileCheck2 size={20} />} accent="#D6BBFB" />
            </section>

            <section className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
                    <div>
                        <div className="cardTitle" style={{ marginBottom: 4 }}>Situacoes principais no periodo</div>
                        <div className="muted small">Cards ordenados pelas situacoes encontradas na janela selecionada.</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span className="pill">
                            <BadgeCheck size={14} />
                            {formatNumber(activeTotal)} em dia
                        </span>
                        <span className="pill">
                            <CircleDollarSign size={14} />
                            Media {formatNumber(data?.summary.mediaParcelas ?? 0)} parcelas
                        </span>
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                    {mainSituations.map((row) => (
                        <SituationCard key={row.situacaoId} row={row} total={total} />
                    ))}
                </div>

                {secondarySituations.length ? (
                    <div style={{ marginTop: 14 }}>
                        <div className="muted small" style={{ marginBottom: 8 }}>Demais situacoes</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                            {secondarySituations.map((row) => (
                                <SecondarySituationCard key={row.situacaoId} row={row} total={total} />
                            ))}
                        </div>
                    </div>
                ) : null}

                {!situationRows.length && !loading ? <div className="emptyState">Nenhuma situacao encontrada na janela.</div> : null}
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 14, marginBottom: 14 }}>
                <div className="card" style={{ minWidth: 0 }}>
                    <ChartHeader title="Quantidade por dia" detail={data?.summary.ultimaProtocolizacao ? `Ultima protocolizacao: ${formatBackendDate(data.summary.ultimaProtocolizacao)}` : "Sem protocolizacao recente"} />
                    <div style={{ height: 340 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dailyChartRows}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" />
                                <XAxis dataKey="Dia" stroke="#98A2B3" fontSize={12} />
                                <YAxis stroke="#98A2B3" fontSize={12} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                                <Bar dataKey="Total" fill="#7AA7FF" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card" style={{ minWidth: 0 }}>
                    <ChartHeader title="Comparativo por situacao" detail={`${situationChartRows.length} situacao(oes) no periodo`} />
                    <div style={{ height: 340 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={situationChartRows} layout="vertical" margin={{ left: 16, right: 12 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" horizontal={false} />
                                <XAxis type="number" stroke="#98A2B3" fontSize={12} allowDecimals={false} />
                                <YAxis type="category" dataKey="Situacao" stroke="#98A2B3" fontSize={12} width={110} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                                <Bar dataKey="Total" radius={[0, 6, 6, 0]}>
                                    {situationChartRows.map((row) => (
                                        <Cell key={row.Situacao} fill={row.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            <section className="card">
                <ChartHeader title="Ultimos parcelamentos" detail={`${latestRows.length} registros recentes exibidos`} />
                <div className="tableWrap">
                    <table className="table" style={{ minWidth: 860 }}>
                        <thead>
                            <tr>
                                <th>PPD</th>
                                <th>Situacao</th>
                                <th>Data</th>
                                <th>SPI</th>
                                <th>Parcelas</th>
                                <th>Local</th>
                                <th>Valor UAM</th>
                            </tr>
                        </thead>
                        <tbody>
                            {latestRows.map((row) => {
                                const tone = situationTone(row.dominioIdSituacao);
                                return (
                                    <tr key={row.parcelamentoId}>
                                        <td className="mono">{row.numeroPpd || "-"}</td>
                                        <td>
                                            <span className="pill small" style={{ color: tone.text, borderColor: tone.border, background: tone.badge }}>
                                                {displaySituationLabel(row.dominioIdSituacao, row.situacaoLabel)}
                                            </span>
                                        </td>
                                        <td className="mono">{row.dataProtocolizacao ? formatDateTime(row.dataProtocolizacao) : "-"}</td>
                                        <td className="mono">{row.numeroSpi ?? "-"}</td>
                                        <td>{formatNumber(row.quantidadeParcelas)}</td>
                                        <td>{row.localPpd ?? "-"}</td>
                                        <td>{formatCurrency(row.valorTributoUam)}</td>
                                    </tr>
                                );
                            })}
                            {!latestRows.length ? (
                                <tr>
                                    <td colSpan={7}>
                                        <div className="emptyState">Nenhum parcelamento recente na janela.</div>
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

function KpiCard({ label, value, detail, icon, accent }: { label: string; value: React.ReactNode; detail: string; icon: React.ReactNode; accent: string }) {
    return (
        <div className="card" style={{ position: "relative", overflow: "hidden", minHeight: 128 }}>
            <div style={{ position: "absolute", inset: "0 auto 0 0", width: 3, background: accent }} />
            <div style={{ position: "absolute", right: -26, top: -26, width: 92, height: 92, borderRadius: 999, background: `${accent}22` }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="muted small">{label}</span>
                <span style={{ color: accent }}>{icon}</span>
            </div>
            <div className="kpi">{value}</div>
            <div className="muted small" style={{ marginTop: 4 }}>{detail}</div>
        </div>
    );
}

function ChartHeader({ title, detail }: { title: string; detail: string }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div className="cardTitle" style={{ marginBottom: 0 }}>{title}</div>
            <div className="muted small">{detail}</div>
        </div>
    );
}

function SituationCard({ row, total }: { row: ParcelamentoHealth["situations"][number]; total: number }) {
    const pct = percentOf(row.total, total);
    const tone = situationTone(row.situacaoId);
    return (
        <div
            style={{
                border: `1px solid ${tone.border}`,
                background: tone.background,
                borderRadius: 8,
                padding: 16,
                minHeight: 138,
                display: "grid",
                gap: 12,
                alignContent: "space-between",
                boxShadow: `0 14px 34px ${tone.shadow}`,
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ color: tone.text, fontWeight: 900, fontSize: 14, overflowWrap: "anywhere" }}>{displaySituationLabel(row.situacaoId, row.label)}</div>
                <span className="pill small" style={{ color: tone.text, borderColor: tone.border, background: tone.badge }}>#{row.situacaoId}</span>
            </div>
            <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <div className="kpi" style={{ color: "#F9FAFB", marginTop: 0 }}>{formatNumber(row.total)}</div>
                    <div className="muted small">{formatCurrency(row.valorTributoUam)}</div>
                </div>
                <div style={{ height: 7, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,.08)", marginTop: 10 }}>
                    <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, pct))}%`, background: tone.solid }} />
                </div>
                <div className="muted small" style={{ marginTop: 7 }}>{formatNumber(pct)}% da janela</div>
            </div>
        </div>
    );
}

function SecondarySituationCard({ row, total }: { row: ParcelamentoHealth["situations"][number]; total: number }) {
    const tone = situationTone(row.situacaoId);
    return (
        <div
            style={{
                border: `1px solid ${tone.border}`,
                background: "rgba(255,255,255,.035)",
                borderRadius: 8,
                padding: 12,
            }}
        >
            <div style={{ fontWeight: 850, fontSize: 13, color: tone.text }}>{displaySituationLabel(row.situacaoId, row.label)}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 950 }}>{formatNumber(row.total)}</span>
                <span className="muted small">{formatNumber(percentOf(row.total, total))}%</span>
            </div>
        </div>
    );
}

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatCurrency(value: number) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function percentOf(value: number, total: number) {
    return total ? (value / total) * 100 : 0;
}

function buildMainSituations(rows: ParcelamentoHealth["situations"]) {
    const mainRows: ParcelamentoHealth["situations"] = [];

    for (const id of PRIORITY_SITUATION_IDS) {
        const row = rows.find((item) => item.situacaoId === id);
        if (row) mainRows.push(row);
    }

    const remainingRows = rows
        .filter((row) => row.total > 0)
        .filter((row) => !mainRows.some((item) => item.situacaoId === row.situacaoId))
        .sort((a, b) => b.total - a.total || a.importance - b.importance || displaySituationLabel(a.situacaoId, a.label).localeCompare(displaySituationLabel(b.situacaoId, b.label)));

    return [...mainRows, ...remainingRows].slice(0, MAX_MAIN_SITUATIONS);
}

function emptySituation(situacaoId: number): ParcelamentoHealth["situations"][number] {
    const labels: Record<number, string> = {
        125: "Em Dia",
        126: "Em Atraso",
        3222: "Rompido",
        3237: "Enviado PGE",
        3238: "Inscrito em Divida Ativa",
        3: "Pendente",
        4: "Quitado",
        6: "Amortizado",
        106: "Situacao 106",
        103: "Excluido",
        3268: "Situacao 3268",
        3236: "Aguardando Envio para PGE",
        3321: "Extinto",
        3322: "Extinto/Enviado para PGE",
    };
    return { situacaoId, label: labels[situacaoId] ?? `Situacao ${situacaoId}`, importance: 0, total: 0, valorTributoUam: 0 };
}

function displaySituationLabel(situacaoId: number, fallback: string) {
    if (fallback && !/^Situacao \d+$/i.test(fallback)) return fallback;
    const label = emptySituation(situacaoId).label;
    return label.startsWith("Situacao ") ? fallback || label : label;
}

function situationTone(situacaoId: number) {
    const tones: Record<number, ReturnType<typeof makeTone>> = {
        125: makeTone("#6CE9A6"),
        126: makeTone("#FDB022"),
        3222: makeTone("#FDA29B"),
        3237: makeTone("#84CAFF"),
        3238: makeTone("#D6BBFB"),
        3: makeTone("#FDE68A"),
        4: makeTone("#4CC9A6"),
        103: makeTone("#F97066"),
        106: makeTone("#7AA7FF"),
        3268: makeTone("#B7A6FF"),
    };
    return tones[situacaoId] ?? makeTone("#C7D0DD");
}

function makeTone(hex: string) {
    return {
        text: hex,
        solid: hex,
        border: `${hex}66`,
        background: `linear-gradient(180deg, ${hex}22, rgba(255,255,255,.035))`,
        badge: `${hex}18`,
        shadow: `${hex}18`,
    };
}

function formatDate(value: string) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string) {
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatBackendDate(value: string) {
    const match = /\/Date\((\d+)\)\//.exec(value);
    if (match) {
        const date = new Date(Number(match[1]));
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
    }
    return formatDateTime(value);
}

function formatDay(value: string) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
