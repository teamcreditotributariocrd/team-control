import React, { useEffect, useMemo, useState } from "react";
import { Archive, ClipboardList, Info, UsersRound } from "lucide-react";
import { apiGet, type Session } from "../lib/api";

type RequisitionRow = {
    id: number | string;
    title: string;
    type?: string | null;
    status: string;
    openedAt?: string | null;
    updatedAt?: string | null;
    requester?: string | null;
    url?: string | null;
};

type RequisitionKpis = {
    total: number;
    NEW: number;
    ASSIGNED: number;
    CLOSED: number;
};

type RequisitionsResponse = {
    rows?: RequisitionRow[];
};

type FilterKey = "ALL" | "NEW" | "ASSIGNED" | "CLOSED";

const emptyKpis: RequisitionKpis = {
    total: 0,
    NEW: 0,
    ASSIGNED: 0,
    CLOSED: 0,
};

const filterLabels: Record<FilterKey, string> = {
    ALL: "Todas as requisicoes",
    NEW: "Requisicoes novas",
    ASSIGNED: "Requisicoes atribuidas",
    CLOSED: "Requisicoes fechadas",
};

export default function RequisitionsPage({ session }: { session: Session }) {
    const [rows, setRows] = useState<RequisitionRow[]>([]);
    const [filter, setFilter] = useState<FilterKey>("ALL");
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    useEffect(() => {
        let active = true;

        async function load() {
            setLoading(true);
            setErr("");

            try {
                const requisitions = await apiGet<RequisitionsResponse>("/api/incidents?status=ALL&limit=5000", session);
                if (!active) return;
                setRows(Array.isArray(requisitions.rows) ? requisitions.rows.filter(isRequisition) : []);
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
    const filteredRows = useMemo(() => {
        if (filter === "ALL") return rows;
        return rows.filter((row) => normStatus(row.status) === filter);
    }, [filter, rows]);

    return (
        <div>
            <div className="pageHeader">
                <div className="h1">Requisicoes</div>
            </div>

            {loading ? <div className="muted">Carregando requisicoes...</div> : null}
            {err ? <div className="alert">{err}</div> : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <Kpi active={filter === "ALL"} label="Requisicoes no total" value={kpis.total} tone="#BDBDBD" icon={<Info size={20} />} onClick={() => setFilter("ALL")} />
                <Kpi active={filter === "NEW"} label="Requisicoes novas" value={kpis.NEW} tone="#12E052" icon={<ClipboardList size={20} />} onClick={() => setFilter("NEW")} />
                <Kpi active={filter === "ASSIGNED"} label="Requisicoes atribuidas" value={kpis.ASSIGNED} tone="#E89432" icon={<UsersRound size={20} />} onClick={() => setFilter("ASSIGNED")} />
                <Kpi active={filter === "CLOSED"} label="Requisicoes fechadas" value={kpis.CLOSED} tone="#4A4A4A" textColor="#fff" icon={<Archive size={20} />} onClick={() => setFilter("CLOSED")} />
            </div>

            <section className="card" style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <div className="cardTitle" style={{ marginBottom: 0 }}>{filterLabels[filter]}</div>
                    <div className="muted small">{filteredRows.length} requisicao(oes)</div>
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
                                    <td colSpan={8} className="muted small">Nenhuma requisicao neste filtro.</td>
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

function isRequisition(row: RequisitionRow) {
    return normType(row.type).includes("REQUEST") || normType(row.type).includes("REQUIS");
}

function summarizeKpis(rows: RequisitionRow[]): RequisitionKpis {
    return rows.reduce<RequisitionKpis>((acc, row) => {
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

function formatDate(value?: string | null) {
    const dt = dateValue(value);
    if (!dt) return "-";
    return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(value?: string) {
    const status = normStatus(value);
    if (status === "NEW") return "Nova";
    if (status === "ASSIGNED") return "Atribuida";
    if (status === "CLOSED") return "Fechada";
    if (status === "SOLVED") return "Solucionada";
    if (status === "PENDING") return "Pendente";
    if (status === "PLANNED") return "Planejada";
    return value || "-";
}

function Status({ value }: { value?: string }) {
    return <span className="pill">{statusLabel(value)}</span>;
}

function Type({ value }: { value?: string | null }) {
    const label = isRequisition({ id: 0, title: "", status: "", type: value }) ? "Requisicao" : value || "-";
    return (
        <span
            className="pill"
            style={{
                borderColor: "rgba(110,231,255,.34)",
                background: "rgba(110,231,255,.14)",
                color: "#A5F3FC",
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
