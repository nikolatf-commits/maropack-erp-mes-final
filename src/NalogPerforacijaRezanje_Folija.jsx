import React from "react";
import { NalogHeader, Section, QCFooter, IF, HC, C, val, fmt } from "./NalogShared.jsx";
import { RezanjeMptpPanel } from "./MPTPRollOrientation.jsx";

export default function NalogPerforacijaRezanje_Folija({ nalog }) {
  const t = nalog?.template || nalog?.templateData || {};
  const folija = nalog?.folija || t.folija || {};
  const r = folija.rezanje || nalog?.rezanje || {};
  const kpdf = folija.kpdf || nalog?.kpdf || {};
  const finalRoll = folija.finalRoll || {};
  const stampa = folija.stampa || {};

  const sirinaMat = Number(r.sirinaMaterijala || t.idealnaSirinaMaterijala || 0);
  const sirinaTrake = Number(r.sirinaTrake || t.dimenzijaSirina || 0);
  const brojTraka = Number(r.brojTraka || 0);
  const duzinaRolne = Number(r.duzinaRolne || nalog?.kol || t.porucenaKolicina || 0);

  const trakeList = (() => {
    const raw = String(r.sirineTraka || "");
    const parsed = raw.split(",").map(x => Number(x.trim())).filter(Boolean);
    if (parsed.length) return parsed;
    if (brojTraka && sirinaTrake) return Array.from({ length: brojTraka }, () => sirinaTrake);
    return [];
  })();

  const ukupnoTrake = trakeList.reduce((s, t) => s + t, 0);
  const otpad = Math.max(0, sirinaMat - ukupnoTrake);
  const efikasnost = sirinaMat > 0 ? ((ukupnoTrake / sirinaMat) * 100).toFixed(1) : "—";
  const STRIP_COLORS = ["#fef2f2", "#fee2e2"];

  const qrUrl = (txt, s=90) => "https://api.qrserver.com/v1/create-qr-code/?size="+s+"x"+s+"&data="+encodeURIComponent(txt||"");

  return (
    <div style={{ fontFamily:"Inter,system-ui,sans-serif", fontSize:12, color:C.navy, maxWidth:800, margin:"0 auto" }}>
      <NalogHeader tip="Rezanje + Perforacija" icon="✂️" nalog={nalog} />

      {/* ── REZANJE ── */}
      <Section title="Plan rezanja / Slitting" badge="plan rezanja / finalna rolna" color={C.red}>
        {/* 4 highlight kartice */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
          <HC label="Ulazna širina" value={val(sirinaMat)+" mm"} color={C.red} />
          <HC label="Širina trake" value={val(sirinaTrake)+" mm"} color={C.red} />
          <HC label="Broj traka" value={val(brojTraka)} color={C.red} />
          <HC label="Metraža po roli" value={fmt(duzinaRolne)+" m"} color={C.green} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
          <IF label="Prečnik rolne" value={val(r.precnikRolne,"—")+" mm"} />
          <IF label="Hilzna" value={val(r.hilzna||finalRoll.hilzna||r.dorada,"—")} />
          <IF label="Smer GP" value={val(r.smerGP||finalRoll.smerOdmotavanja||stampa.smerOdmotavanja)} />
          <IF label="Dorada" value={val(r.dorada)} />
        </div>

        {/* Vizuelni prikaz rezanja */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
          <div style={{ fontWeight:900, fontSize:12, color:"#991b1b" }}>Grafički prikaz rezanja — {sirinaMat} mm ukupno</div>
          <div style={{ fontSize:11, fontWeight:800, color:C.green }}>Efikasnost: {efikasnost}%</div>
        </div>
        <div style={{ border:`1.5px solid ${C.redBd}`, borderRadius:9, overflow:"hidden", marginBottom:8 }}>
          <div style={{ display:"flex", height:56 }}>
            {trakeList.map((t,i) => (
              <div key={i} style={{ flex:t, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:2, background:STRIP_COLORS[i%2], borderRight: i<trakeList.length-1?`2px solid ${C.red}`:"none" }}>
                <span style={{ fontSize:11, fontWeight:950, color:"#991b1b" }}>{t}</span>
                <span style={{ fontSize:9, color:C.muted }}>T{i+1}</span>
              </div>
            ))}
            {otpad > 0 && (
              <div style={{ flex:otpad, display:"flex", alignItems:"center", justifyContent:"center", background:"#fca5a5", borderLeft:`2px solid ${C.red}`, textAlign:"center" }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:900, color:"#7f1d1d" }}>OTPAD</div>
                  <div style={{ fontSize:9, color:"#7f1d1d" }}>{otpad} mm</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 12px", background:"#fff", borderTop:`1px solid ${C.redBd}`, fontSize:10, fontWeight:800 }}>
            <span style={{ color:C.green }}>Iskorišćeno: {ukupnoTrake} mm ({trakeList.length}× {sirinaTrake}mm)</span>
            <span style={{ color:C.red }}>Otpad: {otpad} mm</span>
            <span style={{ color:C.blue }}>Raspored: {trakeList.join(",")} mm</span>
          </div>
        </div>
      </Section>

      {/* ── PERFORACIJA ── */}
      <Section title="Plan perforacije / KPDF" badge="mikro / makro perforacija" color={C.purple}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
          <HC label="Tip perforacije" value={val(kpdf.tip,"Mikroperforacija")} color={C.purple} />
          <HC label="Odnos / šema" value={val(kpdf.odnos,"30/60")} color={C.purple} />
          <HC label="Smer" value={val(kpdf.smer,"Poprečno")} color={C.purple} />
          <HC label="Pozicija" value={val(kpdf.pozicija,"15 mm od ruba")} color={C.purple} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
          <IF label="PDF perforacije" value={val(kpdf.pdfPerf,"dodati u template")} />
          <IF label="Razmak" value={val(kpdf.razmak)} />
          <IF label="Kontrola" value="pozicija, prohodnost, kontinuitet" />
          <IF label="Napomena" value={val(kpdf.napomena,"Kontrola pre serije")} />
        </div>
        {/* Vizuelni prikaz perforacije SVG */}
        <div style={{ border:`2px dashed ${C.purple}44`, borderRadius:10, padding:14, background:C.purpleLt }}>
          <svg width="100%" height="64" viewBox="0 0 740 64" style={{ display:"block" }}>
            <rect x="0" y="8" width="740" height="48" rx="7" fill="#ede9fe" stroke={C.purple} strokeWidth="1.5"/>
            {Array.from({ length:34 }).map((_,i) => {
              const x = 12+i*21;
              return (
                <g key={i}>
                  <line x1={x} y1="8" x2={x} y2="56" stroke={C.purple} strokeWidth="1" strokeDasharray="3 4" opacity="0.6"/>
                  <circle cx={x} cy="32" r="2.5" fill={C.purple} opacity="0.4"/>
                </g>
              );
            })}
            <text x="370" y="36" textAnchor="middle" fontSize="12" fontWeight="900" fill="#6d28d9" fontFamily="Inter,sans-serif">
              {val(kpdf.tip,"Mikroperforacija")} — {val(kpdf.odnos,"30/60")} — {val(kpdf.smer,"Poprečno")}
            </text>
          </svg>
          <div style={{ textAlign:"center", marginTop:7, fontSize:11, color:C.purple, fontWeight:800 }}>
            pozicija: {val(kpdf.pozicija,"15 mm od ruba")} · kontrola prohodnosti pre serije
          </div>
        </div>
      </Section>

      {/* ── FINALNA ROLNA ── */}
      <Section title="Specifikacija finalne rolne" badge="smer · namotavanje · etiketa" color={C.green}>
        <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:16, alignItems:"center" }}>
          <div style={{ background:C.greenLt, borderRadius:10, padding:14, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="150" height="118" viewBox="0 0 180 130">
              <defs><marker id="arrN" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#2446b8" strokeWidth="1.5"/></marker></defs>
              <ellipse cx="88" cy="62" rx="52" ry="52" fill="none" stroke={C.green} strokeWidth="16" opacity="0.18"/>
              <ellipse cx="88" cy="62" rx="52" ry="52" fill="none" stroke={C.green} strokeWidth="1.5"/>
              <ellipse cx="88" cy="62" rx="20" ry="20" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5"/>
              <ellipse cx="88" cy="62" rx="9" ry="9" fill="white" stroke="#475569" strokeWidth="1"/>
              <ellipse cx="142" cy="62" rx="10" ry="52" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1"/>
              <ellipse cx="142" cy="62" rx="4" ry="20" fill="#cbd5e1" stroke="#475569" strokeWidth="1"/>
              <path d="M136 20 Q156 10 161 30" fill="none" stroke="#2446b8" strokeWidth="1.5" markerEnd="url(#arrN)"/>
              <text x="88" y="110" textAnchor="middle" fontSize="9" fill="#475569" fontWeight="800" fontFamily="Inter,sans-serif">
                {val(r.hilzna||finalRoll.hilzna,"fi76/152")} · {val(r.smerGP||stampa.smerOdmotavanja,"Na glavu")}
              </text>
            </svg>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            <IF label="Hilzna" value={val(r.hilzna||finalRoll.hilzna,"fi 76/152")} color={C.blue} />
            <IF label="Prečnik" value={val(r.precnikRolne,"400")+" mm"} color={C.blue} />
            <IF label="Štampa" value={val(stampa.strana,"Spolja/Un.")} color={C.purple} />
            <IF label="Etiketa" value="QR + broj rolne" color={C.green} />
            <IF label="Smer odmotavanja" value={val(r.smerGP||stampa.smerOdmotavanja)} color={C.amber} />
            <IF label="Dužina rolne" value={fmt(duzinaRolne)+" m"} color={C.green} />
            <IF label="Pozicija perf." value={val(kpdf.pozicija,"15 mm od ruba")} color={C.purple} />
            <IF label="QC — kontrola" value="ivice, prečnik, namotavanje" />
          </div>
        </div>
      </Section>

      <Section title="MPTP / KPDF — realan prikaz motiva na rolni" badge="samo za rezanje" color={C.amber}>
        <RezanjeMptpPanel folija={folija} nalog={nalog} editable />
      </Section>

      <QCFooter items={[
        ["Start","QR skeniranje naloga","Operator: ___________"],
        ["Ulazni materijal","QR rolne / magacin","Mašina: ___________"],
        ["Kontrola","dimenzija, ivice, perf.","QC: ___________"],
        ["Kraj","stvarna kol. + otpad","Potpis: ___________"],
      ]} />
    </div>
  );
}
