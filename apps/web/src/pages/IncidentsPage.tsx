import React, { useEffect, useMemo, useState } from "react";
import { Archive, Clock3, Info, UsersRound } from "lucide-react";
import { apiGet, type Session } from "../lib/api";

type IncidentRow = {
    id: number | string;
    title: string;
    type?: string | null;
    status: string;
    openedAt?: string | null;
    updatedAt?: string | null;
    requester?: string | null;
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
    const [filter, setFilter] = useState<FilterKey>("ALL");
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    useEffect(() => {
        let active = true;

        async function load() {
            setLoading(true);
            setErr("");

            try {
                const incidents = await apiGet<IncidentsResponse>("/api/incidents?status=ALL&limit=5000", session);
                if (!active) return;
                setRows(Array.isArray(incidents.rows) ? incidents.rows.filter(isIncident) : []);
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

    const attention = useMemo(() => {
        const attentionNew = rows.filter(isOldNew);
        const attentionAssigned = rows.filter(isStaleAssigned);
        const attentionOpen = rows.filter(isOldOpen);
        return { attentionNew, attentionAssigned, attentionOpen };
    }, [rows]);

    const filteredRows = useMemo(() => {
        if (filter === "NEW" || filter === "ASSIGNED" || filter === "CLOSED") {
            return rows.filter((row) => normStatus(row.status) === filter);
        }
        if (filter === "ATTENTION_NEW") return attention.attentionNew;
        if (filter === "ATTENTION_ASSIGNED") return attention.attentionAssigned;
        if (filter === "ATTENTION_OPEN") return attention.attentionOpen;
        return rows;
    }, [attention, filter, rows]);

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
                        onClick={() => setFilter("ATTENTION_NEW")}
                    />
                    <Attention
                        active={filter === "ATTENTION_ASSIGNED"}
                        label="Atribuidos sem atualizacao ha mais de 5 dias"
                        value={attention.attentionAssigned.length}
                        onClick={() => setFilter("ATTENTION_ASSIGNED")}
                    />
                    <Attention
                        active={filter === "ATTENTION_OPEN"}
                        label="Abertos ha mais de 10 dias"
                        value={attention.attentionOpen.length}
                        onClick={() => setFilter("ATTENTION_OPEN")}
                    />
                </div>
            </section>

            <section className="card" style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <div className="cardTitle" style={{ marginBottom: 0 }}>{filterLabels[filter]}</div>
                    <div className="muted small">{filteredRows.length} incidente(s)</div>
                </div>

                <div className="tableWrap" style={{ marginTop: 12 }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Tipo</th>
                                <th>Status</th>
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
                                    <td><Type value={row.type} /></td>
                                    <td><Status value={row.status} /></td>
                                    <td style={{ minWidth: 300 }}>{row.title}</td>
                                    <td className="mono">{row.requester ?? "-"}</td>
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

function Type({ value }: { value?: string | null }) {
    const label = normType(value).includes("INCIDENT") ? "Incidente" : value || "-";
    return (
        <span
            className="pill"
            style={{
                borderColor: "rgba(248,113,113,.34)",
                background: "rgba(248,113,113,.14)",
                color: "#FCA5A5",
                fontWeight: 800,
            }}
        >
            {label}
        </span>
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
    onClick,
}: {
    active: boolean;
    label: string;
    value: number;
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
                borderColor: active ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.10)",
                boxShadow: active ? "0 0 0 2px rgba(255,255,255,.10)" : "none",
            }}
        >
            <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 8, background: "rgba(242,195,52,.16)", color: "#F2C334" }}>
                <Clock3 size={20} />
            </span>
            <span>
                <span className="kpi" style={{ display: "block", marginTop: 0, fontSize: 24 }}>{value}</span>
                <span className="small">{label}</span>
            </span>
        </button>
    );
}
