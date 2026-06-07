import React, { useMemo, useState } from "react";

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
};

const pill = (bg, color) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 800,
  background: bg,
  color,
});

const sections = [
  {
    title: "1. Instalacija i okruženje",
    icon: "🧰",
    items: [
      "Node 20.x je instaliran",
      "npm install --legacy-peer-deps prolazi bez greške",
      ".env ima VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY",
      "npm run build prolazi pre deploy-a",
      "Vercel environment varijable su podešene za Production i Preview",
    ],
  },
  {
    title: "2. Supabase baza",
    icon: "🗄️",
    items: [
      "Pokrenute su sve SQL migracije iz paketa",
      "Postoje tabele za rolne/magacin, naloge, planove rezanja, mašine, MES, QC, AI i audit",
      "RLS je uključen za kritične tabele",
      "Indeksi postoje za status, datum, kupca, broj naloga, broj rolne i machine_id",
      "Backup baze je testiran eksportom i probnim restore-om",
    ],
  },
  {
    title: "3. Glavni workflow",
    icon: "🔗",
    items: [
      "Proizvod može da se pronađe po kupcu i šifri",
      "Iz kalkulacije se pravi ponuda",
      "Iz prihvaćene ponude se pravi nalog",
      "Nalog rezerviše materijal iz magacina",
      "Plan rezanja skida metražu i pravi ostatak rolne sa novim QR-om",
    ],
  },
  {
    title: "4. Proizvodnja i MES",
    icon: "🏭",
    items: [
      "Mašine imaju karakteristike i ograničenja",
      "Drag/drop plan ne dozvoljava nekompatibilnu mašinu bez upozorenja",
      "Radnik može da skenira sebe, mašinu, nalog i rolnu",
      "Učinak, škart i zastoji se upisuju u istoriju",
      "QC checklist blokira završetak naloga ako kontrola nije prošla",
    ],
  },
  {
    title: "5. AI i sigurnost akcija",
    icon: "🤖",
    items: [
      "AI čita sve ključne tabele kroz AI Data Hub",
      "AI predlozi se čuvaju kao predlozi, ne izvršavaju se bez potvrde",
      "Svaka AI akcija ima audit trag",
      "AI zna razliku između kalkulacije, ponude, naloga i plana rezanja",
      "Fallback radi ako neka tabela nije još napravljena",
    ],
  },
  {
    title: "6. Finalni korisnički test",
    icon: "✅",
    items: [
      "Testiran jedan realan nalog za foliju",
      "Testiran jedan realan nalog za kesu",
      "Testiran jedan realan nalog za špulnu",
      "Testirana štampa PDF naloga i QR etiketa",
      "Testirano vraćanje ostatka rolne u magacin",
    ],
  },
];

const smokeTests = [
  { name: "Login / Supabase režim", expected: "Aplikacija zahteva Supabase .env i prikazuje samo podatke iz baze." },
  { name: "Magacin rolni", expected: "Rolna se vidi, može se rezervisati i ažurirati metraža." },
  { name: "Planer rezanja", expected: "Plan bira rolnu, računa otpad i priprema QR za ostatak." },
  { name: "Mašine + scheduler", expected: "Nalog može da se prevuče na kompatibilnu mašinu." },
  { name: "MES tracking", expected: "Radnik upisuje učinak, škart i zastoje." },
  { name: "QC", expected: "Kontrola beleži rezultat i napomenu." },
  { name: "AI Agent", expected: "AI prikazuje podatke iz sistema i predlaže akcije." },
  { name: "Backup", expected: "Backup ekran prikazuje procedure i audit trag." },
];

function Progress({ value }) {
  return (
    <div style={{ height: 10, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: value > 85 ? "#16a34a" : value > 60 ? "#f59e0b" : "#ef4444" }} />
    </div>
  );
}

export default function FinalQADeploymentCenter({ msg }) {
  const [checked, setChecked] = useState({});
  const allItems = useMemo(() => sections.flatMap((s, si) => s.items.map((_, ii) => `${si}-${ii}`)), []);
  const done = allItems.filter((id) => checked[id]).length;
  const percent = Math.round((done / allItems.length) * 100);

  const toggle = (id) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const copyChecklist = () => {
    const text = sections
      .map((s) => `${s.title}\n${s.items.map((i) => `- [ ] ${i}`).join("\n")}`)
      .join("\n\n");
    navigator.clipboard?.writeText(text);
    msg?.("Final QA checklist kopiran.");
  };

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ ...card, background: "linear-gradient(135deg,#0f172a,#1e3a8a)", color: "white", border: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#bfdbfe", letterSpacing: 1.2 }}>FAZA 12 · FINAL QA / DEPLOYMENT</div>
              <h1 style={{ margin: "8px 0 8px", fontSize: 30, fontWeight: 900 }}>Finalna provera pre puštanja ERP/MES sistema</h1>
              <p style={{ margin: 0, color: "#dbeafe", maxWidth: 820, lineHeight: 1.5 }}>
                Ovaj centar služi da proveriš da li su baza, workflow, magacin, mašine, MES, AI, QR, QC i backup spremni za realan rad u proizvodnji.
              </p>
            </div>
            <div style={{ minWidth: 220, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#bfdbfe" }}>SPREMNOST</div>
              <div style={{ fontSize: 38, fontWeight: 950, margin: "4px 0" }}>{percent}%</div>
              <Progress value={percent} />
              <div style={{ marginTop: 8, fontSize: 12, color: "#dbeafe" }}>{done}/{allItems.length} stavki označeno</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 16 }}>
          {[
            ["Build", "npm run build", "#dcfce7", "#166534"],
            ["Baza", "SQL + RLS + indeksi", "#dbeafe", "#1d4ed8"],
            ["Workflow", "od ponude do analize", "#fef3c7", "#92400e"],
            ["Deploy", "Vercel / server ready", "#ede9fe", "#6d28d9"],
          ].map((x) => (
            <div key={x[0]} style={card}>
              <div style={pill(x[2], x[3])}>{x[0]}</div>
              <div style={{ marginTop: 12, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{x[1]}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
            {sections.map((section, si) => (
              <div key={section.title} style={card}>
                <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 900, color: "#0f172a" }}>{section.icon} {section.title}</h2>
                <div style={{ display: "grid", gap: 8 }}>
                  {section.items.map((item, ii) => {
                    const id = `${si}-${ii}`;
                    return (
                      <label key={id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 10, background: checked[id] ? "#f0fdf4" : "#f8fafc", border: `1px solid ${checked[id] ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!checked[id]} onChange={() => toggle(id)} style={{ marginTop: 2 }} />
                        <span style={{ fontSize: 13, lineHeight: 1.4, color: "#334155", fontWeight: 700 }}>{item}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <div style={card}>
              <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 900 }}>🚀 Deploy koraci</h2>
              <ol style={{ margin: 0, paddingLeft: 18, color: "#334155", fontSize: 13, lineHeight: 1.7, fontWeight: 700 }}>
                <li>Proveri `.env.example` i napravi `.env`.</li>
                <li>Pokreni SQL migracije u Supabase.</li>
                <li>Pokreni `npm install --legacy-peer-deps`.</li>
                <li>Pokreni `npm run build`.</li>
                <li>Deploy na Vercel ili interni server.</li>
                <li>Uradi smoke test realnim nalogom.</li>
              </ol>
              <button onClick={copyChecklist} style={{ marginTop: 14, width: "100%", border: 0, borderRadius: 12, background: "#0f172a", color: "white", padding: "12px 14px", fontWeight: 900, cursor: "pointer" }}>Kopiraj QA checklist</button>
            </div>

            <div style={card}>
              <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 900 }}>🧪 Smoke test</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {smokeTests.map((t) => (
                  <div key={t.name} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff" }}>
                    <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13 }}>{t.name}</div>
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>{t.expected}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...card, borderColor: "#fed7aa", background: "#fff7ed" }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900, color: "#9a3412" }}>⚠️ Pre realne proizvodnje</h2>
              <p style={{ margin: 0, color: "#9a3412", fontSize: 13, lineHeight: 1.5, fontWeight: 700 }}>
                Ne puštati sistem direktno na sve mašine. Prvo testirati sa 1–2 operatera, jednim realnim nalogom i nekoliko rolni iz magacina.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
