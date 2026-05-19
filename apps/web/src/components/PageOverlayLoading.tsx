import React from "react";
import Spinner from "./Spinner";

export default function PageOverlayLoading({ show, label }: { show: boolean; label?: string }) {
    if (!show) return null;
    return (
        <div className="overlay">
            <div className="overlayCard">
                <Spinner label={label ?? "Carregando..."} />
            </div>
        </div>
    );
}