import React, { useState } from "react";

export default function AIAsistentKalkulacije({ card }) {
    const [tekst, setTekst] = useState("");

    return (
        <div style={card}>
            <h2>🤖 AI Asistent za kalkulacije</h2>
            <p style={{ color: "#64748b" }}>
                Modul je pripremljen. Ovde će AI čitati upite, naloge i kalkulacije.
            </p>

            <textarea
                value={tekst}
                onChange={(e) => setTekst(e.target.value)}
                placeholder="Nalepi tekst upita ili kalkulacije..."
                style={{
                    width: "100%",
                    minHeight: 160,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    marginTop: 10
                }}
            />

            <button
                onClick={() => alert("AI modul će se povezati kasnije.")}
                style={{
                    marginTop: 12,
                    padding: "10px 18px",
                    borderRadius: 10,
                    border: "none",
                    background: "#1d4ed8",
                    color: "white",
                    fontWeight: 700,
                    cursor: "pointer"
                }}
            >
                Analiziraj
            </button>
        </div>
    );
}
