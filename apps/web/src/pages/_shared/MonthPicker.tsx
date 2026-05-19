import React from "react";

export default function MonthPicker({ month, setMonth }: { month: string; setMonth: (v: string) => void }) {
    return (
        <div>
            <div className="label">Mês</div>
            <input className="input" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" />
        </div>
    );
}