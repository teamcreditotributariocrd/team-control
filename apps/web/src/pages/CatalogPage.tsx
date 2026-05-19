import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import PageOverlayLoading from "../components/PageOverlayLoading";
import { authHeaders } from "../lib/api";
import type { CatalogPageResponse, FavoriteCatalogResponse } from "../types";

export default function CatalogPage({ session }: { session: any }) {
    const [q, setQ] = useState("");
    const [code, setCode] = useState("");
    const [page, setPage] = useState<CatalogPageResponse | null>(null);
    const [offset, setOffset] = useState(0);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);
    const [favoriteCodes, setFavoriteCodes] = useState<number[]>([]);
    const [savingFavorite, setSavingFavorite] = useState<number | null>(null);
    const [importStatus, setImportStatus] = useState<string>("");

    async function loadFavorites() {
        const res = await fetch("/api/favorites", {
            headers: authHeaders(session),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(data));
        setFavoriteCodes((data as FavoriteCatalogResponse).codes ?? []);
    }

    async function load(off = 0) {
        setLoading(true);
        setErr("");
        try {
            const qs = new URLSearchParams();
            if (q.trim()) qs.set("q", q.trim());
            qs.set("offset", String(off));
            qs.set("limit", "50");

            const res = await fetch(`/api/catalog?${qs.toString()}`, {
                headers: authHeaders(session),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data));
            setPage(data);
            setOffset(off);
            await loadFavorites();
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function loadByCode() {
        const c = Number(code);
        if (!Number.isFinite(c) || c <= 0) {
            setErr("Codigo invalido.");
            return;
        }
        setLoading(true);
        setErr("");
        try {
            const res = await fetch(`/api/catalog/${c}`, {
                headers: authHeaders(session),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data));
            setPage({ total: 1, offset: 0, limit: 1, rows: [data] });
            setOffset(0);
            await loadFavorites();
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function toggleFavorite(codigo: number) {
        const isFavorite = favoriteCodes.includes(codigo);
        setSavingFavorite(codigo);
        setErr("");
        try {
            const res = await fetch(`/api/favorites/${codigo}`, {
                method: isFavorite ? "DELETE" : "POST",
                headers: authHeaders(session),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data));
            setFavoriteCodes((data as FavoriteCatalogResponse).codes ?? []);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setSavingFavorite(null);
        }
    }

    async function importCatalog(file: File) {
        setLoading(true);
        setErr("");
        setImportStatus("Importando e substituindo catalogo...");
        try {
            const form = new FormData();
            form.append("file", file);

            const res = await fetch("/api/catalog/import", {
                method: "POST",
                headers: authHeaders(session),
                body: form,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data));

            setImportStatus(`OK - catalogo substituido: ${data.totalImported} linhas (${data.sheetName})`);
            await load(0);
        } catch (e: any) {
            setImportStatus("");
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div>
            <PageOverlayLoading show={loading} label="Carregando catalogo..." />

            <div className="pageHeader">
                <div>
                    <div className="h1">Catalogo</div>
                    <div className="muted">Consulta de atividades UST e favoritos do usuario</div>
                </div>
                <div className="pageHeaderRight">
                    <button className="btn ghost" onClick={() => load(offset)} disabled={loading}>
                        Atualizar
                    </button>
                </div>
            </div>

            {err && <div className="alert">{err}</div>}

            <div className="grid2">
                {session.role === "admin" && (
                    <div className="card">
                        <div className="cardTitle">Importar XLSX</div>
                        <div className="muted small">Este upload substitui todo o catalogo armazenado.</div>

                        <div style={{ marginTop: 12 }}>
                            <input
                                className="input"
                                type="file"
                                accept=".xlsx"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) importCatalog(f);
                                }}
                            />
                        </div>

                        <div className="muted small" style={{ marginTop: 10 }}>
                            {importStatus || "Selecione o arquivo XLSX do catalogo."}
                        </div>
                    </div>
                )}

                <div className="card">
                    <div className="cardTitle">Busca</div>
                    <div className="row2">
                        <div>
                            <div className="label">Texto</div>
                            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="grupo, atividade, complexidade, ust..." />
                        </div>
                        <div>
                            <div className="label">Codigo</div>
                            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex: 208" />
                        </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn primary" onClick={() => load(0)} disabled={loading}>
                            Pesquisar
                        </button>
                        <button className="btn ghost" onClick={loadByCode} disabled={loading}>
                            Buscar codigo
                        </button>
                    </div>
                </div>
            </div>

            {page && (
                <div className="card" style={{ marginTop: 12 }}>
                    <div className="muted small">
                        Total: {page.total} | Pagina: {Math.floor(page.offset / page.limit) + 1}
                    </div>

                    <div className="tableWrap" style={{ marginTop: 10 }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Codigo</th>
                                    <th>Favorito</th>
                                    <th>Grupo</th>
                                    <th>Subgrupo</th>
                                    <th>Atividade</th>
                                    <th>Tipo</th>
                                    <th>Complexidade</th>
                                    <th>UST</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page.rows.map((r) => (
                                    <tr key={`${r.codigo}-${r.complexidade}`}>
                                        <td className="mono">{r.codigo}</td>
                                        <td>
                                            <button
                                                className="btn small ghost"
                                                title={favoriteCodes.includes(r.codigo) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                                onClick={() => toggleFavorite(r.codigo)}
                                                disabled={savingFavorite === r.codigo}
                                                style={{
                                                    color: favoriteCodes.includes(r.codigo) ? "#FEDF89" : undefined,
                                                    minWidth: 36,
                                                }}
                                            >
                                                <Star size={15} fill={favoriteCodes.includes(r.codigo) ? "currentColor" : "none"} />
                                            </button>
                                        </td>
                                        <td>{r.grupo}</td>
                                        <td style={{ maxWidth: 560 }}>{r.subgrupo}</td>
                                        <td>{r.atividade}</td>
                                        <td>{r.tipo}</td>
                                        <td>{r.complexidade}</td>
                                        <td>{r.ust}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn ghost" disabled={loading || offset <= 0} onClick={() => load(Math.max(0, offset - 50))}>
                            Anterior
                        </button>
                        <button className="btn ghost" disabled={loading || offset + 50 >= page.total} onClick={() => load(offset + 50)}>
                            Proxima
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
