import React, { useEffect, useState } from "react";
import PageOverlayLoading from "../components/PageOverlayLoading";
import { apiGet, apiSend } from "../lib/api";
import type { Collaborator, DiscordDailySchedule, Role, TfsSupportBugConfig } from "../types";

type CollaboratorForm = Omit<Collaborator, "id" | "hasPassword"> & {
    id?: string;
    password?: string;
    goalMonth?: string;
};

export default function SettingsPage({ session }: { session: any }) {
    const [list, setList] = useState<Collaborator[]>([]);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);
    const [goalMonth, setGoalMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [matrixStartMonth, setMatrixStartMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [matrixMonths, setMatrixMonths] = useState(6);
    const [goalDrafts, setGoalDrafts] = useState<Record<string, Record<string, number>>>({});
    const [dailySchedule, setDailySchedule] = useState<DiscordDailySchedule | null>(null);
    const [supportBugConfig, setSupportBugConfig] = useState<TfsSupportBugConfig | null>(null);
    const [scheduleDraft, setScheduleDraft] = useState<{ enabled: boolean; times: string[] }>({
        enabled: true,
        times: ["09:00", "15:00"],
    });
    const [supportBugIterationDraft, setSupportBugIterationDraft] = useState("");

    const [form, setForm] = useState<CollaboratorForm>({
        displayName: "",
        uniqueName: "FAZENDA\\",
        monthlyGoalUst: 0,
        isActive: true,
        role: "member",
        password: "",
        goalMonth,
    });

    function emptyForm(month = goalMonth): CollaboratorForm {
        return {
            displayName: "",
            uniqueName: "FAZENDA\\",
            monthlyGoalUst: 0,
            monthlyGoalsUst: {},
            isActive: true,
            role: "member",
            password: "",
            goalMonth: month,
        };
    }

    function addMonths(month: string, delta: number) {
        const [year, monthNumber] = month.split("-").map(Number);
        const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
        return date.toISOString().slice(0, 7);
    }

    const matrixMonthList = Array.from({ length: matrixMonths }, (_, index) => addMonths(matrixStartMonth, index));

    function getDraftGoal(collaborator: Collaborator, month: string) {
        return goalDrafts[collaborator.id]?.[month] ?? collaborator.monthlyGoalsUst?.[month] ?? collaborator.monthlyGoalUst ?? 0;
    }

    async function refresh() {
        setLoading(true);
        setErr("");
        try {
            const d = await apiGet<Collaborator[]>("/api/collaborators", session);
            setList(d);
            const schedule = await apiGet<DiscordDailySchedule>("/api/discord-daily-schedule", session);
            setDailySchedule(schedule);
            setScheduleDraft({ enabled: schedule.enabled, times: schedule.times.length ? schedule.times : ["09:00", "15:00"] });
            const bugConfig = await apiGet<TfsSupportBugConfig>("/api/tfs-support-bug-config", session);
            setSupportBugConfig(bugConfig);
            setSupportBugIterationDraft(bugConfig.iterationPath);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const next: Record<string, Record<string, number>> = {};
        for (const collaborator of list) {
            next[collaborator.id] = {};
            for (const month of matrixMonthList) {
                next[collaborator.id][month] = collaborator.monthlyGoalsUst?.[month] ?? collaborator.monthlyGoalUst ?? 0;
            }
        }
        setGoalDrafts(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list, matrixStartMonth, matrixMonths]);

    async function save() {
        if (form.password && form.password.length < 6) {
            setErr("A senha precisa ter pelo menos 6 caracteres.");
            return;
        }

        setLoading(true);
        setErr("");
        try {
            await apiSend<Collaborator>("/api/collaborators", "POST", { ...form, goalMonth }, session);
            setForm(emptyForm());
            await refresh();
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function remove(id: string) {
        setLoading(true);
        setErr("");
        try {
            await apiSend(`/api/collaborators/${id}`, "DELETE", {}, session);
            await refresh();
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function saveGoalMatrix() {
        setLoading(true);
        setErr("");
        try {
            for (const collaborator of list) {
                const monthlyGoalsUst = { ...(collaborator.monthlyGoalsUst ?? {}) };
                for (const month of matrixMonthList) {
                    monthlyGoalsUst[month] = Number(goalDrafts[collaborator.id]?.[month] ?? 0);
                }

                await apiSend<Collaborator>("/api/collaborators", "POST", {
                    id: collaborator.id,
                    displayName: collaborator.displayName,
                    uniqueName: collaborator.uniqueName,
                    monthlyGoalUst: collaborator.monthlyGoalUst,
                    monthlyGoalsUst,
                    isActive: collaborator.isActive,
                    role: collaborator.role,
                }, session);
            }
            await refresh();
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function saveDailySchedule() {
        setLoading(true);
        setErr("");
        try {
            const times = Array.from(new Set(scheduleDraft.times.filter(Boolean))).sort();
            const saved = await apiSend<DiscordDailySchedule>("/api/discord-daily-schedule", "PUT", {
                enabled: scheduleDraft.enabled,
                times: times.length ? times : ["09:00"],
            }, session);
            setDailySchedule(saved);
            setScheduleDraft({ enabled: saved.enabled, times: saved.times });
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function runDailyNow() {
        setLoading(true);
        setErr("");
        try {
            const saved = await apiSend<DiscordDailySchedule>("/api/discord-daily-schedule/run-now", "POST", {}, session);
            setDailySchedule(saved);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
            await refresh();
        } finally {
            setLoading(false);
        }
    }

    async function saveSupportBugConfig() {
        setLoading(true);
        setErr("");
        try {
            const saved = await apiSend<TfsSupportBugConfig>("/api/tfs-support-bug-config", "PUT", {
                iterationPath: supportBugIterationDraft,
            }, session);
            setSupportBugConfig(saved);
            setSupportBugIterationDraft(saved.iterationPath);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <PageOverlayLoading show={loading} label="Salvando..." />

            <div className="pageHeader">
                <div>
                    <div className="h1">Configuracoes</div>
                    <div className="muted">Colaboradores, senhas, roles e metas mensais</div>
                </div>
                <div className="pageHeaderRight">
                    <button className="btn ghost" onClick={refresh} disabled={loading}>
                        Atualizar
                    </button>
                </div>
            </div>

            {err && <div className="alert">{err}</div>}

            <div className="card" style={{ marginBottom: 14 }}>
                <div className="pageHeader" style={{ marginBottom: 12, paddingBottom: 12 }}>
                    <div>
                        <div className="cardTitle" style={{ marginBottom: 4 }}>Relatorio Discord diario</div>
                        <div className="muted small">Agenda o script sendDiscordDaily.mjs para enviar o progresso do time.</div>
                    </div>
                    <div className="pageHeaderRight">
                        <button className="btn ghost" onClick={runDailyNow} disabled={loading}>
                            Enviar agora
                        </button>
                        <button className="btn primary" onClick={saveDailySchedule} disabled={loading}>
                            Salvar agenda
                        </button>
                    </div>
                </div>

                <div className="grid2">
                    <div>
                        <label className="check" style={{ marginBottom: 12 }}>
                            <input
                                type="checkbox"
                                checked={scheduleDraft.enabled}
                                onChange={(e) => setScheduleDraft((current) => ({ ...current, enabled: e.target.checked }))}
                            />
                            Ativar envio automatico
                        </label>
                        <div className="row2">
                            {scheduleDraft.times.map((time, index) => (
                                <div key={`daily-time-${index}`}>
                                    <div className="label">Horario {index + 1}</div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <input
                                            className="input"
                                            type="time"
                                            value={time}
                                            onChange={(e) => {
                                                const next = [...scheduleDraft.times];
                                                next[index] = e.target.value;
                                                setScheduleDraft((current) => ({ ...current, times: next }));
                                            }}
                                        />
                                        <button
                                            className="btn ghost"
                                            disabled={scheduleDraft.times.length <= 1}
                                            onClick={() => setScheduleDraft((current) => ({
                                                ...current,
                                                times: current.times.filter((_, i) => i !== index),
                                            }))}
                                        >
                                            Remover
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            className="btn ghost"
                            style={{ marginTop: 10 }}
                            onClick={() => setScheduleDraft((current) => ({ ...current, times: [...current.times, "09:00"] }))}
                            disabled={scheduleDraft.times.length >= 8}
                        >
                            Adicionar horario
                        </button>
                    </div>
                    <div>
                        <div className="label">Ultima execucao</div>
                        <div className="card" style={{ padding: 12 }}>
                            <div className="strong">
                                {dailySchedule?.lastRunAt ? new Date(dailySchedule.lastRunAt).toLocaleString() : "Ainda nao executou"}
                            </div>
                            <div style={{ marginTop: 8 }}>
                                <span className={`pill ${dailySchedule?.lastRunStatus === "OK" ? "ok" : dailySchedule?.lastRunStatus === "ERROR" ? "bad" : ""}`}>
                                    {dailySchedule?.lastRunStatus ?? "SEM STATUS"}
                                </span>
                            </div>
                            <div className="muted small" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                                {dailySchedule?.lastRunMessage ?? "Use Enviar agora para validar o webhook e o relatorio."}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
                <div className="pageHeader" style={{ marginBottom: 12, paddingBottom: 12 }}>
                    <div>
                        <div className="cardTitle" style={{ marginBottom: 4 }}>Bug de suporte no TFS</div>
                        <div className="muted small">Destino usado pelo botao Criar bug na tela de incidentes.</div>
                    </div>
                    <div className="pageHeaderRight">
                        <button className="btn primary" onClick={saveSupportBugConfig} disabled={loading || !supportBugIterationDraft.trim()}>
                            Salvar iteration
                        </button>
                    </div>
                </div>

                <div className="grid2">
                    <div>
                        <div className="label">Area fixa</div>
                        <input className="input" value={supportBugConfig?.areaPath ?? "CSIS-G07\\SUPORTE\\CRD"} disabled />
                    </div>
                    <div>
                        <div className="label">Iteration atual</div>
                        <input
                            className="input"
                            value={supportBugIterationDraft}
                            onChange={(e) => setSupportBugIterationDraft(e.target.value)}
                            placeholder="CSIS-G07\CRD - SUP - Sprint 95"
                        />
                        <div className="muted small" style={{ marginTop: 8 }}>
                            {supportBugConfig?.updatedAt ? `Atualizada em ${new Date(supportBugConfig.updatedAt).toLocaleString()}` : "Usando configuracao inicial."}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
                <div className="pageHeader" style={{ marginBottom: 12, paddingBottom: 12 }}>
                    <div>
                        <div className="cardTitle" style={{ marginBottom: 4 }}>Metas UST por mes</div>
                        <div className="muted small">Edite as metas mensais dos colaboradores ativos em lote.</div>
                    </div>
                    <div className="pageHeaderRight">
                        <div>
                            <div className="label">Mes inicial</div>
                            <input className="input" type="month" value={matrixStartMonth} onChange={(e) => setMatrixStartMonth(e.target.value)} />
                        </div>
                        <div>
                            <div className="label">Periodo</div>
                            <select className="input" value={matrixMonths} onChange={(e) => setMatrixMonths(Number(e.target.value))}>
                                <option value={3}>3 meses</option>
                                <option value={6}>6 meses</option>
                                <option value={12}>12 meses</option>
                            </select>
                        </div>
                        <button className="btn primary" onClick={saveGoalMatrix} disabled={loading || list.length === 0}>
                            Salvar metas
                        </button>
                    </div>
                </div>

                <div className="tableWrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                {matrixMonthList.map((month) => (
                                    <th key={month}>{month}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {list.filter((c) => c.isActive).map((collaborator) => (
                                <tr key={`goal-${collaborator.id}`}>
                                    <td>
                                        <div className="strong">{collaborator.displayName}</div>
                                        <div className="muted small mono">{collaborator.uniqueName}</div>
                                    </td>
                                    {matrixMonthList.map((month) => (
                                        <td key={`${collaborator.id}-${month}`} style={{ minWidth: 120 }}>
                                            <input
                                                className="input"
                                                type="number"
                                                min={0}
                                                value={getDraftGoal(collaborator, month)}
                                                onChange={(e) => {
                                                    const value = Number(e.target.value);
                                                    setGoalDrafts((current) => ({
                                                        ...current,
                                                        [collaborator.id]: {
                                                            ...(current[collaborator.id] ?? {}),
                                                            [month]: Number.isFinite(value) ? value : 0,
                                                        },
                                                    }));
                                                }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid2">
                <div className="card">
                    <div className="cardTitle">Adicionar ou atualizar colaborador</div>

                    <div className="label">Nome</div>
                    <input className="input" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />

                    <div className="label" style={{ marginTop: 10 }}>Login</div>
                    <input className="input" value={form.uniqueName} onChange={(e) => setForm((f) => ({ ...f, uniqueName: e.target.value }))} />

                    <div className="row2" style={{ marginTop: 10 }}>
                        <div>
                            <div className="label">Mes da meta</div>
                            <input
                                className="input"
                                type="month"
                                value={goalMonth}
                                onChange={(e) => {
                                    const nextMonth = e.target.value;
                                    setGoalMonth(nextMonth);
                                    setForm((f) => ({
                                        ...f,
                                        goalMonth: nextMonth,
                                        monthlyGoalUst: f.monthlyGoalsUst?.[nextMonth] ?? f.monthlyGoalUst ?? 0,
                                    }));
                                }}
                            />
                        </div>
                        <div>
                            <div className="label">Meta do mes (UST)</div>
                            <input className="input" type="number" min={0} value={form.monthlyGoalUst} onChange={(e) => setForm((f) => ({ ...f, monthlyGoalUst: Number(e.target.value) }))} />
                        </div>
                    </div>

                    <div className="row2" style={{ marginTop: 10 }}>
                        <div>
                            <div className="label">Role</div>
                            <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
                                <option value="member">member</option>
                                <option value="admin">admin</option>
                            </select>
                        </div>
                    </div>

                    <div className="label" style={{ marginTop: 10 }}>Nova senha</div>
                    <input
                        className="input"
                        type="password"
                        value={form.password ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Minimo 6 caracteres. Deixe vazio para manter a senha atual"
                    />

                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <label className="check">
                            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                            Ativo
                        </label>
                        <button className="btn primary" onClick={save} disabled={loading}>
                            Salvar
                        </button>
                    </div>
                </div>

                <div className="card">
                    <div className="cardTitle">Colaboradores</div>
                    <div className="tableWrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Login</th>
                                    <th>Meta</th>
                                    <th>Role</th>
                                    <th>Senha</th>
                                    <th>Ativo</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((c) => (
                                    <tr key={c.id}>
                                        <td className="strong">{c.displayName}</td>
                                        <td className="mono">{c.uniqueName}</td>
                                        <td>{c.monthlyGoalsUst?.[goalMonth] ?? c.monthlyGoalUst}</td>
                                        <td>{c.role}</td>
                                        <td>{c.hasPassword ? "Configurada" : "Pendente"}</td>
                                        <td>{c.isActive ? "Sim" : "Nao"}</td>
                                        <td style={{ whiteSpace: "nowrap" }}>
                                            <button
                                                className="btn ghost small"
                                                onClick={() => setForm({
                                                    ...c,
                                                    monthlyGoalUst: c.monthlyGoalsUst?.[goalMonth] ?? c.monthlyGoalUst,
                                                    goalMonth,
                                                    password: "",
                                                })}
                                            >
                                                Editar
                                            </button>{" "}
                                            <button className="btn danger small" onClick={() => remove(c.id)}>
                                                Remover
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
