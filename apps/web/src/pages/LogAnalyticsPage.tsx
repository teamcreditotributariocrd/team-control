import React, { useEffect, useState } from "react";
import { BarChart3, FileText, FolderSearch, RefreshCw, Save, ServerCog, Trash2, TriangleAlert } from "lucide-react";
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))", gap: 14, alignItems: "start", minWidth: 0 }}>
                <aside style={{ display: "grid", gap: 14, minWidth: 0 }}>
                    <section className="card" style={{ minWidth: 0 }}>
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
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
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
                        <section className="card" style={{ minWidth: 0 }}>
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

                <main style={{ display: "grid", gap: 14, minWidth: 0 }}>
                    <section className="card" style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div>
                                <div className="cardTitle" style={{ marginBottom: 4 }}>{analysis?.source.name ?? "Analise"}</div>
                                <div className="muted small">{analysis?.source.description ?? "Selecione uma fonte para ler os logs."}</div>
                            </div>
                            <span className="pill small">
                                <FolderSearch size={14} />
                                {analysis?.files.length ?? 0} arquivo(s) lido(s)
                            </span>
                        </div>
                        {selectedId ? (
                            <div className="muted small" style={{ marginTop: 10 }}>
                                Selecionar uma fonte inicia a leitura. Use Ler logs para reler os arquivos da janela escolhida.
                            </div>
                        ) : null}
                    </section>

                    {analysis ? (
                        <>
                            {!analysis.files.length ? (
                                <section className="card" style={{ borderColor: "rgba(255,209,102,.34)", minWidth: 0 }}>
                                    <div className="cardTitle">Nenhum arquivo compativel encontrado</div>
                                    <div className="muted">
                                        Confira o caminho da pasta e o prefixo da fonte. Este parser procura arquivos diarios no formato
                                        {" "}<span className="mono">{analysis.source.filePrefix}.YYYYMMDD.log</span>.
                                    </div>
                                </section>
                            ) : analysis.kpis.executions === 0 ? (
                                <section className="card" style={{ borderColor: "rgba(255,209,102,.34)", minWidth: 0 }}>
                                    <div className="cardTitle">Arquivos lidos, mas sem execucoes reconhecidas</div>
                                    <div className="muted">
                                        Os arquivos foram encontrados, mas o parser {parserMeta[analysis.source.parser].label} nao identificou {parserMeta[analysis.source.parser].expectedSummary} neles.
                                        Essa fonte precisa usar logs com o mesmo formato ou ganhar um parser proprio.
                                    </div>
                                </section>
                            ) : null}
                            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 10 }}>
                                <Kpi label="Execucoes" value={analysis.kpis.executions} icon={<ServerCog size={18} />} />
                                <Kpi label={isAtualizarLocal(analysis) ? "Atualizacoes Sydle" : "DAEMS baixados"} value={analysis.kpis.loweredSuccess} icon={<BarChart3 size={18} />} />
                                <Kpi label="Erros" value={analysis.kpis.errorsFound} icon={<TriangleAlert size={18} />} bad={analysis.kpis.errorsFound > 0} />
                                <Kpi label="Execucoes com erro" value={analysis.kpis.runsWithErrors} icon={<TriangleAlert size={18} />} bad={analysis.kpis.runsWithErrors > 0} />
                                <Kpi label="Duracao media" value={formatDuration(analysis.kpis.averageDurationSeconds)} icon={<FileText size={18} />} />
                            </section>

                            <section className="card">
                                <div className="cardTitle">Ultimas execucoes</div>
                                <div className="tableWrap">
                                    <table className="table">
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

                            <section className="card">
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

function Kpi({ label, value, icon, bad = false }: { label: string; value: React.ReactNode; icon: React.ReactNode; bad?: boolean }) {
    return (
        <div className="card" style={{ borderColor: bad ? "rgba(255,92,122,.34)" : undefined, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: bad ? "#FF5C7A" : "inherit" }}>
                <span className="muted small">{label}</span>
                {icon}
            </div>
            <div className="kpi" style={{ marginTop: 8 }}>{value}</div>
        </div>
    );
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
