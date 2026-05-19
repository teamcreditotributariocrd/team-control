import React, { useEffect, useState } from "react";
import PageOverlayLoading from "../components/PageOverlayLoading";
import { apiGet, authHeaders } from "../lib/api";

export default function MeetingsPage({ session }: { session: any }) {
    const [list, setList] = useState<any[]>([]);
    const [detail, setDetail] = useState<any | null>(null);
    const [title, setTitle] = useState("Daily Scrum");
    const [statusText, setStatusText] = useState<string>("");
    const [err, setErr] = useState<string>("");
    const [loading, setLoading] = useState(false);

    async function refresh() {
        setLoading(true);
        setErr("");
        try {
            const data = await apiGet<any[]>("/api/meetings", session);
            setList(data);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function open(id: string) {
        setLoading(true);
        setErr("");
        try {
            const d = await apiGet<any>(`/api/meetings/${id}`, session);
            setDetail(d);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function uploadMeetingFile(file: File) {
        setLoading(true);
        setErr("");
        setStatusText("Enviando arquivo...");
        try {
            const form = new FormData();
            form.append("file", file);

            const res = await fetch(`/api/meetings/upload?title=${encodeURIComponent(title)}`, {
                method: "POST",
                headers: authHeaders(session),
                body: form,
            });

            const raw = await res.text();
            let data: any = null;
            try { data = raw ? JSON.parse(raw) : null; } catch { }
            if (!res.ok) throw new Error(data?.error ?? data?.message ?? raw ?? `HTTP ${res.status}`);

            setStatusText(`Upload OK (${data.inputKind}). Processando...`);
            await processMeeting(data.meetingId);
            await refresh();
            await open(data.meetingId);
            setStatusText("Pronto.");
        } catch (e: any) {
            setErr(String(e?.message ?? e));
            setStatusText("");
        } finally {
            setLoading(false);
        }
    }

    async function processMeeting(id: string) {
        const res = await fetch(`/api/meetings/${id}/process`, {
            method: "POST",
            headers: authHeaders(session),
        });

        const raw = await res.text();
        let data: any = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { }
        if (!res.ok) throw new Error(data?.error ?? data?.message ?? raw ?? `HTTP ${res.status}`);

        const start = Date.now();
        const maxMs = 30 * 60 * 1000;

        while (Date.now() - start < maxMs) {
            await new Promise((r) => setTimeout(r, 2000));

            const stRes = await fetch(`/api/meetings/${id}/status`, {
                headers: authHeaders(session),
            });

            const stRaw = await stRes.text();
            const st = JSON.parse(stRaw);

            setStatusText(`Processando... (${st.status})`);

            if (st.status === "READY") return;
            if (st.status === "ERROR") throw new Error(st.errorStage ? `${st.errorStage}: ${st.error || "Erro"}` : (st.error || "Erro"));
        }

        throw new Error("Timeout: processamento demorou demais.");
    }

    async function deleteMeeting(id: string, deleteFiles: boolean) {
        const label = deleteFiles ? "excluir do historico e apagar arquivos" : "excluir do historico";
        const ok = confirm(`Confirmar: ${label} desta reuniao?`);
        if (!ok) return;

        setLoading(true);
        setErr("");
        try {
            const res = await fetch(`/api/meetings/${id}?deleteFiles=${deleteFiles ? "true" : "false"}`, {
                method: "DELETE",
                headers: authHeaders(session),
            });

            const raw = await res.text();
            let data: any = null;
            try { data = raw ? JSON.parse(raw) : null; } catch { }
            if (!res.ok) throw new Error(data?.error ?? data?.message ?? raw ?? `HTTP ${res.status}`);

            // se o detalhe aberto era esse, limpa
            if (detail?.meeting?.id === id) setDetail(null);

            await refresh();
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function clearMeetings(status?: string, before?: string, deleteFiles?: boolean) {
        const qs = new URLSearchParams();
        if (status) qs.set("status", status);
        if (before) qs.set("before", before);
        if (deleteFiles) qs.set("deleteFiles", "true");

        const text = [
            "Confirmar limpeza em massa?",
            status ? `- status=${status}` : "- status=ALL",
            before ? `- before=${before}` : "",
            deleteFiles ? "- apagar arquivos=SIM" : "- apagar arquivos=NAO",
        ].filter(Boolean).join("\n");

        const ok = confirm(text);
        if (!ok) return;

        setLoading(true);
        setErr("");
        try {
            const res = await fetch(`/api/meetings/clear?${qs.toString()}`, {
                method: "DELETE",
                headers: authHeaders(session),
            });

            const raw = await res.text();
            let data: any = null;
            try { data = raw ? JSON.parse(raw) : null; } catch { }
            if (!res.ok) throw new Error(data?.error ?? data?.message ?? raw ?? `HTTP ${res.status}`);

            setDetail(null);
            await refresh();
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

    return (
        <div>
            <PageOverlayLoading show={loading} label="Trabalhando..." />

            <div className="pageHeader">
                <div>
                    <div className="h1">Reunioes (Craig)</div>
                    <div className="muted">Upload, transcricao, sugestoes e revisao</div>
                </div>
                <div className="pageHeaderRight">
                    <button className="btn ghost" onClick={refresh} disabled={loading}>
                        Atualizar
                    </button>
                </div>
            </div>

            {err && <div className="alert">{err}</div>}

            <div className="grid2">
                <div className="card">
                    <div className="cardTitle">1) Upload (WAV single-track ou ZIP)</div>
                    <div className="label">Titulo</div>
                    <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />

                    <div style={{ marginTop: 10 }}>
                        <input
                            className="input"
                            type="file"
                            accept=".zip,.wav,.flac,.mp3,.m4a,.ogg,.opus"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadMeetingFile(f);
                            }}
                        />
                    </div>

                    <div className="muted small" style={{ marginTop: 10 }}>
                        {statusText || "Recomendado: Craig Single-track WAV (1 arquivo). ZIP multi-track e mais lento."}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn danger" disabled={loading} onClick={() => clearMeetings("ERROR", undefined, false)}>
                            Limpar erros (historico)
                        </button>
                        <button className="btn danger" disabled={loading} onClick={() => clearMeetings("ERROR", undefined, true)}>
                            Limpar erros + arquivos
                        </button>
                    </div>
                </div>

                <div className="card">
                    <div className="cardTitle">2) Historico</div>
                    <div className="tableWrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Titulo</th>
                                    <th>Status</th>
                                    <th style={{ width: 260 }}>Acoes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((m) => (
                                    <tr key={m.id} className="rowLink" onClick={() => open(m.id)}>
                                        <td className="mono">{String(m.execDate ?? m.createdAt).slice(0, 10)}</td>
                                        <td>{m.title}</td>
                                        <td className="mono">
                                            {m.status}
                                            {m.status === "ERROR" ? (
                                                <div className="muted small">{m.errorStage ? `${m.errorStage}: ` : ""}{m.error ?? ""}</div>
                                            ) : null}
                                        </td>
                                        <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                                            <button className="btn ghost small" disabled={loading} onClick={() => deleteMeeting(m.id, false)}>
                                                Excluir
                                            </button>{" "}
                                            <button className="btn danger small" disabled={loading} onClick={() => deleteMeeting(m.id, true)}>
                                                Excluir + arquivos
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!list.length && (
                                    <tr>
                                        <td colSpan={4} className="muted small" style={{ padding: 12 }}>
                                            Nenhuma reuniao ainda.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="muted small" style={{ marginTop: 10 }}>
                        Excluir remove do historico. Excluir + arquivos tambem apaga a pasta em <span className="mono">data/meetings/&lt;id&gt;</span>.
                    </div>
                </div>
            </div>

            {detail && (
                <div className="card" style={{ marginTop: 12 }}>
                    <div className="cardTitle">3) Resultado</div>

                    {detail.meeting?.status === "ERROR" ? (
                        <div className="alert">
                            <b>Erro:</b> {detail.meeting.errorStage ? `${detail.meeting.errorStage}: ` : ""}{detail.meeting.error ?? "Sem mensagem"}
                            {detail.meeting.errorDetails ? (
                                <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{detail.meeting.errorDetails}</pre>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="grid2">
                        <div>
                            <div className="label">Transcricao diarizada</div>
                            <textarea
                                className="input"
                                style={{ height: 300, fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}
                                value={detail.diarized ?? ""}
                                readOnly
                            />
                        </div>

                        <div>
                            <div className="label">Sugestoes (JSON)</div>
                            <textarea
                                className="input"
                                style={{ height: 300, fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}
                                value={detail.suggestions ? JSON.stringify(detail.suggestions, null, 2) : ""}
                                readOnly
                            />
                        </div>
                    </div>

                    <div className="muted small" style={{ marginTop: 10 }}>
                        Upgrade futuro: editar sugestoes, aprovar e criar tasks no TFS.
                    </div>
                </div>
            )}
        </div>
    );
}

