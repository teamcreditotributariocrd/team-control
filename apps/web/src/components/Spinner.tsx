import React from "react";

export default function Spinner({ label }: { label?: string }) {
    return (
        <div className="spinnerWrap" role="status" aria-live="polite">
            <div className="spinner" />
            {label ? <div className="spinnerLabel">{label}</div> : null}
        </div>
    );
}