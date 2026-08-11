import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

// Javna stranica koja se otvori skeniranjem QR-a proizvoda (?p=<qr_token>).
// Prikazuje: proizvod, materijal (slojeve), dimenzije i CENU (iz poslednje kalkulacije).
export default function ProizvodQR({ token }) {
    const [stanje, setStanje] = useState("load"); // load | ok | none | err
    const [p, setP] = useState(null);
    const [cena, setCena] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const { data, error } = await supabase.from("proizvodi").select("*").eq("qr_token", token).maybeSingle();
                if (error) { setStanje("err"); return; }
                if (!data) { setStanje("none"); return; }
                setP(data);
                setStanje("ok");
                // pokušaj da nađeš poslednju cenu iz kalkulacija za taj proizvod
                try {
                    const tip = String(data.tip || "").toLowerCase();
                    const tabela = tip === "kesa" ? "kalkulacije_kese" : tip === "spulna" ? "kalkulacije_spulne" : "kalkulacije_folije";
                    let q = supabase.from(tabela).select("konacna_cena, cena_kg, created_at").order("created_at", { ascending: false }).limit(1);
                    if (data.naziv) q = q.eq("naziv", data.naziv);
                    const { data: k } = await q;
                    const row = Array.isArray(k) ? k[0] : null;
                    if (row) setCena(Number(row.konacna_cena || row.cena_kg || 0) || null);
                } catch (e) { /* cena opciono */ }
            } catch (e) { setStanje("err"); }
        })();
    }, [token]);

    const wrap = { minHeight: "100vh", background: "#f1f5f9", display: "flex", justifyContent: "center", padding: "24px 14px", fontFamily: "system-ui, sans-serif" };
    const card = { background: "#fff", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,.08)", maxWidth: 480, width: "100%", overflow: "hidden" };

    if (stanje === "load") return <div style={wrap}><div style={card}><div style={{ padding: 28, color: "#64748b" }}>Učitavanje…</div></div></div>;
    if (stanje === "none") return <div style={wrap}><div style={card}><div style={{ padding: 28, color: "#b91c1c", fontWeight: 700 }}>Proizvod nije pronađen (QR ne odgovara nijednom proizvodu).</div></div></div>;
    if (stanje === "err") return <div style={wrap}><div style={card}><div style={{ padding: 28, color: "#b91c1c", fontWeight: 700 }}>Greška pri učitavanju. Pokušaj ponovo.</div></div></div>;

    const d = (p.res && p.res.template) || (p.standardi && p.standardi.record && p.standardi.record.data) || {};
    const tip = p.tip || d.type || "folija";
    const layers = p.materijali_struktura || p.mats || (d[tip] && d[tip].layers) || [];
    const sirina = d.idealnaSirinaMaterijala || d.dimenzijaSirina || p.sir || "";
    const duzina = d.dimenzijaDuzina || "";
    const kolicina = d.porucenaKolicina || p.met || "";

    const red = { display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 };
    const lab = { color: "#64748b" };
    const val = { fontWeight: 700, color: "#0f172a", textAlign: "right" };

    return (
        <div style={wrap}>
            <div style={card}>
                <div style={{ background: "#0f766e", color: "#fff", padding: "18px 20px" }}>
                    <div style={{ fontSize: 12, opacity: .85, fontWeight: 700, letterSpacing: 1 }}>MAROPACK · PROIZVOD</div>
                    <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>{p.naziv || "—"}</div>
                    <div style={{ fontSize: 13, opacity: .9, marginTop: 2 }}>{p.kupac || "—"} · {String(tip).toUpperCase()}</div>
                </div>
                <div style={{ padding: "8px 20px 20px" }}>
                    <div style={red}><span style={lab}>Šifra</span><span style={val}>{p.sku || p.product_master_id || p.id}</span></div>
                    {sirina ? <div style={red}><span style={lab}>Širina materijala</span><span style={val}>{sirina} mm</span></div> : null}
                    {duzina ? <div style={red}><span style={lab}>Dužina</span><span style={val}>{duzina} mm</span></div> : null}
                    {kolicina ? <div style={red}><span style={lab}>Količina</span><span style={val}>{Number(kolicina).toLocaleString("sr-RS")}</span></div> : null}
                    {cena != null ? <div style={{ ...red, borderBottom: "none" }}><span style={lab}>Cena</span><span style={{ ...val, color: "#059669", fontSize: 18 }}>{cena.toLocaleString("sr-RS", { minimumFractionDigits: 2 })} €</span></div> : null}

                    <div style={{ marginTop: 16, fontSize: 12, fontWeight: 900, color: "#0f766e", textTransform: "uppercase" }}>Materijal</div>
                    {(!layers || layers.length === 0) ? <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}>Nema unetih slojeva.</div> :
                        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                            {layers.map((l, i) => {
                                const naziv = l.naziv || l.materijal || l.tip || l.vrsta || ("Sloj " + (i + 1));
                                const deb = l.debljina || l.deb || "";
                                const gm2 = l.tezina || l.gm2 || l.gramatura || "";
                                return <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
                                    <span style={{ fontWeight: 700 }}>{i + 1}. {naziv}</span>
                                    <span style={{ color: "#475569" }}>{deb ? deb + " µm" : ""}{gm2 ? " · " + gm2 + " g/m²" : ""}</span>
                                </div>;
                            })}
                        </div>}
                </div>
            </div>
        </div>
    );
}
