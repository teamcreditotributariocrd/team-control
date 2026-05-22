import React, { useEffect, useState } from "react";
import { Activity, BarChart3, CheckCircle2, Clock3, FileText, FolderSearch, HeartPulse, RefreshCw, Save, ServerCog, ShieldAlert, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { apiGet, apiSend, type Session } from "../lib/api";
import type { LogAnalyticsAnalysis, LogParser, LogSource } from "../types";

type SourceDraft = {
    id?: string;
    name: string;
    system: string;
    description: string;
    path: string;
    filePrefix: string;
    parser: LogParser;
};

const defaultDraft: SourceDraft = {
    name: "",
    system: "",
    description: "",
    path: "",
    filePrefix: "",
    parser: "CREDTRIB_BAIXA_AUTOMATICA",
};

const parserMeta: Record<LogParser, { label: string; expectedSummary: string }> = {
    CREDTRIB_BAIXA_AUTOMATICA: {
        label: "Baixa automatica CREDTRIB",
        expectedSummary: "resumo da baixa automatica",
    },
    CREDTRIB_ATUALIZAR_LOCAL_CONTENCIOSO: {
        label: "Atualizar local contencioso",
        expectedSummary: "execucoes de atualizacao de local com etapas de parcelamento e processo",
    },
};

export default function LogAnalyticsPage({ session }: { session: Session }) {
    const [sources, setSources] = useState<LogSource[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [analysis, setAnalysis] = useState<LogAnalyticsAnalysis | null>(null);
    const [days, setDays] = useState(14);
    const [draft, setDraft] = useState<SourceDraft>(defaultDraft);
    const [loading, setLoading] = useState(true);
    const [reading, setReading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    async function loadSources(active = () => true) {
        setLoading(true);
        setErr("");
        try {
            const rows = await apiGet<LogSource[]>("/api/log-analytics/sources", session);
            if (!active()) return;
            setSources(rows);
            setSelectedId((current) => current && rows.some((source) => source.id === current) ? current : rows[0]?.id ?? "");
        } catch (e: any) {
            if (active()) setErr(String(e?.message ?? e));
        } finally {
            if (active()) setLoading(false);
        }
    }

    async function loadAnalysis(sourceId = selectedId) {
        if (!sourceId) return;
        setReading(true);
        setErr("");
        try {
            setAnalysis(await apiGet<LogAnalyticsAnalysis>(`/api/log-analytics/sources/${sourceId}/analysis?days=${days}`, session));
        } catch (e: any) {
            setAnalysis(null);
            setErr(String(e?.message ?? e));
        } finally {
            setReading(false);
        }
    }

    useEffect(() => {
        let active = true;
        loadSources(() => active);
        return () => {
            active = false;
        };
    }, [session]);

    useEffect(() => {
        if (selectedId) loadAnalysis(selectedId);
    }, [selectedId, days]);

    async function saveSource() {
        setSaving(true);
        setErr("");
        try {
            const saved = await apiSend<LogSource>("/api/log-analytics/sources", "POST", draft, session);
            setSources((current) => upsertSource(current, saved));
            setSelectedId(saved.id);
            setDraft(defaultDraft);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setSaving(false);
        }
    }

    async function removeSource() {
        if (!draft.id) return;
        setSaving(true);
        setErr("");
        try {
            await apiSend(`/api/log-analytics/sources/${draft.id}`, "DELETE", {}, session);
            setSources((current) => current.filter((source) => source.id !== draft.id));
            setDraft(defaultDraft);
            setAnalysis(null);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div>
            <div className="pageHeader">
                <div>
                    <div className="h1">Log Analytics</div>
                    <div className="muted">Leitura analitica de logs de servicos por caminho de rede.</div>
                </div>
                <div className="pageHeaderRight">
                    <div>
                        <div className="label">Janela</div>
                        <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                            <option value={3}>3 dias</option>
                            <option value={7}>7 dias</option>
                            <option value={14}>14 dias</option>
                            <option value={31}>31 dias</option>
                        </select>
                    </div>
                    <button className="btn ghost" onClick={() => loadAnalysis()} disabled={reading || !selectedId}>
                        <RefreshCw size={16} />
                        {reading ? "Lendo logs..." : "Ler logs"}
                    </button>
                </div>
            </div>

            {err ? <div className="alert">{err}</div> : null}

            <div className="logAnalyticsLayout">
                <aside className="logAnalyticsColumn">
                    <section className="card logAnalyticsCard">
                        <div className="cardTitle">Fontes configuradas</div>
                        {loading ? <div className="muted">Carregando fontes...</div> : null}
                        <div style={{ display: "grid", gap: 8 }}>
                            {sources.map((source) => (
                                <div
                                    key={source.id}
                                    onClick={() => setSelectedId(source.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setSelectedId(source.id);
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    style={{
                                        padding: 10,
                                        minWidth: 0,
                                        borderRadius: 8,
                                        border: selectedId === source.id ? "1px solid rgba(110,231,255,.48)" : "1px solid rgba(255,255,255,.08)",
                                        background: selectedId === source.id ? "rgba(110,231,255,.11)" : "rgba(255,255,255,.03)",
                                        color: "inherit",
                                        textAlign: "left",
                                        cursor: "pointer",
                                    }}
                                >
                                    <div className="logAnalyticsSourceHeader">
                                        <span className="strong">{source.name}</span>
                                        <span className="pill small">{source.system}</span>
                                    </div>
                                    <div className="muted small" style={{ marginTop: 5 }}>{source.description}</div>
                                    <div className="mono small" style={{ marginTop: 7, overflowWrap: "anywhere" }}>{source.path}</div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                                        <button
                                            type="button"
                                            className="btn primary small"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setSelectedId(source.id);
                                                loadAnalysis(source.id);
                                            }}
                                            disabled={reading}
                                        >
                                            <FolderSearch size={14} />
                                            Ler logs
                                        </button>
                                    {session.role === "admin" ? (
                                        <button
                                            type="button"
                                            className="btn ghost small"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setDraft(fromSource(source));
                                            }}
                                        >
                                            Configurar
                                        </button>
                                    ) : null}
                                    </div>
                                </div>
                            ))}
                            {!sources.length ? <div className="muted small">Nenhuma fonte configurada.</div> : null}
                        </div>
                    </section>

                    {session.role === "admin" ? (
                        <section className="card logAnalyticsCard">
                            <div className="cardTitle">{draft.id ? "Editar fonte" : "Nova fonte"}</div>
                            <div className="label">Nome / assunto</div>
                            <input className="input" value={draft.name} onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))} />
                            <div className="row2" style={{ marginTop: 10 }}>
                                <div>
                                    <div className="label">Sistema</div>
                                    <input className="input" value={draft.system} onChange={(e) => setDraft((current) => ({ ...current, system: e.target.value }))} />
                                </div>
                                <div>
                                    <div className="label">Parser</div>
                                    <select className="input" value={draft.parser} onChange={(e) => setDraft((current) => ({ ...current, parser: e.target.value as LogParser }))}>
                                        {Object.entries(parserMeta).map(([value, meta]) => (
                                            <option key={value} value={value}>{meta.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="label" style={{ marginTop: 10 }}>Caminho da pasta</div>
                            <input className="input mono" value={draft.path} onChange={(e) => setDraft((current) => ({ ...current, path: e.target.value }))} />
                            <div className="label" style={{ marginTop: 10 }}>Prefixo dos arquivos</div>
                            <input className="input mono" value={draft.filePrefix} onChange={(e) => setDraft((current) => ({ ...current, filePrefix: e.target.value }))} placeholder="CREDTRIBBaixaAutomatica.exe" />
                            <div className="muted small" style={{ marginTop: 7, overflowWrap: "anywhere" }}>
                                O parser atual procura arquivos no formato <span className="mono">{draft.filePrefix.trim() || "prefixo"}.YYYYMMDD.log</span> e espera {parserMeta[draft.parser].expectedSummary}.
                            </div>
                            <div className="label" style={{ marginTop: 10 }}>O que significa</div>
                            <textarea className="input" rows={3} value={draft.description} onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))} />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                                {draft.id ? (
                                    <button className="btn danger" onClick={removeSource} disabled={saving}>
                                        <Trash2 size={15} />
                                        Remover
                                    </button>
                                ) : <span />}
                                <button className="btn primary" onClick={saveSource} disabled={saving || !draft.name.trim() || !draft.system.trim() || !draft.path.trim() || !draft.filePrefix.trim()}>
                                    <Save size={15} />
                                    {saving ? "Salvando..." : "Salvar fonte"}
                                </button>
                            </div>
                        </section>
                    ) : null}
                </aside>

                <main className="logAnalyticsColumn">
                    <section className="logAnalyticsHero">
                        <div className="card logAnalyticsCard">
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                                <div>
                                    <div className="label">Fonte em leitura</div>
                                    <div className="h1" style={{ marginTop: 5 }}>{analysis?.source.name ?? "Selecione uma fonte"}</div>
                                    <div className="muted" style={{ marginTop: 7 }}>{analysis?.source.description ?? "Leia os arquivos de uma fonte para ver volume, saude e erros reconhecidos pelo parser."}</div>
                                </div>
                                <span className="pill small">
                                    <FolderSearch size={14} />
                                    {analysis?.files.length ?? 0} arquivo(s)
                                </span>
                            </div>
                            {analysis ? (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                                    <span className="pill">{parserMeta[analysis.source.parser].label}</span>
                                    <span className="pill">Janela: {days} dias</span>
                                    <span className="pill mono">{analysis.source.filePrefix}</span>
                                </div>
                            ) : selectedId ? (
                                <div className="muted small" style={{ marginTop: 12 }}>
                                    Selecionar uma fonte inicia a leitura. Use Ler logs para reler os arquivos da janela escolhida.
                                </div>
                            ) : null}
                        </div>

                        <HealthPanel analysis={analysis} />
                    </section>

                    {analysis ? (
                        <>
                            {!analysis.files.length ? (
                                <section className="card logAnalyticsCard" style={{ borderColor: "rgba(255,209,102,.34)" }}>
                                    <div className="cardTitle">Nenhum arquivo compativel encontrado</div>
                                    <div className="muted">
                                        Confira o caminho da pasta e o prefixo da fonte. Este parser procura arquivos diarios no formato
                                        {" "}<span className="mono">{analysis.source.filePrefix}.YYYYMMDD.log</span>.
                                    </div>
                                </section>
                            ) : analysis.kpis.executions === 0 ? (
                                <section className="card logAnalyticsCard" style={{ borderColor: "rgba(255,209,102,.34)" }}>
                                    <div className="cardTitle">Arquivos lidos, mas sem execucoes reconhecidas</div>
                                    <div className="muted">
                                        Os arquivos foram encontrados, mas o parser {parserMeta[analysis.source.parser].label} nao identificou {parserMeta[analysis.source.parser].expectedSummary} neles.
                                        Essa fonte precisa usar logs com o mesmo formato ou ganhar um parser proprio.
                                    </div>
                                </section>
                            ) : null}
                            <section className="logAnalyticsMetrics">
                                <Kpi label="Execucoes" value={analysis.kpis.executions} icon={<ServerCog size={18} />} note={`${healthyRuns(analysis)} sem erro na janela`} good={healthyRuns(analysis) === analysis.kpis.executions && analysis.kpis.executions > 0} />
                                <Kpi label={isAtualizarLocal(analysis) ? "Atualizacoes Sydle" : "DAEMS baixados"} value={analysis.kpis.loweredSuccess} icon={<BarChart3 size={18} />} note={isAtualizarLocal(analysis) ? "Atualizacoes concluidas pelo parser" : "Baixas reconhecidas no servico"} />
                                <Kpi label="Erros encontrados" value={analysis.kpis.errorsFound} icon={<TriangleAlert size={18} />} note={analysis.kpis.errorsFound ? `${analysis.errorPatterns.length} padrao(oes) agrupado(s)` : "Nenhum erro na leitura"} bad={analysis.kpis.errorsFound > 0} good={analysis.kpis.errorsFound === 0} />
                                <Kpi label="Taxa sem erro" value={formatPercent(successRate(analysis))} icon={<ShieldCheck size={18} />} note={`${analysis.kpis.runsWithErrors} execucao(oes) com erro`} bad={successRate(analysis) < 90} good={successRate(analysis) === 100} />
                                <Kpi label="Duracao media" value={formatDuration(analysis.kpis.averageDurationSeconds)} icon={<Clock3 size={18} />} note={analysis.kpis.lastRunAt ? `Ultima: ${formatDateTime(analysis.kpis.lastRunAt)}` : "Sem execucao reconhecida"} />
                            </section>

                            <section className="logAnalyticsSplit">
                                <DailyHealth analysis={analysis} />
                                <OperationalSignals analysis={analysis} />
                            </section>

                            <section className="card logAnalyticsCard">
                                <div className="cardTitle">Ultimas execucoes</div>
                                <div className="tableWrap">
                                    <table className="table logAnalyticsTable">
                                        <thead>
                                            <tr>
                                                <th>Inicio</th>
                                                <th>Duracao</th>
                                                {isAtualizarLocal(analysis) ? (
                                                    <>
                                                        <th>Parcelamentos consultados</th>
                                                        <th>Processos consultados</th>
                                                        <th>Atualiz. parcelamento</th>
                                                        <th>Atualiz. processo</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th>Emitidos</th>
                                                        <th>Atualizados pago</th>
                                                        <th>Baixados</th>
                                                    </>
                                                )}
                                                <th>Erros</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analysis.executions.slice(0, 30).map((run) => (
                                                <tr key={`${run.file}-${run.startedAt}`}>
                                                    <td className="mono">{formatDateTime(run.startedAt)}</td>
                                                    <td className="mono">{formatDuration(run.durationSeconds ?? 0)}</td>
                                                    {isAtualizarLocal(analysis) ? (
                                                        <>
                                                            <td>{run.consultedInstallments ?? 0}</td>
                                                            <td>{run.consultedProcesses ?? 0}</td>
                                                            <td>{run.updatedInstallments ?? 0}</td>
                                                            <td>{run.updatedProcesses ?? 0}</td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td>{run.emittedProcessed}</td>
                                                            <td>{run.updatedToPaid}</td>
                                                            <td>{run.loweredSuccess}</td>
                                                        </>
                                                    )}
                                                    <td>{run.errorsFound ? <span className="pill bad">{run.errorsFound}</span> : <span className="pill ok">0</span>}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="card logAnalyticsCard">
                                <div className="cardTitle">Padroes de erro</div>
                                <div style={{ display: "grid", gap: 8 }}>
                                    {analysis.errorPatterns.map((pattern) => (
                                        <div key={pattern.signature} style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,92,122,.25)", background: "rgba(255,92,122,.08)" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                                <span className="strong" style={{ overflowWrap: "anywhere" }}>{pattern.signature}</span>
                                                <span className="pill bad">{pattern.count} ocorrencia(s)</span>
                                            </div>
                                            <div className="muted small" style={{ marginTop: 6 }}>Ultima: {formatDateTime(pattern.lastAt)}</div>
                                        </div>
                                    ))}
                                    {!analysis.errorPatterns.length ? <div className="muted small">Nenhum padrao de erro na janela lida.</div> : null}
                                </div>
                            </section>
                        </>
                    ) : null}
                </main>
            </div>
        </div>
    );
}

function fromSource(source: LogSource): SourceDraft {
    return {
        id: source.id,
        name: source.name,
        system: source.system,
        description: source.description,
        path: source.path,
        filePrefix: source.filePrefix,
        parser: source.parser,
    };
}

function upsertSource(sources: LogSource[], saved: LogSource) {
    const exists = sources.some((source) => source.id === saved.id);
    const next = exists ? sources.map((source) => source.id === saved.id ? saved : source) : [...sources, saved];
    return next.sort((a, b) => a.system.localeCompare(b.system) || a.name.localeCompare(b.name));
}

function isAtualizarLocal(analysis: LogAnalyticsAnalysis) {
    return analysis.source.parser === "CREDTRIB_ATUALIZAR_LOCAL_CONTENCIOSO";
}

function HealthPanel({ analysis }: { analysis: LogAnalyticsAnalysis | null }) {
    const health = healthSummary(analysis);
    const Icon = health.tone === "good" ? ShieldCheck : health.tone === "bad" ? ShieldAlert : HeartPulse;

    return (
        <div className={`logAnalyticsHealth ${health.tone}`}>
            <div className="logAnalyticsHealthTop">
                <div>
                    <div className="label">Saude do log</div>
                    <div className="logAnalyticsHealthTitle" style={{ marginTop: 6 }}>{health.title}</div>
                    <div className="muted" style={{ marginTop: 7 }}>{health.description}</div>
                </div>
                <div className="logAnalyticsHealthBadge">
                    <Icon size={26} />
                </div>
            </div>
            <div className="logAnalyticsHealthFacts">
                <HealthFact label="Ultima execucao" value={analysis?.kpis.lastRunAt ? formatDateTime(analysis.kpis.lastRunAt) : "-"} />
                <HealthFact label="Arquivos lidos" value={analysis?.files.length ?? 0} />
                <HealthFact label="Sem erro" value={analysis ? formatPercent(successRate(analysis)) : "-"} />
            </div>
        </div>
    );
}

function HealthFact({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="logAnalyticsFact">
            <div className="label">{label}</div>
            <div className="logAnalyticsFactValue">{value}</div>
        </div>
    );
}

function DailyHealth({ analysis }: { analysis: LogAnalyticsAnalysis }) {
    const rows = analysis.daily.slice(0, 7);
    const maxExecutions = Math.max(...rows.map((row) => row.executions), 1);

    return (
        <section className="card logAnalyticsCard">
            <div className="cardTitle">Saude por dia</div>
            <div className="muted small" style={{ marginBottom: 12 }}>Dias recentes reconhecidos pelo parser na janela selecionada.</div>
            <div className="logAnalyticsDaily">
                {rows.map((row) => (
                    <div key={row.day} className="logAnalyticsDailyRow">
                        <div className="mono strong">{formatDay(row.day)}</div>
                        <div>
                            <div className="logAnalyticsDailyMeta small">
                                <span>{row.executions} execucao(oes)</span>
                                <span className={row.errors ? "pill bad" : "pill ok"}>{row.errors ? `${row.errors} erro(s)` : "Sem erro"}</span>
                                <span className="muted">Media {formatDuration(row.averageDurationSeconds)}</span>
                            </div>
                            <div className="logAnalyticsPulse" style={{ marginTop: 8 }}>
                                <span style={{ width: `${Math.max(12, Math.round((row.executions / maxExecutions) * 100))}%` }} />
                            </div>
                        </div>
                        <span className={row.errors ? "pill warn" : "pill ok"}>{row.errors ? "Atencao" : "Saudavel"}</span>
                    </div>
                ))}
                {!rows.length ? <div className="emptyState">Sem execucoes diarias reconhecidas.</div> : null}
            </div>
        </section>
    );
}

function OperationalSignals({ analysis }: { analysis: LogAnalyticsAnalysis }) {
    const signals = operationalSignals(analysis);

    return (
        <section className="card logAnalyticsCard">
            <div className="cardTitle">Leitura operacional</div>
            <div className="muted small" style={{ marginBottom: 12 }}>Resumo deterministico do que esta leitura sinaliza agora.</div>
            <div className="logAnalyticsSignalList">
                {signals.map((signal) => {
                    const Icon = signal.tone === "good" ? CheckCircle2 : signal.tone === "bad" ? TriangleAlert : Activity;
                    return (
                        <div key={signal.title} className="logAnalyticsSignal">
                            <div className="logAnalyticsSignalIcon">
                                <Icon size={17} />
                            </div>
                            <div>
                                <div className="strong">{signal.title}</div>
                                <div className="muted small" style={{ marginTop: 4 }}>{signal.description}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function Kpi({ label, value, icon, note, bad = false, good = false }: { label: string; value: React.ReactNode; icon: React.ReactNode; note: string; bad?: boolean; good?: boolean }) {
    return (
        <div className={`card logAnalyticsKpi${bad ? " bad" : ""}${good ? " good" : ""}`} style={{ borderColor: bad ? "rgba(255,92,122,.34)" : good ? "rgba(50,213,131,.28)" : undefined, borderRadius: 8 }}>
            <div className="logAnalyticsKpiTop" style={{ color: bad ? "#FF5C7A" : "inherit" }}>
                <span className="label">{label}</span>
                <span className="logAnalyticsKpiIcon">{icon}</span>
            </div>
            <div>
                <div className="kpi">{value}</div>
                <div className="logAnalyticsKpiNote" style={{ marginTop: 8 }}>{note}</div>
            </div>
        </div>
    );
}

function healthSummary(analysis: LogAnalyticsAnalysis | null) {
    if (!analysis) return { tone: "warn", title: "Aguardando leitura", description: "Selecione uma fonte para medir a saude do log." };
    if (!analysis.files.length) return { tone: "bad", title: "Fonte sem arquivos", description: "Nenhum arquivo compativel foi encontrado nesta janela." };
    if (!analysis.kpis.executions) return { tone: "warn", title: "Parser sem execucoes", description: "Arquivos foram lidos, mas o formato ainda nao gerou execucoes analisaveis." };
    if (!analysis.kpis.errorsFound) return { tone: "good", title: "Saudavel na janela", description: "As execucoes reconhecidas nao trouxeram erros para esta fonte." };
    if (successRate(analysis) >= 90) return { tone: "warn", title: "Estavel com alerta", description: "A maioria das execucoes passou sem erro, mas ha sinais para revisar." };
    return { tone: "bad", title: "Precisa de atencao", description: "Erros aparecem em uma parcela relevante das execucoes lidas." };
}

function operationalSignals(analysis: LogAnalyticsAnalysis) {
    const success = successRate(analysis);
    const signals = [
        analysis.kpis.errorsFound === 0
            ? { tone: "good", title: "Janela sem erro", description: `${analysis.kpis.executions} execucao(oes) reconhecida(s) sem erro agrupado.` }
            : { tone: success < 90 ? "bad" : "warn", title: "Erros encontrados", description: `${analysis.kpis.errorsFound} erro(s) em ${analysis.kpis.runsWithErrors} execucao(oes). O agrupamento ajuda a atacar repeticoes.` },
        analysis.errorPatterns[0]
            ? { tone: "warn", title: "Padrao mais frequente", description: `${analysis.errorPatterns[0].count} ocorrencia(s): ${analysis.errorPatterns[0].signature}` }
            : { tone: "good", title: "Sem padrao de falha", description: "Nenhum padrao de erro foi agrupado nesta leitura." },
        analysis.kpis.lastRunAt
            ? { tone: "good", title: "Ultima execucao reconhecida", description: formatDateTime(analysis.kpis.lastRunAt) }
            : { tone: "warn", title: "Sem execucao reconhecida", description: "Revise parser, prefixo e formato do arquivo." },
    ];
    return signals;
}

function healthyRuns(analysis: LogAnalyticsAnalysis) {
    return Math.max(analysis.kpis.executions - analysis.kpis.runsWithErrors, 0);
}

function successRate(analysis: LogAnalyticsAnalysis) {
    return analysis.kpis.executions ? Math.round((healthyRuns(analysis) / analysis.kpis.executions) * 100) : 0;
}

function formatPercent(value: number) {
    return `${value}%`;
}

function formatDuration(seconds: number) {
    const hh = Math.floor(seconds / 3600);
    const mm = Math.floor((seconds % 3600) / 60);
    const ss = seconds % 60;
    return [hh, mm, ss].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatDateTime(value: string) {
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? value : dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function formatDay(value: string) {
    const dt = new Date(`${value}T12:00:00`);
    return Number.isNaN(dt.getTime()) ? value : dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
