
import React, { useMemo, useState } from "react";
import {
  MATERIAL_MASTER,
  getVrsteMaterijala,
  getOznakeZaVrstu,
  getDebljineZaMaterijal,
  getKoeficijent,
  calculateGm2,
  buildMaterialName,
  kgFromMeters,
  metersFromKg
} from "../data/materialMaster.js";

export default function MaterialMasterPRO({ onSelectMaterial }) {
  const vrste = getVrsteMaterijala();
  const [vrsta, setVrsta] = useState("BOPP");
  const oznake = useMemo(() => getOznakeZaVrstu(vrsta), [vrsta]);
  const [oznaka, setOznaka] = useState("FXCB");
  const debljine = useMemo(() => getDebljineZaMaterijal(vrsta, oznaka), [vrsta, oznaka]);
  const [debljina, setDebljina] = useState(20);
  const [sirina, setSirina] = useState(840);
  const [metara, setMetara] = useState(10000);
  const [kgInput, setKgInput] = useState("");

  React.useEffect(() => {
    const next = getOznakeZaVrstu(vrsta);
    const preferred = next.includes("FXCB") ? "FXCB" : (next[0] || "STANDARD");
    setOznaka(preferred);
  }, [vrsta]);

  React.useEffect(() => {
    const ds = getDebljineZaMaterijal(vrsta, oznaka);
    if (ds.length && !ds.includes(Number(debljina))) setDebljina(ds.includes(20) ? 20 : ds[0]);
  }, [vrsta, oznaka]);

  const koeficijent = getKoeficijent(vrsta);
  const gm2 = calculateGm2(vrsta, debljina);
  const naziv = buildMaterialName(vrsta, oznaka, debljina);
  const kgAuto = kgFromMeters({ sirinaMm: sirina, metara, gm2 });
  const mAuto = metersFromKg({ sirinaMm: sirina, kg: kgInput || kgAuto, gm2 });

  const material = { vrsta, oznaka, debljina, koeficijent, gm2, nazivMaterijala: naziv };

  const input = { width:"100%", padding:"11px 12px", border:"1px solid #d7e1ef", borderRadius:12, background:"#fff", fontWeight:700 };
  const label = { fontSize:11, fontWeight:900, color:"#64748b", textTransform:"uppercase", marginBottom:6 };
  const card = { background:"#fff", border:"1px solid #e2e8f0", borderRadius:20, padding:18, boxShadow:"0 12px 35px rgba(15,23,42,.07)" };

  return (
    <div style={{padding:22, background:"#eef3f8", minHeight:"100vh"}}>
      <div style={{background:"linear-gradient(135deg,#07142b,#123f8c)", color:"#fff", borderRadius:24, padding:24, marginBottom:18}}>
        <div style={{fontSize:28, fontWeight:950}}>🧠 Material Master Engine PRO</div>
        <div style={{opacity:.86}}>Centralna baza materijala za magacin, kalkulacije, template-e, naloge, AI i planiranje.</div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1.3fr .7fr", gap:18}}>
        <section style={card}>
          <h2 style={{marginTop:0}}>Pametan izbor materijala</h2>
          <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14}}>
            <Field label="Vrsta materijala"><select style={input} value={vrsta} onChange={e=>setVrsta(e.target.value)}>{vrste.map(v=><option key={v}>{v}</option>)}</select></Field>
            <Field label="Oznaka / komercijalni tip"><select style={input} value={oznaka} onChange={e=>setOznaka(e.target.value)}>{oznake.map(o=><option key={o}>{o}</option>)}</select></Field>
            <Field label={vrsta === "PAPIR" ? "Gramatura" : "Debljina"}><select style={input} value={debljina} onChange={e=>setDebljina(Number(e.target.value))}>{debljine.map(d=><option key={d} value={d}>{d}{vrsta==="PAPIR" ? " g/m²" : "µ"}</option>)}</select></Field>
          </div>

          <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginTop:18}}>
            <Info title="Naziv" value={naziv}/>
            <Info title="Koeficijent" value={koeficijent || "—"}/>
            <Info title="g/m²" value={gm2}/>
            <Info title="Oznaka" value={oznaka}/>
          </div>

          <button
            onClick={() => onSelectMaterial?.(material)}
            style={{marginTop:18, padding:"12px 18px", border:0, borderRadius:12, background:"#059669", color:"#fff", fontWeight:900}}
          >
            ✅ Koristi ovaj materijal
          </button>
        </section>

        <section style={card}>
          <h2 style={{marginTop:0}}>Obračun rolne</h2>
          <Field label="Širina rolne mm"><input style={input} value={sirina} onChange={e=>setSirina(e.target.value)} /></Field>
          <Field label="Metara"><input style={input} value={metara} onChange={e=>setMetara(e.target.value)} /></Field>
          <Info title="Kg iz metara" value={`${kgAuto} kg`}/>
          <Field label="Unesi kg za obrnut obračun"><input style={input} value={kgInput} onChange={e=>setKgInput(e.target.value)} placeholder="npr. 229.32" /></Field>
          <Info title="Metara iz kg" value={`${mAuto} m`}/>
        </section>
      </div>

      <section style={{...card, marginTop:18}}>
        <h2 style={{marginTop:0}}>Master baza — pregled</h2>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12}}>
          {Object.entries(MATERIAL_MASTER).map(([v, data]) => (
            <div key={v} style={{background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:16, padding:14}}>
              <div style={{fontWeight:950, color:"#0f172a"}}>{v}</div>
              <div style={{fontSize:12, color:"#64748b"}}>koef: {data.koeficijent ?? "gramatura"}</div>
              <div style={{fontSize:12, color:"#64748b"}}>oznaka: {Object.keys(data.oznake).length}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return <div style={{marginBottom:12}}><div style={{fontSize:11, fontWeight:900, color:"#64748b", textTransform:"uppercase", marginBottom:6}}>{label}</div>{children}</div>;
}
function Info({ title, value }) {
  return <div style={{background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:14, padding:12, marginBottom:10}}>
    <div style={{fontSize:10, fontWeight:900, color:"#64748b", textTransform:"uppercase"}}>{title}</div>
    <div style={{fontSize:17, fontWeight:950, color:"#06152e", marginTop:4}}>{value}</div>
  </div>;
}
