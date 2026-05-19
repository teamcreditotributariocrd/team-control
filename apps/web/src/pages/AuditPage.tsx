import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageOverlayLoading from "../components/PageOverlayLoading";
import MonthPicker from "./_shared/MonthPicker";
import { apiGet } from "../lib/api";
import type { AuditResponse } from "../types";

function flagLabel(flag: string) {
    if (flag === "SEM_SENHA") return "Sem senha";
    if (flag === "SEM_META_MENSAL") return "Sem meta";
    if (flag === "SEM_UST_CONTABILIZADA") return "Sem UST";
    if (flag === "COM_INCONSISTENCIAS") return "Com inconsistencias";
    return flag;
}

export default function AuditPage({ session }: { session: any }) {
    const nav = useNavigate();
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [data, setData] = useState<AuditResponse | null>(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    async function refresh() {
        setLoading(true);
        setErr("");
        try {
            const out = await apiGet<AuditResponse>(`/api/ust/audit?month=${month}`, session);
            setData(out);
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

    return (
        <div>
            <PageOverlayLoading show={loading} label={`Auditando ${month}...`} />

            <div className="pageHeader">
                <div>
                    <div className="h1">Auditoria</div>
                    <div className="muted">Saude do mes: metas, senhas, UST e inconsistencias</div>
                </div>
                <div className="pageHeaderRight">
                    <MonthPicker month={month} setMonth={setMonth} />
                    <button className="btn ghost" onClick={refresh} disabled={loading}>
                        Atualizar
                    </button>
                </div>
            </div>

            {err && <div className="alert">{err}</div>}

            {data && (
                <>
                    <div className="grid4">
                        <div className="card">
                            <div className="muted small">Colaboradores</div>
                            <div className="kpi">{data.totals.collaborators}</div>
                        </div>
                        <div className="card">
                            <div className="muted small">Sem meta</div>
                            <div className="kpi">{data.totals.withoutGoal}</div>
                        </div>
                        <div className="card">
                            <div className="muted small">Sem UST</div>
                            <div className="kpi">{data.totals.withoutUst}</div>
                        </div>
                        <div className="card">
                            <div className="muted small">Inconsistencias</div>
                            <div className="kpi">{data.totals.unmappedCount}</div>
                        </div>
                    </div>

                    <div className="card" style={{ marginTop: 14 }}>
                        <div className="cardTitle">Colaboradores</div>
                        <div className="tableWrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Nome</th>
                                        <th>Meta</th>
                                        <th>UST</th>
                                        <th>%</th>
                                        <th>Tasks</th>
                                        <th>Inconsistencias</th>
                                        <th>Status</th>
                                        <th>Acoes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((r) => (
                                        <tr key={r.uniqueName}>
                                            <td>
                                                <div className="strong">{r.displayName}</div>
                                                <div className="muted small mono">{r.uniqueName}</div>
                                            </td>
                                            <td>{r.goal}</td>
                                            <td>{r.totalUst}</td>
                                            <td>{r.pct.toFixed(1)}%</td>
                                            <td>{r.mappedCount}</td>
                                            <td>
                                                <div>{r.unmappedCount}</div>
                                                <div className="muted small">
                                                    {Object.entries(r.issues).map(([k, v]) => `${k}: ${v}`).join(" / ") || "-"}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                    {r.flags.length ? r.flags.map((f) => <span className="pill warn" key={f}>{flagLabel(f)}</span>) : <span className="pill ok">OK</span>}
                                                </div>
                                            </td>
                                            <td style={{ whiteSpace: "nowrap" }}>
                                                <button className="btn ghost small" onClick={() => nav(`/user/${encodeURIComponent(r.uniqueName)}?month=${month}`)}>
                                                    Detalhar
                                                </button>{" "}
                                                <button className="btn ghost small" onClick={() => nav("/settings")}>
                                                    Configurar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
