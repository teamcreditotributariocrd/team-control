import React, { useEffect, useMemo, useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { apiGet } from "../lib/api";
import type { Collaborator } from "../types";

type WorkDaysByCollaborator = Record<string, number>;
const DEFAULT_WORK_DAYS = 30;

export default function UstCalculationPage({ session }: { session: any }) {
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [monthWorkDays, setMonthWorkDays] = useState(DEFAULT_WORK_DAYS);
    const [workDays, setWorkDays] = useState<WorkDaysByCollaborator>({});
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    async function refresh() {
        setLoading(true);
        setErr("");
        try {
            const rows = await apiGet<Collaborator[]>("/api/collaborators", session);
            const activeRows = rows.filter((row) => row.isActive);
            setCollaborators(activeRows);
            setWorkDays((current) => {
                const next = { ...current };
                for (const row of activeRows) {
                    if (next[row.id] == null) next[row.id] = monthWorkDays;
                }
                return next;
            });
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    useEffect(() => {
        const defaultDays = DEFAULT_WORK_DAYS;
        setMonthWorkDays(defaultDays);
        setWorkDays((current) => {
            const next: WorkDaysByCollaborator = {};
            for (const row of collaborators) next[row.id] = current[row.id] ?? defaultDays;
            return next;
        });
    }, [month]);

    const rows = useMemo(() => {
        return collaborators.map((collaborator) => {
            const goal = getGoalForMonth(collaborator, month);
            const days = clampNumber(workDays[collaborator.id] ?? 0, 0, monthWorkDays || 0);
            const dailyUst = monthWorkDays > 0 ? goal / monthWorkDays : 0;
            const proportionalUst = dailyUst * days;

            return {
                collaborator,
                goal,
                days,
                dailyUst,
                proportionalUst,
                absenceDays: Math.max(0, monthWorkDays - days),
            };
        });
    }, [collaborators, month, monthWorkDays, workDays]);

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, row) => ({
                goal: acc.goal + row.goal,
                proportionalUst: acc.proportionalUst + row.proportionalUst,
                workDays: acc.workDays + row.days,
            }),
            { goal: 0, proportionalUst: 0, workDays: 0 }
        );
    }, [rows]);

    function resetWorkedDays() {
        const next: WorkDaysByCollaborator = {};
        for (const row of collaborators) next[row.id] = monthWorkDays;
        setWorkDays(next);
    }

    return (
        <div>
            <div className="pageHeader">
                <div>
                    <div className="h1">Calculo de UST por Colaborador</div>
                    <div className="muted">Calcule a meta proporcional pela quantidade de dias trabalhados no mes.</div>
                </div>
                <div className="pageHeaderRight">
                    <button className="btn ghost" onClick={resetWorkedDays}>
                        <RotateCcw size={16} />
                        Preencher mes completo
                    </button>
                </div>
            </div>

            {err ? <div className="alert">{err}</div> : null}

            <section className="grid4" style={{ marginBottom: 14 }}>
                <div className="card">
                    <div className="muted small">Colaboradores</div>
                    <div className="kpi">{rows.length}</div>
                </div>
                <div className="card">
                    <div className="muted small">Dias base do mes</div>
                    <div className="kpi">{monthWorkDays}</div>
                </div>
                <div className="card">
                    <div className="muted small">Meta mensal</div>
                    <div className="kpi">{formatNumber(totals.goal)}</div>
                </div>
                <div className="card">
                    <div className="muted small">Meta proporcional</div>
                    <div className="kpi">{formatNumber(totals.proportionalUst)}</div>
                </div>
            </section>

            <section className="card" style={{ marginBottom: 14 }}>
                <div className="grid3">
                    <div>
                        <div className="label">Mes de referencia</div>
                        <input
                            className="input"
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                        />
                    </div>
                    <div>
                        <div className="label">Dias base do mes</div>
                        <input
                            className="input"
                            type="number"
                            min={1}
                            step={1}
                            value={monthWorkDays}
                            onChange={(e) => setMonthWorkDays(Math.max(1, Number(e.target.value) || 1))}
                        />
                    </div>
                    <div>
                        <div className="label">Formula</div>
                        <div className="pill" style={{ minHeight: 42, width: "100%", justifyContent: "center" }}>
                            <Calculator size={16} />
                            Meta mensal / dias base x dias trabalhados
                        </div>
                    </div>
                </div>
                <div style={{ marginTop: 14 }}>
                    <div className="label">Total UST proporcional</div>
                    <input className="input" readOnly value={formatNumber(totals.proportionalUst)} />
                </div>
            </section>

            <section className="card">
                <div className="cardTitle">Colaboradores</div>
                {loading ? <div className="muted">Carregando colaboradores...</div> : null}
                <div className="tableWrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                <th>Meta mensal</th>
                                <th>Dias trabalhados</th>
                                <th>Dias nao trabalhados</th>
                                <th>UST/dia</th>
                                <th>UST proporcional</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.collaborator.id}>
                                    <td>
                                        <div className="strong">{row.collaborator.displayName}</div>
                                        <div className="muted small mono">{row.collaborator.uniqueName}</div>
                                    </td>
                                    <td>{formatNumber(row.goal)}</td>
                                    <td style={{ minWidth: 150 }}>
                                        <input
                                            className="input"
                                            type="number"
                                            min={0}
                                            max={monthWorkDays}
                                            step={0.5}
                                            value={workDays[row.collaborator.id] ?? 0}
                                            onChange={(e) => {
                                                const value = clampNumber(Number(e.target.value), 0, monthWorkDays);
                                                setWorkDays((current) => ({ ...current, [row.collaborator.id]: value }));
                                            }}
                                        />
                                    </td>
                                    <td>{formatNumber(row.absenceDays)}</td>
                                    <td>{formatNumber(row.dailyUst)}</td>
                                    <td>
                                        <span className="pill ok">{formatNumber(row.proportionalUst)} UST</span>
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && !loading ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="emptyState">Nenhum colaborador ativo encontrado.</div>
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

function getGoalForMonth(collaborator: Collaborator, month: string) {
    return collaborator.monthlyGoalsUst?.[month] ?? collaborator.monthlyGoalUst ?? 0;
}

function clampNumber(value: number, min: number, max: number) {
    const normalized = Number.isFinite(value) ? value : min;
    return Math.min(Math.max(normalized, min), max);
}

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2,
    });
}
