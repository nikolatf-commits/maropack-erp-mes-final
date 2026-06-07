import React from "react";
import { NalogHeader, Section, QCFooter, IF, HC, C, val, fmt } from "./NalogShared.jsx";

export default function NalogKasiranje_Folija({ nalog, embedded=false }) {
  const t = nalog?.template || nalog?.templateData || {};
  const folija = nalog?.folija || t.folija || {};
  const k = folija.kasiranje || nalog?.kasiranje || {};
  const layers = folija.layers || nalog?.mats || [];
  const sir = Number(t.idealnaSirinaMaterijala || folija.rezanje?.sirinaMaterijala || 0);
  const kolPlus = Math.ceil(Number(nalog?.kol || t.porucenaKolicina || 0) * 1.05);
  const m2 = sir > 0 ? (sir/1000 * kolPlus) : 0;
  const nanos = Number(String(k.nanosLepka||k.lepakNanos||"1.6").replace(/[^\d.]/g,""))||1.6;
  const brKas = Number(k.brojKasiranja||k.brKas||2);
  const kgLepka = m2 > 0 ? (m2 * nanos / 1000 * brKas).toFixed(1) : "—";
  const COLORS = [C.blue, C.green, C.amber];
  const ROLES = ["Spoljašnji / štampa","Srednji sloj","Unutrašnji / var"];

  return (
    <div style={{ fontFamily:"Inter,system-ui,sans-serif", fontSize:12, color:C.navy, maxWidth:800, margin:"0 auto" }}>
      {!embedded && <NalogHeader tip="Nalog za kaširanje" icon="🔗" nalog={nalog} />}

      <Section title="Parametri kaširanja / laminiranja" badge="lepak · valjak · temperatura" color={C.amber}>
        {/* 6 highlight kartica */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
          <HC label="Tip lepka" value={val(k.tipLepka||nalog?.tipLepka)} color={C.amber} />
          <HC label="Odnos mešanja" value={val(k.odnosLepka||nalog?.lepakOdnos)} color={C.amber} />
          <HC label="Nanos lepka" value={val(k.nanosLepka||nalog?.lepakNanos)+" g/m²"} color={C.amber} />
          <HC label="Širina valjka" value={val(k.sirinaValjka||folija.rezanje?.predlogValjkaKasiranja)+" mm"} color={C.blue} />
          <HC label="Temperatura" value={val(k.temperatura,"45°C")} color="#0284c7" />
          <HC label={"Kg lepka ("+brKas+"× auto)"} value={kgLepka+" kg"} sub={m2>0?(m2.toFixed(0)+" m² × "+nanos+" g/m² × "+brKas):""} color={C.green} />
        </div>

        {/* Dijagram slojeva */}
        <div style={{ fontWeight:900, fontSize:12, color:"#92400e", marginBottom:10 }}>Redosled spajanja slojeva:</div>
        <div style={{ border:`1px solid ${C.amberBd}`, borderRadius:10, overflow:"hidden" }}>
          {layers.map((l,i) => {
            const g = Number(l.gm2||l.tezina||l.tezinaGm2||0);
            const kgSloj = sir > 0 ? (g * sir/1000 * kolPlus / 1000).toFixed(1) : val(l.kg);
            const BG = [C.blue+"08", C.green+"08", C.amber+"08"];
            return (
              <React.Fragment key={i}>
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background:BG[i]||"#f8fafc" }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:COLORS[i]||C.muted, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:950, fontSize:13, flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:900, fontSize:12, marginBottom:2 }}>
                      {val(l.material||l.materijal||l.tip)} {val(l.oznaka||l.komercijalnaOznaka,"")} {val(l.debljina||l.deb,"")}µ
                    </div>
                    <div style={{ fontSize:11, color:C.muted }}>
                      {g.toFixed(2)} g/m² &nbsp;·&nbsp; {val(l.sirina||sir)} mm &nbsp;·&nbsp; {fmt(kolPlus)} m &nbsp;·&nbsp;
                      <span style={{ color:C.green, fontWeight:800 }}> {kgSloj} kg</span>
                    </div>
                  </div>
                  <div style={{ fontSize:10, fontWeight:800, padding:"4px 10px", borderRadius:6, background:COLORS[i]+"15", color:COLORS[i] }}>
                    {ROLES[i]||"Sloj "+(i+1)}
                  </div>
                </div>
                {i < layers.length-1 && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 14px", background:C.amberLt, borderTop:`1px dashed ${C.amberBd}`, borderBottom:`1px dashed ${C.amberBd}`, fontSize:11 }}>
                    <span style={{ fontSize:14, color:C.amber }}>↓</span>
                    <b style={{ color:"#92400e" }}>Kaširanje {i+1}:</b>
                    <span style={{ color:C.muted }}>
                      {val(k.tipLepka,"SF724A")} &nbsp;·&nbsp; {val(k.odnosLepka,"100:40")} &nbsp;·&nbsp; {nanos} g/m² &nbsp;·&nbsp; T={val(k.temperatura,"45°C")} &nbsp;·&nbsp; valjak {val(k.sirinaValjka,"860")} mm
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginTop:12 }}>
          <IF label="Površina (m²)" value={m2>0?m2.toFixed(0)+" m²":"—"} color={C.blue} />
          <IF label={"Kg lepka "+brKas+"×"} value={kgLepka+" kg"} color={C.green} />
          <IF label="Spoj materijala" value={val(k.materijalABC||k.spoj, layers.map(l=>l.material||l.tip||"?").join(" / "))} color={C.amber} />
          <IF label="Napomena" value={val(k.napomena||nalog?.napomena)} />
        </div>
      </Section>

      {!embedded && <QCFooter items={[
        ["Start","QR skeniranje naloga","Operator: ___________"],
        ["Ulazni materijal","QR rolne / magacin","Mašina: ___________"],
        ["Kontrola","lepak, temperatura, čvrstoća","QC: ___________"],
        ["Kraj","stvarna kol. + otpad","Potpis: ___________"],
      ]} />}
    </div>
  );
}
