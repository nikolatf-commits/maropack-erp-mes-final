import React, { useState } from "react";
import { NalogHeader, Section, QCFooter, IF, HC, C, val, fmt } from "./NalogShared.jsx";
import { StampaKpdfPreview } from "./MPTPRollOrientation.jsx";

export default function NalogStampa_Folija({ nalog }) {
  const [imgUploaded, setImgUploaded] = useState(false);
  const t = nalog?.template || nalog?.templateData || {};
  const folija = nalog?.folija || t.folija || {};
  const stampa = folija.stampa || nalog?.stampa || {};
  const kpdf = folija.kpdf || nalog?.kpdf || {};
  const layers = folija.layers || nalog?.mats || [];
  const stampLayer = layers[0] || {};
  const kolPlus = Math.ceil(Number(nalog?.kol || t.porucenaKolicina || 0) * 1.05);
  const sir = Number(t.idealnaSirinaMaterijala || folija.rezanje?.sirinaMaterijala || nalog?.sir || 0);
  const g = Number(stampLayer.gm2||stampLayer.tezina||0);
  const kgStampa = sir > 0 && g > 0 ? (g * sir/1000 * kolPlus / 1000).toFixed(1) : val(stampLayer.kg);

  const params = [
    ["Mašina štampe", stampa.masina||nalog?.masina],
    ["Štamparija", stampa.stamparija||nalog?.stamparija],
    ["Broj boja", stampa.brojBoja||nalog?.brBoja],
    ["Strana štampe", stampa.strana||nalog?.stm],
    ["Obim valjka / cil.", stampa.obimValjka||nalog?.obimValjka],
    ["Raport", stampa.rapportCilindar||stampa.rapport],
    ["Klišea / debljina", stampa.klise||nalog?.grafika],
    ["Hilzna", stampa.precnikHilzne||nalog?.hilzna],
    ["Smer odmotavanja", stampa.smerOdmotavanja||nalog?.smer],
    ["KPDF", "po template-u"],
    ["Kontrola", "nijansa, registar, prianjanje, prohodnost"],
    ["Napomena", stampa.napomena||nalog?.napomena],
  ];

  return (
    <div style={{ fontFamily:"Inter,system-ui,sans-serif", fontSize:12, color:C.navy, maxWidth:800, margin:"0 auto" }}>
      <NalogHeader tip="Nalog za štampu" icon="🎨" nalog={nalog} />

      {/* KPDF sekcija */}
      <Section title="KPDF / Dizajn i PDF perforacije" badge="priprema / štampa / perforacija" color={C.purple}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
          <IF label="KPDF dizajn" value={kpdf.kpdfDizajn||"nije dodat / dodati u template"} />
          <IF label="Verzija dizajna" value={kpdf.verzijaD||"—"} />
          <IF label="PDF perforacije" value={kpdf.pdfPerf||"nije dodat / po spec."} />
          <IF label="Odobrenje" value="pre proizvodnje" />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div style={{ border:`2px dashed ${C.purple}44`, borderRadius:9, padding:16, textAlign:"center", background:C.purpleLt }}>
            <div style={{ fontSize:26, marginBottom:7 }}>🖼️</div>
            <div style={{ fontWeight:800, fontSize:12, color:C.purple, marginBottom:4 }}>Preview dizajna / KPDF</div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:9 }}>Thumbnail dizajna koji je ubačen u template. U realnom radu povlači se automatski iz template-a.</div>
            <label>
              <button onClick={e=>{e.preventDefault();e.target.parentElement.querySelector("input").click()}}
                style={{ background:C.purple, color:"#fff", border:"none", borderRadius:7, padding:"6px 14px", fontSize:11, fontWeight:800, cursor:"pointer" }}>
                Upload PNG / PDF
              </button>
              <input type="file" style={{ display:"none" }} onChange={()=>setImgUploaded(true)} />
            </label>
            {imgUploaded && <div style={{ marginTop:7, color:C.green, fontWeight:800, fontSize:11 }}>✓ Fajl uploadovan</div>}
          </div>
          <div style={{ border:`2px dashed ${C.purple}44`, borderRadius:9, padding:16, textAlign:"center", background:C.purpleLt }}>
            <div style={{ fontSize:26, marginBottom:7 }}>📄</div>
            <div style={{ fontWeight:800, fontSize:12, color:C.purple, marginBottom:4 }}>Preview PDF perforacije</div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:9 }}>Pozicija i tip perforacije se prikazuje i u nalogu za rezanje.</div>
            <div style={{ background:`${C.purple}15`, borderRadius:7, padding:"6px 10px", fontSize:11, color:C.purple, fontWeight:800, display:"inline-block" }}>
              {val(kpdf.tip,"Mikroperf")} · {val(kpdf.odnos,"30/60")} · {val(kpdf.smer,"Poprečno")}
            </div>
          </div>
        </div>
        <StampaKpdfPreview folija={folija} />
      </Section>

      {/* Parametri štampe */}
      <Section title="Parametri štampe" badge="flekso / kontrola grafike" color={C.blue}>
        {/* Highlight materijal */}
        <div style={{ background:C.blueLt, border:`1px solid ${C.blueBd}`, borderRadius:9, padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:10, color:C.muted, fontWeight:800, textTransform:"uppercase", marginBottom:3 }}>Materijal za štampu</div>
            <div style={{ fontSize:14, fontWeight:950, color:C.blue }}>
              {val(stampLayer.material||stampLayer.materijal||stampLayer.tip,"BOPP")} {val(stampLayer.oznaka,"")} {val(stampLayer.debljina||stampLayer.deb,"")}µ — Sloj 1 / spoljašnji
            </div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:14, flexWrap:"wrap" }}>
            {[["Širina", sir+" mm", C.blue], ["Metraža (+5%)", fmt(kolPlus)+" m", C.green], ["Kg za štampu", kgStampa+" kg", C.green]].map(([l,v,c])=>(
              <div key={l}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:800, textTransform:"uppercase", marginBottom:2 }}>{l}</div>
                <div style={{ fontSize:14, fontWeight:950, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabela parametara */}
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:C.purpleLt }}>
              <th style={{ padding:"7px 10px", textAlign:"left", fontSize:10, fontWeight:900, color:C.purple, borderBottom:`2px solid ${C.purpleBd}` }}>Parametar</th>
              <th style={{ padding:"7px 10px", textAlign:"left", fontSize:10, fontWeight:900, color:C.purple, borderBottom:`2px solid ${C.purpleBd}` }}>Vrednost</th>
              <th style={{ padding:"7px 10px", textAlign:"left", fontSize:10, fontWeight:900, color:C.purple, borderBottom:`2px solid ${C.purpleBd}` }}>Parametar</th>
              <th style={{ padding:"7px 10px", textAlign:"left", fontSize:10, fontWeight:900, color:C.purple, borderBottom:`2px solid ${C.purpleBd}` }}>Vrednost</th>
            </tr>
          </thead>
          <tbody>
            {[0,2,4,6,8,10].map(idx => {
              const a = params[idx], b = params[idx+1];
              if (!a) return null;
              return (
                <tr key={idx} style={{ borderBottom:"1px solid #f1f5f9" }}>
                  <td style={{ padding:"8px 10px", color:C.muted, fontWeight:700 }}>{a[0]}</td>
                  <td style={{ padding:"8px 10px", fontWeight:900 }}>{val(a[1])}</td>
                  {b ? <><td style={{ padding:"8px 10px", color:C.muted, fontWeight:700 }}>{b[0]}</td><td style={{ padding:"8px 10px", fontWeight:900 }}>{val(b[1])}</td></> : <><td/><td/></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <QCFooter items={[
        ["Start","QR skeniranje naloga","Operator: ___________"],
        ["Ulazni materijal","QR rolne / magacin","Mašina: ___________"],
        ["Kontrola","nijansa, registar, boje","QC: ___________"],
        ["Kraj","stvarna kol. + otpad","Potpis: ___________"],
      ]} />
    </div>
  );
}
