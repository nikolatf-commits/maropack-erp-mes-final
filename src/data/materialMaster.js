
export const MATERIAL_MASTER = {
  BOPP:{koeficijent:0.91, oznake:{TRANSPARENT:[5,10,12,15,18,20,25,28,30,35,40,45,48,50,60,65,70,80,90,100], BELI:[5,10,15,20,25,30,35,40,45,50], SEDEF:[5,10,15,20,25,30,35,38,40,45], FXC:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100], FXCB:[12,15,18,20,24,25,30,35,40,45,48,50,60,70,80,90,100], FXCM:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100], FXPF:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100], FXS:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100]}},
  CPP:{koeficijent:0.91, oznake:{STANDARD:[5,10,12,15,18,20,25,28,30,35,40,45,48,50,60,70,80,90,100], PLC:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100], PLCB:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100], PLCBZ:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100], PLCDF:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100], PLCM:[12,15,18,20,25,30,35,40,45,48,50,60,70,80,90,100]}},
  OPP:{koeficijent:0.91, oznake:{STANDARD:[5,10,15,18,20,25,28,30,35,40,45,50], BELI:[15,20,25,30,35,40,50], SEDEF:[15,20,25,30,35,40]}},
  PET:{koeficijent:1.40, oznake:{STANDARD:[12,15,19,20,21,36,50,150]}},
  OPA:{koeficijent:1.10, oznake:{STANDARD:[12,15,20,25,30,35,40,52]}},
  PA:{koeficijent:1.14, oznake:{STANDARD:[10,15,20,23,28,30,35,40,45,50]}},
  "PA/PE":{koeficijent:1.0, oznake:{KOEKSTRUZIJA:[10,15,20,23,28,30,35,40,45,50,60,80,100]}},
  LDPE:{koeficijent:0.925, oznake:{STANDARD:[10,15,20,25,30,35,40,45,50,55,60,80]}},
  HDPE:{koeficijent:0.94, oznake:{STANDARD:[5,8,12,15,17,20,25,30,35,40,45,50,70]}},
  ALU:{koeficijent:2.71, oznake:{STANDARD:[7,9,12,15,20,25,30,35,40,45,50]}},
  PAPIR:{koeficijent:null,isGramatura:true, oznake:{STANDARD:[40,45,50,55,60,70,80,90,100,120]}},
  CELULOZA:{koeficijent:1.45, oznake:{STANDARD:[10,15,20,23,28,30,35,40,45,50,60]}},
  CELOFAN:{koeficijent:1.45, oznake:{STANDARD:[10,15,20,23,28,30,35,40,45,50]}}
};
export const getVrsteMaterijala=()=>Object.keys(MATERIAL_MASTER).sort();
export const getOznakeZaVrstu=(vrsta)=>Object.keys(MATERIAL_MASTER[String(vrsta||'').trim()]?.oznake||{}).sort();
export const getDebljineZaMaterijal=(vrsta,oznaka)=>MATERIAL_MASTER[String(vrsta||'').trim()]?.oznake?.[String(oznaka||'').trim()]||[];
export const getKoeficijent=(vrsta)=>MATERIAL_MASTER[String(vrsta||'').trim()]?.koeficijent??"";
export const calculateGm2=(vrsta,debljina)=>{const m=MATERIAL_MASTER[String(vrsta||'').trim()]; const d=Number(debljina||0); if(!d)return 0; if(m?.isGramatura)return +d.toFixed(3); return +(d*Number(m?.koeficijent||0)).toFixed(3);};
export const buildMaterialName=(vrsta,oznaka,debljina)=>{const v=String(vrsta||'').trim(); const o=String(oznaka||'').trim(); const d=String(debljina||'').trim(); const show=o&&o!=="STANDARD"&&o!=="TRANSPARENT"; return `${v}${show?' '+o:''} ${d}${v==='PAPIR'?' g/m²':'µ'}`.trim();};
export const kgFromMeters=({sirinaMm,metara,gm2})=>{const s=Number(sirinaMm||0)/1000,m=Number(String(metara||0).replace(',','.')),g=Number(String(gm2||0).replace(',','.')); return s&&m&&g?+((s*m*g)/1000).toFixed(3):0;};
export const metersFromKg=({sirinaMm,kg,gm2})=>{const s=Number(sirinaMm||0)/1000,k=Number(String(kg||0).replace(',','.')),g=Number(String(gm2||0).replace(',','.')); return s&&k&&g?+((k*1000)/(s*g)).toFixed(2):0;};
export function normalizeMaterial(mat={}){const vrsta=mat.vrsta||mat.tip||mat.type||''; const oznaka=mat.oznaka||mat.grade||mat.komercijalnaOznaka||'STANDARD'; const debljina=mat.debljina||mat.deb||mat.thickness||''; const gm2=mat.gm2||mat.tezina||mat.tezinaGm2||calculateGm2(vrsta,debljina); return {...mat,vrsta,oznaka,debljina,gm2,koeficijent:mat.koeficijent||getKoeficijent(vrsta),nazivMaterijala:mat.nazivMaterijala||buildMaterialName(vrsta,oznaka,debljina)}}
export function findMatchingRolls(rolls=[], req={}){const r=normalizeMaterial(req); const reqWidth=Number(req.sirina||req.sirinaMm||0); return rolls.filter(x=>{const roll=normalizeMaterial(x); const width=Number(x.sirina||x.sirinaMm||0); const status=String(x.status||'dostupna').toLowerCase(); return status.includes('dost') && (!r.vrsta||roll.vrsta===r.vrsta) && (!r.oznaka||roll.oznaka===r.oznaka) && (!r.debljina||Number(roll.debljina)===Number(r.debljina)) && (!reqWidth||width>=reqWidth);}).sort((a,b)=>Number(a.sirina||a.sirinaMm||0)-Number(b.sirina||b.sirinaMm||0));}
