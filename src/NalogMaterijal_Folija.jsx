import React, { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { useAuth } from "./auth/AuthProvider.jsx";
import { NalogHeader, Section, QCFooter, IF, HC, C, val, fmt } from "./NalogShared.jsx";
import {
  izaberiRolnu,
  autoIzborSvihSlojeva,
  analizaSirine,
  labelaRolne,
  num,
} from "./rolnaAlgoritam.js";

const STATUS_OK = ["Na stanju","Dostupna","dostupna","aktivna","Aktivna","na stanju"];
const COLORS = [C.blue, C.green, C.amber, C.purple, C.red];
const ROLES  = ["Spoljašnji / štampa","Srednji sloj","Unutrašnji / var","Sloj 4","Sloj 5"];

// ─── Pogled OBRAĐIVAČA ────────────────────────────────────
function ObradivacPogled({ nalog, layers, kolPlus, sir, sirinaM, ukGm2, ukKg, m2 }) {
  const [rolne,       setRolne]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [chosen,      setChosen]      = useState({});   // { idx: rolna | null }
  const [autoRez,     setAutoRez]     = useState({});   // rezultati iz algoritma
  const [scanMode,    setScanMode]    = useState(null);
  const [scanInput,   setScanInput]   = useState("");
  const [sacuvano,    setSacuvano]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [showAll,     setShowAll]     = useState({});   // { idx: bool } - prikaži sve kandidate

  // Učitaj magacin
  useEffect(() => {
    supabase.from("magacin").select("*")
      .not("status","in",'("Iskorišćeno","iskoriscena","potrosena")')
      .order("datum", { ascending: true }) // FIFO — starije prve
      .then(r => {
        const data = r.data || [];
        setRolne(data);

        // Pokreni auto-izbor odmah
        const rez = autoIzborSvihSlojeva(layers, data, sir, kolPlus);
        setAutoRez(rez);
        setLoading(false);
      });
  }, []);

  // Zauzete rolne (da ne bi ista rolna bila u 2 sloja)
  const zauzeteSet = new Set(
    Object.values(chosen)
      .filter(Boolean)
      .map(r => r.id || r.br_rolne)
  );

  function getChosen(i) {
    // Eksplicitni izbor obrađivača
    if (i in chosen) return chosen[i];
    // Auto-predlog iz algoritma
    return autoRez.izbori?.[i] || null;
  }

  function getAnaliza(i) {
    const r = getChosen(i);
    if (!r) return null;
    return analizaSirine(r.sirina, sir);
  }

  function setRolna(i, rolna) {
    setChosen(p => ({ ...p, [i]: rolna }));
    setSacuvano(false);
  }

  function handleDropdown(i, id) {
    if (!id) { setRolna(i, null); return; }
    const r = rolne.find(r => String(r.id || r.br_rolne) === id) || null;
    setRolna(i, r);
  }

  function handleScan(i) {
    const q = scanInput.trim().toLowerCase();
    const found = rolne.find(r =>
      String(r.br_rolne || "").toLowerCase() === q ||
      String(r.qr || "").toLowerCase() === q ||
      String(r.lot || "").toLowerCase() === q
    );
    if (found) {
      setRolna(i, found);
      setScanMode(null);
      setScanInput("");
    } else {
      alert(`Rolna "${scanInput}" nije pronađena u magacinu!`);
    }
  }

  async function sacuvajIzbor() {
    setSaving(true);
    try {
      const izborData = layers.map((l, i) => {
        const r = getChosen(i);
        return {
          sloj: i + 1,
          materijal: l.material || l.materijal || l.tip || "",
          br_rolne: r?.br_rolne || null,
          rolna_id: r?.id || null,
          sirina: r?.sirina || null,
          metraza: r?.metraza_ost || r?.metraza || null,
          lokacija: r?.palet || r?.lokacija || null,
          lot: r?.lot || null,
        };
      });

      // Rezerviši u magacinu
      for (const item of izborData) {
        if (item.rolna_id) {
          await supabase.from("magacin")
            .update({ status: "Rezervisano", rezervisano_za: nalog?.ponBr || nalog?.id || "" })
            .eq("id", item.rolna_id);
        }
      }

      // Sačuvaj na nalog
      if (nalog?.id) {
        await supabase.from("nalozi")
          .update({ izabrane_rolne: JSON.stringify(izborData), status_materijal: "rolne_izabrane" })
          .eq("id", nalog.id);
      }

      setSacuvano(true);
    } catch (e) { alert("Greška: " + e.message); }
    setSaving(false);
  }

  const sviOdgovaraju = layers.every((_, i) => !!getChosen(i));
  const upozorenja    = autoRez.upozorenja || [];

  // ── UI ───────────────────────────────────────────────────
  return (
    <div>
      {/* Statistika algoritma */}
      {!loading && autoRez.statistika && (
        <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
          {[
            ["Slojeva", autoRez.statistika.ukupnoSlojeva, C.blue],
            ["Pokriveno", autoRez.statistika.potpunoPokriveno + "/" + autoRez.statistika.ukupnoSlojeva, C.green],
            ["Upozorenja", upozorenja.length, upozorenja.length > 0 ? C.red : C.green],
          ].map(([l,v,c]) => (
            <div key={l} style={{ background: c+"0f", border:`1px solid ${c}33`, borderRadius:8, padding:"6px 12px" }}>
              <span style={{ fontSize:10, color:C.muted, fontWeight:800, textTransform:"uppercase", marginRight:8 }}>{l}</span>
              <span style={{ fontSize:14, fontWeight:950, color:c }}>{v}</span>
            </div>
          ))}
          {upozorenja.length === 0 && (
            <div style={{ background:C.greenLt, border:`1px solid ${C.greenBd}`, borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:800, color:C.green }}>
              ✅ Algoritam pronašao optimalne rolne za sve slojeve
            </div>
          )}
        </div>
      )}

      {/* Upozorenja algoritma */}
      {upozorenja.map((u, i) => (
        <div key={i} style={{ background: u.ozbiljnost==="kritično"?"#fef2f2":"#fffbeb", border:`1px solid ${u.ozbiljnost==="kritično"?C.redBd:C.amberBd}`, borderRadius:8, padding:"8px 12px", marginBottom:8, fontSize:12, color: u.ozbiljnost==="kritično"?C.red:C.amber, fontWeight:800 }}>
          {u.ozbiljnost==="kritično" ? "❌" : "⚠️"} {u.poruka}
        </div>
      ))}

      {/* Status bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:sacuvano?C.greenLt:sviOdgovaraju?C.amberLt:"#fef2f2", border:`1px solid ${sacuvano?C.greenBd:sviOdgovaraju?C.amberBd:C.redBd}`, borderRadius:10, marginBottom:14 }}>
        <div style={{ fontSize:18 }}>{sacuvano ? "✅" : sviOdgovaraju ? "🔒" : "⏳"}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:900, fontSize:13, color:sacuvano?C.green:sviOdgovaraju?C.amber:C.red }}>
            {sacuvano ? "Izbor sačuvan — magacioner priprema materijal"
              : sviOdgovaraju ? "Sve rolne izabrane — potvrdi za magacin"
              : `Izabrano ${layers.filter((_,i) => !!getChosen(i)).length} od ${layers.length} slojeva`}
          </div>
        </div>
        {!sacuvano && (
          <button onClick={sacuvajIzbor} disabled={saving || !sviOdgovaraju}
            style={{ background:sviOdgovaraju?C.green:"#94a3b8", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:900, fontSize:13, cursor:sviOdgovaraju?"pointer":"default", opacity:saving?0.7:1 }}>
            {saving ? "Čuvam..." : "✓ Potvrdi za magacin"}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:32, color:C.muted }}>
          <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
          <div style={{ fontWeight:800 }}>Algoritam analizira magacin...</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {layers.map((l, i) => {
            const rol      = getChosen(i);
            const rezI     = autoRez.analize?.[i];
            const ana      = rol ? analizaSirine(rol.sirina, sir) : null;
            const metraza  = rol ? num(rol.metraza_ost || rol.metraza) : 0;
            const dovoljna = metraza >= kolPlus;
            const g        = num(l.gm2 || l.tezina || l.tezinaGm2);
            const kgTreb   = sirinaM > 0 ? (g * sirinaM * kolPlus / 1000).toFixed(1) : "—";
            const color    = COLORS[i % 5];

            // Kandidati za dropdown — iz algoritma za ovaj sloj (respektuj zauzete)
            const zadrugeZauzete = new Set(
              Object.entries(chosen)
                .filter(([idx, r]) => Number(idx) !== i && r)
                .map(([, r]) => r.id || r.br_rolne)
            );
            const rezSloj = izaberiRolnu(l, rolne, sir, kolPlus, zadrugeZauzete);
            const kandidati = rezSloj.kandidati || [];
            const allKandidat = showAll[i] ? kandidati : kandidati.slice(0, 8);

            return (
              <div key={i} style={{ border:`1.5px solid ${!rol?C.red:dovoljna&&ana?.dovoljna?C.green:C.amber}`, borderLeft:`4px solid ${color}`, borderRadius:10, overflow:"hidden", background:"#fff" }}>

                {/* Sloj header */}
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:color+"06" }}>
                  <div style={{ width:30, height:30, borderRadius:"50%", background:color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:950, fontSize:13, flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:900, fontSize:13 }}>
                      {val(l.material||l.materijal||l.tip)} {val(l.oznaka||l.komercijalnaOznaka,"")} {val(l.debljina||l.deb)}µ
                    </div>
                    <div style={{ fontSize:11, color:C.muted }}>
                      {ROLES[i]} &nbsp;·&nbsp; Potrebno: <b style={{color:C.red}}>{kgTreb} kg</b> · {fmt(kolPlus)} m · idealna ~{val(sir)} mm
                    </div>
                  </div>
                  {/* Badges za stanje */}
                  <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                    {rezI && (
                      <span style={{ fontSize:10, background:rezI.imaDovoljnih?C.greenLt:C.redLt, color:rezI.imaDovoljnih?C.green:C.red, border:`1px solid ${rezI.imaDovoljnih?C.greenBd:C.redBd}`, borderRadius:6, padding:"3px 7px", fontWeight:800 }}>
                        {rezI.ukupnoPrikladnih} kandid.
                      </span>
                    )}
                    <button onClick={() => setScanMode(scanMode===i ? null : i)}
                      style={{ background:scanMode===i?C.purple:C.blue, color:"#fff", border:"none", borderRadius:7, padding:"5px 11px", fontWeight:800, fontSize:11, cursor:"pointer" }}>
                      📱 QR
                    </button>
                  </div>
                </div>

                {/* QR scan */}
                {scanMode===i && (
                  <div style={{ padding:"9px 14px", background:C.purple+"08", borderBottom:`1px solid ${C.purple}22`, display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:18 }}>📱</span>
                    <input autoFocus value={scanInput} onChange={e => setScanInput(e.target.value)}
                      onKeyDown={e => e.key==="Enter" && handleScan(i)}
                      placeholder="Skeniraj QR ili unesi br. rolne / LOT..."
                      style={{ flex:1, padding:"8px 12px", border:`1.5px solid ${C.purple}`, borderRadius:7, fontSize:13, fontFamily:"inherit", outline:"none" }} />
                    <button onClick={() => handleScan(i)} style={{ background:C.purple, color:"#fff", border:"none", borderRadius:7, padding:"8px 16px", fontWeight:800, fontSize:12, cursor:"pointer" }}>Potvrdi</button>
                    <button onClick={() => { setScanMode(null); setScanInput(""); }} style={{ border:`1px solid ${C.border}`, background:"#fff", borderRadius:7, padding:"8px 12px", fontWeight:800, fontSize:12, cursor:"pointer" }}>×</button>
                  </div>
                )}

                <div style={{ padding:"12px 14px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  {/* Levo: dropdown */}
                  <div>
                    <div style={{ fontSize:10, fontWeight:800, color:C.muted, textTransform:"uppercase", marginBottom:6 }}>
                      Izbor rolne — {kandidati.length} prikladnih
                      {kandidati.length === 0 && <span style={{ color:C.red }}> (nema!)</span>}
                    </div>
                    <select
                      value={rol ? String(rol.id || rol.br_rolne) : "auto"}
                      onChange={e => e.target.value === "auto" ? setRolna(i, undefined) : handleDropdown(i, e.target.value)}
                      style={{ width:"100%", padding:"9px 10px", border:`1.5px solid ${rol?C.amber:C.red}`, borderRadius:8, fontSize:11, fontFamily:"inherit", background:"#fff", outline:"none" }}>
                      {/* Auto predlog */}
                      {autoRez.izbori?.[i] && (
                        <option value="auto">
                          🤖 Auto: {labelaRolne(autoRez.izbori[i], sir, kolPlus)}
                        </option>
                      )}
                      {!autoRez.izbori?.[i] && <option value="auto">— Nema auto predloga —</option>}
                      <option disabled>──────────────────────</option>
                      {/* Idealne rolne */}
                      {rezSloj.idealne?.length > 0 && <option disabled>✅ Idealne (dovoljno široke i metraže)</option>}
                      {rezSloj.idealne?.slice(0, showAll[i] ? 999 : 5).map(({ rolna: r, analiza: a, score }) => (
                        <option key={r.id||r.br_rolne} value={String(r.id||r.br_rolne)}>
                          ✅ {labelaRolne(r, sir, kolPlus)}
                        </option>
                      ))}
                      {/* Uske rolne */}
                      {rezSloj.uzke?.length > 0 && <option disabled>⚠️ Uske rolne (dovoljno metraže ali manja širina)</option>}
                      {rezSloj.uzke?.slice(0, showAll[i] ? 999 : 3).map(({ rolna: r }) => (
                        <option key={r.id||r.br_rolne} value={String(r.id||r.br_rolne)}>
                          ⚠️ {labelaRolne(r, sir, kolPlus)}
                        </option>
                      ))}
                      {/* Nema metraže */}
                      {rezSloj.nemaMetraze?.length > 0 && <option disabled>❌ Nema dovoljno metraže</option>}
                      {rezSloj.nemaMetraze?.slice(0, showAll[i] ? 999 : 2).map(({ rolna: r }) => (
                        <option key={r.id||r.br_rolne} value={String(r.id||r.br_rolne)}>
                          ❌ {labelaRolne(r, sir, kolPlus)}
                        </option>
                      ))}
                    </select>
                    {kandidati.length > 8 && (
                      <button onClick={() => setShowAll(p => ({...p,[i]:!p[i]}))}
                        style={{ background:"none", border:"none", color:C.blue, fontWeight:800, fontSize:11, cursor:"pointer", padding:"4px 0", marginTop:4 }}>
                        {showAll[i] ? "↑ Prikaži manje" : `↓ Prikaži svih ${kandidati.length}`}
                      </button>
                    )}
                    {kandidati.length === 0 && (
                      <div style={{ fontSize:11, color:C.red, marginTop:6, fontWeight:800 }}>
                        ❌ Nema rolni ovog tipa i debljine u magacinu
                      </div>
                    )}
                  </div>

                  {/* Desno: info izabrane rolne */}
                  {rol ? (
                    <div>
                      {/* Score/analiza */}
                      <div style={{ display:"flex", gap:6, marginBottom:7, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, background:ana?.dovoljna?C.greenLt:C.redLt, color:ana?.dovoljna?C.green:C.red, border:`1px solid ${ana?.dovoljna?C.greenBd:C.redBd}`, borderRadius:6, padding:"3px 8px", fontWeight:800 }}>
                          {ana?.dovoljna ? `✓ Širina OK (${rol.sirina}mm)` : `⚠️ Uska (${rol.sirina}mm < ${sir}mm)`}
                        </span>
                        <span style={{ fontSize:10, background:dovoljna?C.greenLt:C.redLt, color:dovoljna?C.green:C.red, border:`1px solid ${dovoljna?C.greenBd:C.redBd}`, borderRadius:6, padding:"3px 8px", fontWeight:800 }}>
                          {dovoljna ? `✓ Metraža OK` : `⚠️ Nema dost.`}
                        </span>
                        {ana?.dovoljna && ana.otpad > 0 && (
                          <span style={{ fontSize:10, background:C.amberLt, color:C.amber, border:`1px solid ${C.amberBd}`, borderRadius:6, padding:"3px 8px", fontWeight:800 }}>
                            Otpad: {ana.otpad}mm
                          </span>
                        )}
                        {ana?.dovoljna && ana.otpad === 0 && (
                          <span style={{ fontSize:10, background:C.greenLt, color:C.green, border:`1px solid ${C.greenBd}`, borderRadius:6, padding:"3px 8px", fontWeight:800 }}>
                            ⭐ Nulti otpad
                          </span>
                        )}
                      </div>

                      {/* Info polja */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                        {[
                          ["Br. rolne", rol.br_rolne, C.blue],
                          ["Lokacija", val(rol.palet||rol.lokacija), C.amber],
                          ["Širina", rol.sirina+" mm", ana?.dovoljna?C.green:C.red],
                          ["Ostalo m", num(rol.metraza_ost||rol.metraza).toLocaleString("sr-RS")+" m", dovoljna?C.green:C.red],
                          ["Kg neto", num(rol.kg_neto||rol.kg).toFixed(1)+" kg", C.green],
                          ["LOT", val(rol.lot), C.navy],
                        ].map(([l, v, c]) => (
                          <div key={l} style={{ background:"#f8fafc", border:`1px solid ${C.border}`, borderRadius:7, padding:"6px 8px" }}>
                            <div style={{ fontSize:9, color:C.muted, fontWeight:800, textTransform:"uppercase", marginBottom:2 }}>{l}</div>
                            <div style={{ fontSize:12, fontWeight:900, color:c }}>{v}</div>
                          </div>
                        ))}
                        {!dovoljna && (
                          <div style={{ gridColumn:"1/-1", background:"#fef2f2", border:`1px solid ${C.redBd}`, borderRadius:7, padding:"6px 9px", fontSize:11, color:C.red, fontWeight:800 }}>
                            ⚠️ Ima {num(rol.metraza_ost||rol.metraza).toLocaleString("sr-RS")}m — potrebno {fmt(kolPlus)}m!
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", background:"#fef2f2", border:`1px solid ${C.redBd}`, borderRadius:8, padding:16, textAlign:"center" }}>
                      <div>
                        <div style={{ fontSize:22, marginBottom:6 }}>❌</div>
                        <div style={{ fontSize:12, fontWeight:800, color:C.red }}>Nije izabrana rolna</div>
                        <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
                          {kandidati.length === 0 ? "Nema u magacinu" : "Izaberi iz liste"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Pogled MAGACIONERA ───────────────────────────────────
function MagacionerPogled({ nalog, layers, kolPlus, sir }) {
  const [rolneInfo, setRolneInfo] = useState([]);
  const [loading, setLoading] = useState(true);
  const QR_URL = (v, s=90) => `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&data=${encodeURIComponent(v||"")}`;

  useEffect(() => {
    const izabrane = nalog?.izabrane_rolne
      ? (typeof nalog.izabrane_rolne === "string" ? JSON.parse(nalog.izabrane_rolne) : nalog.izabrane_rolne)
      : [];

    if (!izabrane.length) { setLoading(false); return; }

    const ids = izabrane.map(r => r.rolna_id).filter(Boolean);
    if (!ids.length) { setRolneInfo(izabrane); setLoading(false); return; }

    supabase.from("magacin").select("*").in("id", ids)
      .then(r => {
        const dbRolne = r.data || [];
        setRolneInfo(izabrane.map(item => ({
          ...item,
          rolna: dbRolne.find(r => r.id === item.rolna_id) || null,
        })));
        setLoading(false);
      });
  }, [nalog]);

  if (!nalog?.izabrane_rolne && !loading) {
    return (
      <div style={{ padding:28, textAlign:"center", background:"#fef2f2", border:`1px solid ${C.redBd}`, borderRadius:10 }}>
        <div style={{ fontSize:32, marginBottom:10 }}>⏳</div>
        <div style={{ fontWeight:900, fontSize:14, color:C.red, marginBottom:6 }}>Obrađivač još nije izabrao rolne</div>
        <div style={{ fontSize:12, color:C.muted }}>Kada potvrdi izbor, ovde će biti lokacije i QR kodovi.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", background:C.greenLt, border:`1px solid ${C.greenBd}`, borderRadius:10, marginBottom:14 }}>
        <div style={{ fontSize:22 }}>✅</div>
        <div>
          <div style={{ fontWeight:900, fontSize:13, color:C.green }}>Rolne rezervisane — preuzmi iz magacina</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
            Nalog: <b>{val(nalog?.ponBr)}</b> · Metraža: <b>{fmt(kolPlus)} m (+5%)</b> · Idealna širina: <b>{val(sir)} mm</b>
          </div>
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign:"center", padding:20, color:C.muted }}>⏳ Učitavam...</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {rolneInfo.map((item, i) => {
            const r = item.rolna;
            const qrVal = r?.br_rolne || item.br_rolne || "";
            return (
              <div key={i} style={{ border:`1.5px solid ${C.greenBd}`, borderLeft:`4px solid ${COLORS[i%5]}`, borderRadius:10, overflow:"hidden", background:"#fff" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:COLORS[i%5]+"06" }}>
                  <div style={{ width:30, height:30, borderRadius:"50%", background:COLORS[i%5], display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:950, fontSize:13, flexShrink:0 }}>{item.sloj||i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:900, fontSize:13 }}>{val(item.materijal)} — {ROLES[(item.sloj||i+1)-1]||"Sloj "+(item.sloj||i+1)}</div>
                  </div>
                  <span style={{ background:C.greenLt, color:C.green, border:`1px solid ${C.greenBd}`, borderRadius:7, padding:"4px 10px", fontSize:11, fontWeight:800 }}>✓ Rezervisano</span>
                </div>
                <div style={{ padding:"12px 14px", display:"grid", gridTemplateColumns:"1fr 160px", gap:14, alignItems:"center" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                    {[
                      ["Broj rolne", val(r?.br_rolne||item.br_rolne), C.blue],
                      ["Lokacija", val(r?.palet||r?.lokacija||item.lokacija), C.amber],
                      ["Širina", val(r?.sirina)+" mm", C.navy],
                      ["Ostalo m", num(r?.metraza_ost||r?.metraza).toLocaleString("sr-RS")+" m", C.green],
                      ["Kg neto", num(r?.kg_neto||r?.kg).toFixed(1)+" kg", C.green],
                      ["LOT", val(r?.lot||item.lot), C.navy],
                      ["Dobavljač", val(r?.dobavljac), C.muted],
                      ["Datum", val(r?.datum), C.muted],
                      ["Status", val(r?.status||"Rezervisano"), C.green],
                    ].map(([l,v,c]) => (
                      <div key={l} style={{ background:"#f8fafc", border:`1px solid ${C.border}`, borderRadius:7, padding:"7px 9px" }}>
                        <div style={{ fontSize:9, color:C.muted, fontWeight:800, textTransform:"uppercase", marginBottom:3 }}>{l}</div>
                        <div style={{ fontSize:12, fontWeight:900, color:c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                    <div style={{ background:"#fff", border:`2px solid ${COLORS[i%5]}`, borderRadius:10, padding:8 }}>
                      <img src={QR_URL(qrVal, 120)} width={120} height={120} alt="QR" style={{ display:"block" }} />
                    </div>
                    <div style={{ fontSize:10, fontWeight:800, color:C.navy, textAlign:"center" }}>{qrVal}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ marginTop:14, padding:"11px 14px", background:"#f8fafc", border:`1px solid ${C.border}`, borderRadius:9, display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ fontSize:18 }}>🖨️</div>
        <div style={{ fontSize:11, color:C.muted }}>
          <b style={{color:C.navy}}>Print PDF</b> — lista rolni sa QR kodovima i lokacijama za magacionera.
        </div>
      </div>
    </div>
  );
}

// ─── GLAVNI KOMPONENT ─────────────────────────────────────
export default function NalogMaterijal_Folija({ nalog }) {
  const { userProfile } = useAuth();
  const isMagacioner = userProfile?.uloga === "magacioner";
  const [view, setView] = useState(isMagacioner ? "magacioner" : "obradivac");

  const t      = nalog?.template || nalog?.templateData || {};
  const folija = nalog?.folija   || t.folija || {};
  const layers = folija.layers   || nalog?.mats || [];
  const kol    = num(nalog?.kol  || t.porucenaKolicina);
  const kolPlus = Math.ceil(kol * 1.05);
  const sir    = num(t.idealnaSirinaMaterijala || folija.rezanje?.sirinaMaterijala || nalog?.sir);
  const sirinaM = sir / 1000;
  const ukGm2  = layers.reduce((s,l) => s + num(l.gm2||l.tezina||l.tezinaGm2||0), 0);
  const ukKg   = sirinaM > 0 ? (ukGm2 * sirinaM * kolPlus / 1000).toFixed(1) : "—";
  const m2     = sirinaM > 0 ? (sirinaM * kolPlus).toFixed(0) : "—";

  return (
    <div style={{ fontFamily:"Inter,system-ui,sans-serif", fontSize:12, color:C.navy, maxWidth:800, margin:"0 auto" }}>
      <NalogHeader tip="Nalog za materijal" icon="📦" nalog={nalog} />

      {/* KPI strip + view switcher */}
      <div style={{ border:`1px solid ${C.blueBd}`, borderLeft:`4px solid ${C.blue}`, borderTop:"none", padding:"12px 16px", background:C.blueLt }}>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", alignItems:"center" }}>
          <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
            {[
              ["Sastav", layers.map(l=>l.material||l.materijal||"—").join(" / "), C.navy],
              ["Poručeno", fmt(kol)+" m", C.blue],
              ["Za rad (+5%)", fmt(kolPlus)+" m", C.green],
              ["Ukupno kg", ukKg+" kg", C.green],
              ["Površina", m2+" m²", C.blue],
              ["Idealna šir.", val(sir)+" mm", C.blue],
            ].map(([l,v,c]) => (
              <div key={l}>
                <div style={{ fontSize:9, color:C.muted, fontWeight:800, textTransform:"uppercase", marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:950, color:c }}>{v}</div>
              </div>
            ))}
          </div>
          {!isMagacioner && (
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              <button onClick={() => setView("obradivac")}
                style={{ border:`1.5px solid ${view==="obradivac"?C.blue:C.border}`, background:view==="obradivac"?C.blueLt:"#fff", color:view==="obradivac"?C.blue:C.muted, borderRadius:7, padding:"6px 13px", fontWeight:800, fontSize:11, cursor:"pointer" }}>
                🧑‍💼 Obrađivač
              </button>
              <button onClick={() => setView("magacioner")}
                style={{ border:`1.5px solid ${view==="magacioner"?C.amber:C.border}`, background:view==="magacioner"?C.amberLt:"#fff", color:view==="magacioner"?C.amber:C.muted, borderRadius:7, padding:"6px 13px", fontWeight:800, fontSize:11, cursor:"pointer" }}>
                🏭 Magacioner
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sekcija */}
      <div style={{ border:`1px solid ${C.border}`, borderLeft:`4px solid ${view==="obradivac"?C.blue:C.amber}`, borderTop:"none" }}>
        <div style={{ padding:"9px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", background:view==="obradivac"?C.blueLt:C.amberLt, borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontWeight:900, fontSize:12, textTransform:"uppercase", letterSpacing:".7px", color:view==="obradivac"?C.blue:C.amber }}>
            {view==="obradivac" ? "🧑‍💼 Izbor rolni — obrađivač" : "🏭 Preuzimanje — magacioner"}
          </span>
          <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:99, color:view==="obradivac"?C.blue:C.amber, background:view==="obradivac"?C.blue+"15":C.amber+"15" }}>
            {view==="obradivac" ? "algoritam + ručni izbor" : "lokacija / QR / preuzimanje"}
          </span>
        </div>
        <div style={{ padding:"14px 16px" }}>
          {view==="obradivac"
            ? <ObradivacPogled nalog={nalog} layers={layers} kolPlus={kolPlus} sir={sir} sirinaM={sirinaM} ukGm2={ukGm2} ukKg={ukKg} m2={m2} />
            : <MagacionerPogled nalog={nalog} layers={layers} kolPlus={kolPlus} sir={sir} />}
        </div>
      </div>

      <QCFooter items={[
        ["Start","QR skeniranje naloga","Operator: ___________"],
        ["Ulazni materijal","QR rolne / magacin","Mašina: ___________"],
        ["Kontrola","kg, metraža, serija, LOT","QC: ___________"],
        ["Kraj","potvrda preuzimanja","Potpis: ___________"],
      ]} />
    </div>
  );
}
