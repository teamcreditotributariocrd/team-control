import React, { useEffect, useState } from "react";
import { Archive, Info, UsersRound } from "lucide-react";
import { apiGet, type Session } from "../lib/api";

type IncidentKpis = {
    total: number;
    NEW: number;
    ASSIGNED: number;
    CLOSED: number;
};

type IncidentAnalyticsResponse = {
    kpis?: IncidentKpis;
};

const emptyKpis: IncidentKpis = {
    total: 0,
    NEW: 0,
    ASSIGNED: 0,
    CLOSED: 0,
};

export default function IncidentsPage({ session }: { session: Session }) {
    const [kpis, setKpis] = useState<IncidentKpis>(emptyKpis);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    useEffect(() => {
        let active = true;

        async function load() {
            setLoading(true);
            setErr("");

            try {
                const data = await apiGet<IncidentAnalyticsResponse>("/api/incidents/analytics/pareto?status=ALL", session);
                if (active) setKpis(data.kpis ?? emptyKpis);
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

    return (
        <div>
            <div className="pageHeader">
                <div>
                    <div className="h1">Incidentes</div>
                </div>
            </div>

            {loading ? <div className="muted">Carregando incidentes...</div> : null}
            {err ? <div className="alert">{err}</div> : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <Kpi label="Chamados no total" value={kpis.total} tone="#BDBDBD" icon={<Info size={20} />} />
                <Kpi label="Chamados novos" value={kpis.NEW} tone="#12E052" icon={<Info size={20} />} />
                <Kpi label="Chamados atribuidos" value={kpis.ASSIGNED} tone="#E89432" icon={<UsersRound size={20} />} />
                <Kpi label="Chamados fechados" value={kpis.CLOSED} tone="#4A4A4A" textColor="#fff" icon={<Archive size={20} />} />
            </div>
        </div>
    );
}

function Kpi({
    label,
    value,
    tone,
    textColor = "#111",
    icon,
}: {
    label: string;
    value: number;
    tone: string;
    textColor?: string;
    icon: React.ReactNode;
}) {
    return (
        <div
            style={{
                position: "relative",
                minHeight: 124,
                padding: 16,
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 8,
                background: tone,
                color: textColor,
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
        </div>
    );
}
