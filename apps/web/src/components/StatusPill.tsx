import React from "react";
import type { TeamRow } from "../types";

export default function StatusPill({ status }: { status: TeamRow["status"] }) {
    const label =
        status === "ON_TRACK"
            ? "On track"
            : status === "AT_RISK"
                ? "At risk"
                : status === "OFF_TRACK"
                    ? "Off track"
                    : "Sem meta";

    const klass =
        status === "ON_TRACK"
            ? "pill ok"
            : status === "AT_RISK"
                ? "pill warn"
                : status === "OFF_TRACK"
                    ? "pill bad"
                    : "pill";

    return <span className={klass}>{label}</span>;
}