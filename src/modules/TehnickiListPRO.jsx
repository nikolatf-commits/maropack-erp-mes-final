import React, { useMemo, useState } from 'react';

function today() { return new Date().toLocaleDateString('sr-RS'); }
function makeNo() { return 'TL-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 9000 + 1000); }

export default function TehnickiListPRO({ db = {}, msg }) {
  const proizvodi = db.proizvodi || [];
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({
    broj: makeNo(), naziv: '', kupac: '', tip: 'folija', struktura: '', sirina: '', duzina: '', debljina: '', smer: 'Desni', perforacija: 'Ne', stampa: 'Flexo', boje: '', hilzna: '76', tolerancija: '±1 mm', pakovanje: 'Euro paleta', napomena: '',
  });

  const selected = useMemo(() => proizvodi.find(p => String(p.id || p.naziv) === selectedId), [selectedId, proizvodi]);

  function loadProduct(id) {
    setSelectedId(id);
    const p = proizvodi.find(x => String(x.id || x.naziv) === id);
    if (!p) return;
    const mats = Array.isArray(p.mats) ? p.mats.filter(m => m.tip).map(m => `${m.tip} ${m.deb || m.debljina || ''}µ`).join(' / ') : (p.struktura || '');
    setForm(prev => ({
      ...prev,
      naziv: p.naziv || p.prod || '',
      kupac: p.kupac || '',
      tip: p.tip || 'folija',
      struktura: mats,
      sirina: p.sir || p.sirina || '',
      duzina: p.duz || p.duzina || p.met || '',
      debljina: p.deb || p.debljina || '',
    }));
  }

  function upd(k, v) { setForm(prev => ({ ...prev, [k]: v })); }
  function print() { window.print(); }
  function save() { if (msg) msg('Tehnički list pripremljen lokalno.'); }

  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, boxShadow: '0 10px 30px rgba(15,23,42,0.06)' };
  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 10, outline: 'none', fontSize: 13, boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 };

  return (
    <div>
      <style>{`@media print{.no-print{display:none!important}.tl-print{box-shadow:none!important;border:none!important;margin:0!important}.app-sidebar,.sidebar{display:none!important}}`}</style>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0f172a' }}>📄 Tehnički List PRO</h2>
          <div style={{ color: '#64748b', fontSize: 13 }}>Standardizovani tehnički list proizvoda sa A4 štampom.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} style={{ padding: '10px 14px', border: 'none', background: '#16a34a', color: '#fff', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Sačuvaj</button>
          <button onClick={print} style={{ padding: '10px 14px', border: 'none', background: '#1d4ed8', color: '#fff', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>A4 Štampa</button>
        </div>
      </div>

      <div className="no-print" style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div><label style={lbl}>Učitaj iz baze proizvoda</label><select style={inp} value={selectedId} onChange={e => loadProduct(e.target.value)}><option value="">Ručno popunjavanje</option>{proizvodi.map(p => <option key={p.id || p.naziv} value={String(p.id || p.naziv)}>{p.naziv || p.prod} — {p.kupac || ''}</option>)}</select></div>
          <div><label style={lbl}>Broj tehničkog lista</label><input style={inp} value={form.broj} onChange={e => upd('broj', e.target.value)} /></div>
          <div><label style={lbl}>Tip proizvoda</label><select style={inp} value={form.tip} onChange={e => upd('tip', e.target.value)}><option value="folija">Folija</option><option value="kesa">Kesa</option><option value="spulna">Špulna</option></select></div>
        </div>
      </div>

      <div className="tl-print" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1d4ed8', paddingBottom: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#1d4ed8' }}>TEHNIČKI LIST PROIZVODA</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Broj: <b>{form.broj}</b> · Datum: <b>{today()}</b></div>
          </div>
          <div style={{ textAlign: 'right', fontWeight: 900, color: '#0f172a' }}>MAROPACK<br /><span style={{ fontSize: 11, color: '#64748b' }}>Fleksibilna ambalaža</span></div>
        </div>

        <Section title="Osnovni podaci" form={form} upd={upd} fields={[['naziv','Naziv proizvoda'],['kupac','Kupac'],['tip','Tip proizvoda'],['struktura','Struktura materijala']]} inp={inp} lbl={lbl} />
        <Section title="Dimenzije i tolerancije" form={form} upd={upd} fields={[['sirina','Širina / format'],['duzina','Dužina / metraža'],['debljina','Debljina'],['tolerancija','Tolerancija']]} inp={inp} lbl={lbl} />
        <Section title="Tehnološki parametri" form={form} upd={upd} fields={[['stampa','Štampa'],['boje','Broj boja / opis'],['smer','Smer odmotavanja'],['perforacija','Perforacija']]} inp={inp} lbl={lbl} />
        <Section title="Pakovanje i logistika" form={form} upd={upd} fields={[['hilzna','Hilzna'],['pakovanje','Pakovanje'],['napomena','Napomena']]} inp={inp} lbl={lbl} wide />

        <div style={{ display: 'grid', gridTemplateColumns: form.tip === 'kesa' ? '1fr 1fr' : '1fr', gap: 14, marginTop: 14 }}>
          <div style={{ border: '1px dashed #94a3b8', borderRadius: 14, padding: 18, minHeight: 150, background: '#f8fafc' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', marginBottom: 10 }}>TEHNIČKI CRTEŽ / ŠEMA</div>
            {form.tip === 'kesa' ? <BagSketch /> : form.tip === 'spulna' ? <RollSketch /> : <FilmSketch />}
          </div>
          {form.tip === 'kesa' && <div style={{ border: '1px dashed #94a3b8', borderRadius: 14, padding: 18, minHeight: 150, background: '#fff' }}><div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', marginBottom: 10 }}>OPCIJE KESE</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155' }}><li>Eurozumba / anleger / klapna prema nalogu</li><li>Pozicija dodataka upisuje se u nalogu</li><li>Kontrola dimenzija pre proizvodnje</li></ul></div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, fontSize: 12, color: '#475569' }}>
          <div>Izradio: _________________________</div>
          <div>Odobrio: _________________________</div>
          <div>Revizija: 1.0</div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, form, upd, fields, inp, lbl, wide }) {
  return <div style={{ marginTop: 14 }}><div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>{title}</div><div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(auto-fit,minmax(260px,1fr))' : 'repeat(2,1fr)', gap: 10 }}>{fields.map(([k,l]) => <div key={k} style={{ background: '#f8fafc', borderRadius: 12, padding: 10 }}><label style={lbl}>{l}</label><input className="no-print" style={inp} value={form[k] || ''} onChange={e => upd(k, e.target.value)} /><b style={{ fontSize: 13 }}>{form[k] || '—'}</b></div>)}</div></div>;
}

function FilmSketch() { return <svg viewBox="0 0 500 150" width="100%" height="150"><rect x="40" y="45" width="420" height="60" rx="10" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="3"/><line x1="70" y1="30" x2="70" y2="120" stroke="#64748b" strokeDasharray="5 5"/><line x1="430" y1="30" x2="430" y2="120" stroke="#64748b" strokeDasharray="5 5"/><text x="250" y="82" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1d4ed8">FOLIJA / ROLNA</text></svg>; }
function RollSketch() { return <svg viewBox="0 0 500 150" width="100%" height="150"><circle cx="250" cy="75" r="55" fill="#dcfce7" stroke="#16a34a" strokeWidth="4"/><circle cx="250" cy="75" r="18" fill="#fff" stroke="#16a34a" strokeWidth="3"/><text x="250" y="142" textAnchor="middle" fontSize="16" fontWeight="700" fill="#166534">ŠPULNA / NAMOTAJ</text></svg>; }
function BagSketch() { return <svg viewBox="0 0 500 180" width="100%" height="180"><rect x="145" y="25" width="210" height="130" rx="4" fill="#fee2e2" stroke="#b91c1c" strokeWidth="3"/><line x1="145" y1="55" x2="355" y2="55" stroke="#b91c1c" strokeDasharray="6 5"/><circle cx="250" cy="42" r="11" fill="#fff" stroke="#b91c1c" strokeWidth="3"/><text x="250" y="100" textAnchor="middle" fontSize="18" fontWeight="700" fill="#991b1b">KESA</text><text x="250" y="174" textAnchor="middle" fontSize="12" fill="#64748b">crtež se popunjava iz naloga</text></svg>; }
