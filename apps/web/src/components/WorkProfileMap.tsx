import React, { useMemo } from "react";

import type { UserItemsResponse } from "../types";

function buildProfileRows(items: UserItemsResponse["items"], selector: (item: UserItemsResponse["items"][number]) => string | null | undefined) {
    const map = new Map<string, { label: string; totalUst: number; count: number }>();
    for (const item of items) {
        const label = String(selector(item) || "Nao classificado").trim() || "Nao classificado";
        const current = map.get(label) ?? { label, totalUst: 0, count: 0 };
        current.totalUst += Number(item.ust ?? 0);
        current.count += 1;
        map.set(label, current);
    }
    const total = Array.from(map.values()).reduce((sum, row) => sum + row.totalUst, 0);
    return Array.from(map.values())
        .map((row) => ({
            ...row,
            totalUst: Number(row.totalUst.toFixed(2)),
            pct: total > 0 ? Number(((row.totalUst / total) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.totalUst - a.totalUst || a.label.localeCompare(b.label));
}

export default function WorkProfileMap({ items }: { items: UserItemsResponse["items"] }) {
    const profile = useMemo(() => {
        const byType = buildProfileRows(items, (item) => item.catalog?.tipo);
        const byGroup = buildProfileRows(items, (item) => item.catalog?.grupo);
        const byComplexity = buildProfileRows(items, (item) => item.catalog?.complexidade ?? item.expectedComplexidade);
        const dominantType = byType[0] ?? null;
        const dominantGroup = byGroup[0] ?? null;
        const dominantComplexity = byComplexity[0] ?? null;
        const reading = items.length === 0
            ? "Ainda nao ha atividades contabilizadas para montar o perfil do mes."
            : `Maior concentracao em ${dominantType?.label ?? "Nao classificado"} (${dominantType?.pct ?? 0}%)` +
            `${dominantGroup ? `, principalmente em ${dominantGroup.label}` : ""}` +
            `${dominantComplexity ? `, com complexidade predominante ${dominantComplexity.label}.` : "."}`;

        return { byType, byGroup, byComplexity, reading };
    }, [items]);

    return (
        <div className="card" style={{ marginTop: 14 }}>
            <div className="cardTitle" style={{ marginBottom: 4 }}>Mapa de perfil de trabalho</div>
            <div className="muted small" style={{ marginBottom: 12 }}>{profile.reading}</div>
            <div className="grid3">
                <ProfileColumn title="Por tipo" rows={profile.byType} />
                <ProfileColumn title="Por grupo" rows={profile.byGroup} />
                <ProfileColumn title="Por complexidade" rows={profile.byComplexity} />
            </div>
        </div>
    );
}

function ProfileColumn({
    title,
    rows,
}: {
    title: string;
    rows: Array<{ label: string; totalUst: number; count: number; pct: number }>;
}) {
    return (
        <div>
            <div className="muted small" style={{ marginBottom: 8 }}>{title}</div>
            {rows.length === 0 ? (
                <div className="muted small">Sem dados contabilizados.</div>
            ) : (
                <div style={{ display: "grid", gap: 10 }}>
                    {rows.slice(0, 5).map((row) => (
                        <div key={`${title}-${row.label}`}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</div>
                                <div className="mono small">{row.pct}%</div>
                            </div>
                            <div
                                aria-hidden="true"
                                style={{
                                    height: 8,
                                    borderRadius: 999,
                                    background: "rgba(255,255,255,.08)",
                                    overflow: "hidden",
                                    marginTop: 6,
                                }}
                            >
                                <div
                                    style={{
                                        width: `${Math.max(3, row.pct)}%`,
                                        height: "100%",
                                        borderRadius: 999,
                                        background: "linear-gradient(90deg, #6EE7C4, #8DB7FF)",
                                    }}
                                />
                            </div>
                            <div className="muted small" style={{ marginTop: 4 }}>
                                {row.totalUst} UST em {row.count} task{row.count === 1 ? "" : "s"}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
