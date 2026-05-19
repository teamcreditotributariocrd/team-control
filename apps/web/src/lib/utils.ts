export function cls(...xs: (string | false | null | undefined)[]) {
    return xs.filter(Boolean).join(" ");
}

export function formatPct(x: number) {
    return `${x.toFixed(1)}%`;
}