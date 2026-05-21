import React, { useEffect, useMemo, useState } from "react";
import { Archive, BellRing, Info, TimerReset, TriangleAlert, UsersRound } from "lucide-react";
import { apiGet, type Session } from "../lib/api";
import type { Collaborator } from "../types";

type IncidentRow = {
    id: number | string;
    title: string;
    type?: string | null;
    status: string;
    openedAt?: string | null;
    updatedAt?: string | null;
    descriptionText?: string | null;
    requester?: string | null;
    requesterName?: string | null;
    techAssignee?: string | null;
    url?: string | null;
};

type IncidentKpis = {
    total: number;
    NEW: number;
    ASSIGNED: number;
    CLOSED: number;
};

type IncidentsResponse = {
    rows?: IncidentRow[];
};

type RecurringTheme = {
    label: string;
    count: number;
    openCount: number;
    pct: number;
    sampleTitles: string[];
};

type FilterKey = "ALL" | "NEW" | "ASSIGNED" | "CLOSED" | "ATTENTION_NEW" | "ATTENTION_ASSIGNED" | "ATTENTION_OPEN";

const emptyKpis: IncidentKpis = {
    total: 0,
    NEW: 0,
    ASSIGNED: 0,
    CLOSED: 0,
};

const filterLabels: Record<FilterKey, string> = {
    ALL: "Todos os incidentes",
    NEW: "Incidentes novos",
    ASSIGNED: "Incidentes atribuidos",
    CLOSED: "Incidentes fechados",
    ATTENTION_NEW: "Novos ha mais de 2 dias",
    ATTENTION_ASSIGNED: "Atribuidos sem atualizacao ha mais de 5 dias",
    ATTENTION_OPEN: "Abertos ha mais de 10 dias",
};

export default function IncidentsPage({ session }: { session: Session }) {
    const [rows, setRows] = useState<IncidentRow[]>([]);
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [filter, setFilter] = useState<FilterKey>("ALL");
    const [theme, setTheme] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    useEffect(() => {
        let active = true;

        async function load() {
            setLoading(true);
            setErr("");

            try {
                const [incidents, team] = await Promise.all([
                    apiGet<IncidentsResponse>("/api/incidents?status=ALL&limit=5000", session),
                    apiGet<Collaborator[]>("/api/collaborators", session),
                ]);
                if (!active) return;
                setRows(Array.isArray(incidents.rows) ? incidents.rows.filter(isIncident) : []);
                setCollaborators(Array.isArray(team) ? team : []);
            } catch (e: any) {
                if (active) setErr(String(e?.message ?? e));
            } finally {
                if (active) setLoading(false);
            }
        }

        load();
        return () => {
            active = false;
        };
    }, [session]);

    const kpis = useMemo(() => summarizeKpis(rows), [rows]);
    const assigneeNames = useMemo(() => firstNameByLogin(collaborators), [collaborators]);

    const attention = useMemo(() => {
        const attentionNew = rows.filter(isOldNew);
        const attentionAssigned = rows.filter(isStaleAssigned);
        const attentionOpen = rows.filter(isOldOpen);
        return { attentionNew, attentionAssigned, attentionOpen };
    }, [rows]);

    const recurringThemes = useMemo(() => buildRecurringThemes(rows), [rows]);
    const openThemes = useMemo(() => recurringThemes.filter((item) => item.openCount > 0).sort((a, b) => b.openCount - a.openCount || b.count - a.count), [recurringThemes]);

    const filteredRows = useMemo(() => {
        let result = rows;
        if (filter === "NEW" || filter === "ASSIGNED" || filter === "CLOSED") {
            result = rows.filter((row) => normStatus(row.status) === filter);
        }
        if (filter === "ATTENTION_NEW") result = attention.attentionNew;
        if (filter === "ATTENTION_ASSIGNED") result = attention.attentionAssigned;
        if (filter === "ATTENTION_OPEN") result = attention.attentionOpen;
        return theme ? result.filter((row) => classifyTheme(row) === theme) : result;
    }, [attention, filter, rows, theme]);

    return (
        <div>
            <div className="pageHeader">
                <div className="h1">Incidentes</div>
            </div>

            {loading ? <div className="muted">Carregando incidentes...</div> : null}
            {err ? <div className="alert">{err}</div> : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <Kpi active={filter === "ALL"} label="Incidentes no total" value={kpis.total} tone="#BDBDBD" icon={<Info size={20} />} onClick={() => setFilter("ALL")} />
                <Kpi active={filter === "NEW"} label="Incidentes novos" value={kpis.NEW} tone="#12E052" icon={<Info size={20} />} onClick={() => setFilter("NEW")} />
                <Kpi active={filter === "ASSIGNED"} label="Incidentes atribuidos" value={kpis.ASSIGNED} tone="#E89432" icon={<UsersRound size={20} />} onClick={() => setFilter("ASSIGNED")} />
                <Kpi active={filter === "CLOSED"} label="Incidentes fechados" value={kpis.CLOSED} tone="#4A4A4A" textColor="#fff" icon={<Archive size={20} />} onClick={() => setFilter("CLOSED")} />
            </div>

            <section className="card" style={{ marginTop: 14, padding: 14 }}>
                <div className="cardTitle" style={{ marginBottom: 10 }}>Precisam de atencao</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    <Attention
                        active={filter === "ATTENTION_NEW"}
                        label="Novos ha mais de 2 dias"
                        value={attention.attentionNew.length}
                        icon={<BellRing size={20} />}
                        tone="#FACC15"
                        onClick={() => setFilter("ATTENTION_NEW")}
                    />
                    <Attention
                        active={filter === "ATTENTION_ASSIGNED"}
                        label="Atribuidos sem atualizacao ha mais de 5 dias"
                        value={attention.attentionAssigned.length}
                        icon={<TimerReset size={20} />}
                        tone="#FB923C"
                        onClick={() => setFilter("ATTENTION_ASSIGNED")}
                    />
                    <Attention
                        active={filter === "ATTENTION_OPEN"}
                        label="Abertos ha mais de 10 dias"
                        value={attention.attentionOpen.length}
                        icon={<TriangleAlert size={20} />}
                        tone="#F87171"
                        onClick={() => setFilter("ATTENTION_OPEN")}
                    />
                </div>
            </section>

            <section className="grid2" style={{ marginTop: 14 }}>
                <div className="card" style={{ padding: 14 }}>
                    <div className="cardTitle" style={{ marginBottom: 4 }}>Assuntos recorrentes</div>
                    <div className="muted small" style={{ marginBottom: 12 }}>
                        Leitura deterministica de titulo e descricao para identificar onde os incidentes se concentram.
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                        {recurringThemes.slice(0, 5).map((item) => (
                            <ThemeRow
                                key={item.label}
                                active={theme === item.label}
                                item={item}
                                onClick={() => setTheme((current) => current === item.label ? null : item.label)}
                            />
                        ))}
                        {!recurringThemes.length ? <div className="muted small">Sem temas recorrentes suficientes no cache.</div> : null}
                    </div>
                </div>

                <div className="card" style={{ padding: 14 }}>
                    <div className="cardTitle" style={{ marginBottom: 4 }}>Foco nos abertos</div>
                    <div className="muted small" style={{ marginBottom: 12 }}>
                        Temas que ainda aparecem em incidentes nao fechados.
                    </div>
                    {openThemes[0] ? (
                        <>
                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                                <div>
                                    <div className="muted small">Maior concentracao aberta</div>
                                    <div className="h2" style={{ marginTop: 4 }}>{openThemes[0].label}</div>
                                </div>
                                <button className="btn ghost small" onClick={() => setTheme(openThemes[0].label)}>
                                    Ver na lista
                                </button>
                            </div>
                            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {openThemes.slice(0, 3).map((item) => (
                                    <span className="pill" key={`open-${item.label}`}>{item.openCount} aberto(s) em {item.label}</span>
                                ))}
                            </div>
                            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                                {openThemes[0].sampleTitles.slice(0, 3).map((title) => (
                                    <div key={title} className="small" style={{ borderLeft: "2px solid rgba(110,231,255,.34)", paddingLeft: 8 }}>
                                        {title}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="muted small">Nao ha temas abertos classificados no cache atual.</div>
                    )}
                </div>
            </section>

            <section className="card" style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <div className="cardTitle" style={{ marginBottom: 0 }}>
                        {filterLabels[filter]}{theme ? ` / ${theme}` : ""}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="muted small">{filteredRows.length} incidente(s)</div>
                        {theme ? <button className="btn ghost small" onClick={() => setTheme(null)}>Limpar assunto</button> : null}
                    </div>
                </div>

                <div className="tableWrap" style={{ marginTop: 12 }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Status</th>
                                <th>Atribuido para</th>
                                <th>Titulo</th>
                                <th>Solicitante</th>
                                <th>Abertura</th>
                                <th>Ultima atualizacao</th>
                                <th>GLPI</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((row) => (
                                <tr key={String(row.id)}>
                                    <td className="mono">{row.id}</td>
                                    <td><Status value={row.status} /></td>
                                    <td>{firstAssigneeName(row.techAssignee, assigneeNames)}</td>
                                    <td style={{ minWidth: 300 }}>{row.title}</td>
                                    <td>{row.requesterName ?? row.requester ?? "-"}</td>
                                    <td className="mono">{formatDate(row.openedAt)}</td>
                                    <td className="mono">{formatDate(row.updatedAt)}</td>
                                    <td>{row.url ? <a className="link" href={row.url} target="_blank" rel="noreferrer">Abrir</a> : "-"}</td>
                                </tr>
                            ))}
                            {!filteredRows.length ? (
                                <tr>
                                    <td colSpan={8} className="muted small">Nenhum incidente neste filtro.</td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function normStatus(value?: string) {
    return String(value ?? "").toUpperCase();
}

function normType(value?: string | null) {
    return String(value ?? "").toUpperCase();
}

function isIncident(row: IncidentRow) {
    return normType(row.type).includes("INCIDENT");
}

function summarizeKpis(rows: IncidentRow[]): IncidentKpis {
    return rows.reduce<IncidentKpis>((acc, row) => {
        const status = normStatus(row.status);
        acc.total += 1;
        if (status === "NEW") acc.NEW += 1;
        if (status === "ASSIGNED") acc.ASSIGNED += 1;
        if (status === "CLOSED") acc.CLOSED += 1;
        return acc;
    }, { ...emptyKpis });
}

function normText(value?: string | null) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function hasTerm(text: string, terms: string[]) {
    return terms.some((term) => text.includes(normText(term)));
}

function classifyTheme(row: IncidentRow) {
    const text = normText(`${row.title ?? ""} ${row.descriptionText ?? ""}`);
    const themes = [
        { label: "PPD e parcelamento", terms: ["ppd", "pva", "pvad", "parcelamento", "parcela", "reparcelamento", "amortizar", "desamortizar"] },
        { label: "ALIM e ACT", terms: ["alim", "act", "auto de lancamento", "demonstrativo"] },
        { label: "Certidoes e pendencias", terms: ["certidao", "circunstanciada", "pendencia", "pendencias", "ccis"] },
        { label: "API e integracoes", terms: ["api", "integracao", "webservice", "retorno", "feriados"] },
        { label: "DAEMS e pagamentos", terms: ["daems", "pagamento", "quitacao", "quitado", "baixa"] },
        { label: "Chatbot e autoatendimento", terms: ["chatbot", "autoatendimento"] },
        { label: "Acesso e permissao", terms: ["acesso", "permissao", "login", "senha", "perfil", "usuario"] },
    ];

    return themes.find((item) => hasTerm(text, item.terms))?.label ?? "Outros assuntos";
}

function buildRecurringThemes(rows: IncidentRow[]) {
    const buckets = new Map<string, { label: string; count: number; openCount: number; sampleTitles: string[] }>();
    for (const row of rows) {
        const label = classifyTheme(row);
        const item = buckets.get(label) ?? { label, count: 0, openCount: 0, sampleTitles: [] };
        item.count += 1;
        if (!isClosed(row)) item.openCount += 1;
        if (item.sampleTitles.length < 3 && row.title) item.sampleTitles.push(row.title);
        buckets.set(label, item);
    }

    const total = rows.length || 1;
    return Array.from(buckets.values())
        .sort((a, b) => {
            if (a.label === "Outros assuntos") return 1;
            if (b.label === "Outros assuntos") return -1;
            return b.count - a.count || a.label.localeCompare(b.label);
        })
        .map((item) => ({
            ...item,
            pct: Number(((item.count / total) * 100).toFixed(1)),
        }));
}

function loginKey(value?: string | null) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return "";
    const withoutDomain = raw.split("\\").pop() ?? raw;
    return (withoutDomain.split("@")[0] ?? withoutDomain).trim();
}

function firstNameByLogin(collaborators: Collaborator[]) {
    const names = new Map<string, string>();
    for (const collaborator of collaborators) {
        const key = loginKey(collaborator.uniqueName);
        const firstName = String(collaborator.displayName ?? "").trim().split(/\s+/)[0];
        if (key && firstName) names.set(key, firstName);
    }
    return names;
}

function firstAssigneeName(value: string | null | undefined, names: Map<string, string>) {
    if (!value) return "-";
    return names.get(loginKey(value)) ?? value;
}

function dateValue(value?: string | null) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysSince(value?: string | null) {
    const dt = dateValue(value);
    if (!dt) return null;
    return (Date.now() - dt.getTime()) / 86_400_000;
}

function isClosed(row: IncidentRow) {
    const status = normStatus(row.status);
    return status === "CLOSED" || status === "SOLVED";
}

function isOldNew(row: IncidentRow) {
    const days = daysSince(row.openedAt);
    return normStatus(row.status) === "NEW" && days !== null && days > 2;
}

function isStaleAssigned(row: IncidentRow) {
    const days = daysSince(row.updatedAt || row.openedAt);
    return normStatus(row.status) === "ASSIGNED" && days !== null && days > 5;
}

function isOldOpen(row: IncidentRow) {
    const days = daysSince(row.openedAt);
    return !isClosed(row) && days !== null && days > 10;
}

function formatDate(value?: string | null) {
    const dt = dateValue(value);
    if (!dt) return "-";
    return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(value?: string) {
    const status = normStatus(value);
    if (status === "NEW") return "Novo";
    if (status === "ASSIGNED") return "Atribuido";
    if (status === "CLOSED") return "Fechado";
    if (status === "SOLVED") return "Solucionado";
    if (status === "PENDING") return "Pendente";
    if (status === "PLANNED") return "Planejado";
    return value || "-";
}

function Status({ value }: { value?: string }) {
    return <span className="pill">{statusLabel(value)}</span>;
}

function ThemeRow({
    active,
    item,
    onClick,
}: {
    active: boolean;
    item: RecurringTheme;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            style={{
                padding: 10,
                borderRadius: 8,
                border: active ? "1px solid rgba(110,231,255,.55)" : "1px solid rgba(255,255,255,.08)",
                background: active ? "rgba(110,231,255,.12)" : "rgba(255,255,255,.03)",
                color: "inherit",
                cursor: "pointer",
                textAlign: "left",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <span className="strong">{item.label}</span>
                <span className="mono small">{item.count} / {item.pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden", marginTop: 8 }}>
                <div style={{ width: `${Math.max(item.pct, 3)}%`, height: "100%", background: item.openCount ? "#FB923C" : "#6EE7C4" }} />
            </div>
            <div className="muted small" style={{ marginTop: 6 }}>
                {item.openCount} aberto(s){item.sampleTitles[0] ? ` / Ex.: ${item.sampleTitles[0]}` : ""}
            </div>
        </button>
    );
}

function Kpi({
    active,
    label,
    value,
    tone,
    textColor = "#111",
    icon,
    onClick,
}: {
    active: boolean;
    label: string;
    value: number;
    tone: string;
    textColor?: string;
    icon: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            style={{
                position: "relative",
                minHeight: 124,
                padding: 16,
                border: active ? "2px solid rgba(255,255,255,.92)" : "1px solid rgba(255,255,255,.08)",
                borderRadius: 8,
                background: tone,
                color: textColor,
                cursor: "pointer",
                textAlign: "left",
                boxShadow: active ? "0 0 0 3px rgba(255,255,255,.12)" : "none",
            }}
        >
            <span style={{ position: "absolute", top: 14, right: 14, opacity: 0.72 }}>
                {icon}
            </span>
            <div className="kpi" style={{ marginTop: 0, color: textColor }}>
                {value}
            </div>
            <div style={{ marginTop: 8, maxWidth: "90%", color: textColor }}>
                {label}
            </div>
        </button>
    );
}

function Attention({
    active,
    label,
    value,
    icon,
    tone,
    onClick,
}: {
    active: boolean;
    label: string;
    value: number;
    icon: React.ReactNode;
    tone: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="card"
            onClick={onClick}
            aria-pressed={active}
            style={{
                minHeight: 88,
                padding: 12,
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: 12,
                alignItems: "center",
                textAlign: "left",
                cursor: "pointer",
                background: `linear-gradient(180deg, ${tone}24, rgba(13,23,48,.88))`,
                borderColor: active ? `${tone}CC` : `${tone}55`,
                boxShadow: active ? `0 0 0 2px ${tone}33` : "none",
            }}
        >
            <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 8, background: `${tone}22`, color: tone }}>
                {icon}
            </span>
            <span>
                <span className="kpi" style={{ display: "block", marginTop: 0, fontSize: 24 }}>{value}</span>
                <span className="small">{label}</span>
            </span>
        </button>
    );
}
