import React, { useState, useEffect, useCallback, useRef } from "react";
import { getNavGroups } from "./config/navigation.js";
import { supabase } from "./supabase.js";
import { LOGO_B64, SPULNA_B64 } from "./constants.js";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import NalogFolija from "./NalogFolija.jsx";
import AIAsistentKalkulacije from "./AIAsistent-Kalkulacije.jsx";
import PregledNalogaPRO from "./PregledNalogaPRO.jsx";
import MaterialMasterPRO from "./components/MaterialMasterPRO.jsx";
import ProductTemplateEngineV20 from "./ProductTemplateEngineV20.jsx";
import ProductMasterPRO from "./ProductMasterPRO.jsx";
import ListaProizvodaKupci from './ListaProizvodaKupci.jsx';
import AnalizaPotrosnjeMaterijala from './AnalizaPotrosnjeMaterijala.jsx';
import NaloziProMES from "./NaloziProMES.jsx";
import MESWorkflowPRO from "./MESWorkflowPRO.jsx";
import PonudePRO from "./PonudePRO.jsx";
import KalkulacijaFolije from "./KalkulacijaFolije.jsx";
import KalkulacijaKese from "./KalkulacijaKese.jsx";
import KalkulacijaSpulne from "./KalkulacijaSpulne.jsx";
import KalkulatorMaticnihRolni from "./KalkulatorMaticnihRolni.jsx";
import PlanerRezanjaIzMagacina from "./PlanerRezanjaIzMagacina.jsx";
import QRCode from "qrcode";


// ============================================================================
// FRONTEND ERROR LOGGER - hvata beli ekran / mobilne QR greške
// Upisuje grešku u Supabase tabelu public.frontend_errors
// ============================================================================
function stringifyFrontendError(value) {
  try {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value?.message) return String(value.message);
    return JSON.stringify(value);
  } catch (_) {
    return String(value || "");
  }
}

async function logFrontendErrorToSupabase(message, stack = "") {
  try {
    if (!supabase || supabase.__localDemo) return;
    await supabase.from("frontend_errors").insert({
      message: stringifyFrontendError(message),
      stack: stringifyFrontendError(stack),
      url: String(window.location.href || ""),
      user_agent: String(navigator.userAgent || "")
    });
  } catch (e) {
    // Ne sme da ruši aplikaciju ako logovanje greške ne uspe.
    console.error("Frontend error logging failed:", e);
  }
}

if (typeof window !== "undefined" && !window.__MAROPACK_FRONTEND_ERROR_LOGGER__) {
  window.__MAROPACK_FRONTEND_ERROR_LOGGER__ = true;

  window.addEventListener("error", (event) => {
    logFrontendErrorToSupabase(
      event?.message || "window.error",
      event?.error?.stack || `${event?.filename || ""}:${event?.lineno || ""}:${event?.colno || ""}`
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    logFrontendErrorToSupabase(
      event?.reason?.message || event?.reason || "unhandledrejection",
      event?.reason?.stack || ""
    );
  });
}

// ✅ AUTH SISTEM - NOVI IMPORT-I
import { AuthProvider, useAuth } from './auth/AuthProvider';
import Login from './auth/Login';
import ProtectedRoute from './auth/ProtectedRoute';
import AuditLog from './admin/AuditLog';
import UserManagement from './UserManagement';

// ✅ RADNIK & MAGACIN PANEL - NOVI SISTEM

// ✅ MANAGER DASHBOARD
import ManagerDashboard from './components/ManagerDashboard/ManagerDashboard';

// ✅ LISTA KALKULACIJA
import ListaKalkulacija from './ListaKalkulacija';
import { kreirajPonuduIzKalkulacije } from './utils/kalkulacijeHelpers';

// ✅ PRO MODULI
import DashboardPRO from './DashboardPRO.jsx';
import MobileApp from './MobileApp.jsx';

// ✅ AI MODULI
import AIProductionPlanner from './AIProductionPlanner.jsx';
import AIChatAssistant from './AIChatAssistant.jsx';
import AIWasteOptimizer from './AIWasteOptimizer.jsx';
import AIQualityInspector from './AIQualityInspector.jsx';
import MasterNalogEngine from './modules/MasterNalogEngine.jsx';
import QRWorkflow from './modules/QRWorkflow.jsx';
import FormatiranjeRolniPRO from './modules/FormatiranjeRolniPRO.jsx';
import ProductionPlannerPRO from './modules/ProductionPlannerPRO.jsx';
import RolneWarehouseEngine from './modules/RolneWarehouseEngine.jsx';
import MobileRollScanner from './modules/MobileRollScanner.jsx';
import LiveProductionMES from './modules/LiveProductionMES.jsx';
import QualityControlPRO from './modules/QualityControlPRO.jsx';
import FinansijeKPI_PRO from './modules/FinansijeKPI_PRO.jsx';
import TehnickiListPRO from './modules/TehnickiListPRO.jsx';
import ProductAIWorkflow from './modules/ProductAIWorkflow.jsx';
import DocumentAIWorkflow from './modules/DocumentAIWorkflow.jsx';
import SystemStatusPRO from './modules/SystemStatusPRO.jsx';
import BackupSecurityCenter from './modules/BackupSecurityCenter.jsx';
import MachineSchedulerPRO from './modules/MachineSchedulerPRO.jsx';
import MESTrackingQualityPRO from './modules/MESTrackingQualityPRO.jsx';
import AIAgentCommandCenter from './modules/AIAgentCommandCenter.jsx';
import SystemStabilizationCenter from './modules/SystemStabilizationCenter.jsx';
import ProductionHardeningCenter from './modules/ProductionHardeningCenter.jsx';
import FinalQADeploymentCenter from './modules/FinalQADepoymentCenter.jsx';
import FinalProductionReadinessCenter from './modules/FinalProductionReadinessCenter.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import { fetchCoreData, generateMasterFromPonuda } from './services/supabaseCore.js';

// ==================== PROFESIONALNI NALOZI ====================
// Glavni prikaz je PregledNalogaPRO + NalogLayoutPRO.
// Stari posebni print importi su uklonjeni iz App.jsx da se ne mešaju dva izgleda naloga.

// ===================== MATERIJALI =====================
const MAT_DATA = {
    "BOPP": [5, 10, 15, 18, 20, 25, 28, 30, 35, 40, 45, 50, 55, 60, 65, 70].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP SEDEF": [5, 10, 15, 20, 25, 30, 35, 38, 40, 45].map(d => ({ d, t: +(d * 0.65).toFixed(2) })),
    "BOPP BELI": [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "LDPE": [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map(d => ({ d, t: +(d * 0.925).toFixed(2) })),
    "CPP": [5, 10, 15, 18, 20, 25, 28, 30, 35, 40, 45, 50, 55, 60].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "PET": [12, 15, 19, 20, 21, 36, 50, 150].map(d => ({ d, t: +(d * 1.4).toFixed(2) })),
    "OPA": [12, 15, 20, 25, 30, 35, 40].map(d => ({ d, t: +(d * 1.1).toFixed(2) })),
    "OPP": [5, 10, 15, 18, 20, 25, 28, 30, 35, 40, 45, 50].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "PLA": [5, 10, 15, 20, 25, 30, 35, 40, 45].map(d => ({ d, t: +(d * 1.24).toFixed(2) })),
    "HDPE": [5, 8, 12, 15, 17, 20, 25, 30, 35, 40, 45, 50].map(d => ({ d, t: +(d * 0.94).toFixed(2) })),
    "ALU": [7, 9, 12, 15, 20, 25, 30, 35, 40, 45, 50].map(d => ({ d, t: +(d * 2.71).toFixed(2) })),
    "CELULOZA": [10, 15, 20, 23, 28, 30, 35, 40, 45, 50].map(d => ({ d, t: +(d * 1.45).toFixed(2) })),
    "CELOFAN": [10, 15, 20, 23, 28, 30, 35, 40, 45, 50].map(d => ({ d, t: +(d * 1.45).toFixed(2) })),
    "PA": [10, 15, 20, 23, 28, 30, 35, 40, 45, 50].map(d => ({ d, t: +(d * 1.14).toFixed(2) })),
    "PA/PE koestruzija": [10, 15, 20, 23, 28, 30, 35, 40, 45, 50].map(d => ({ d, t: +(d * 1.0).toFixed(2) })),
    "CPP PLC": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "CPP PLCB": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "CPP PLCBZ": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "CPP PLCDF": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "CPP PLCM": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "CPP PLCML": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "CPP PLCMLS": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "CPP PLCBAF": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXC": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCB": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCM": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCMT": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPMT": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCFM": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCW": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPF": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXS": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXA": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXAA": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPA": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPM": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPFM": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPFB": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPLA": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPLF": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPU": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCLS": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCMLS": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCHFM": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXPBR": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCHM": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
    "BOPP FXCMB": [12, 15, 18, 20, 25, 30, 35, 40, 45, 48, 50, 60, 70, 80, 90, 100].map(d => ({ d, t: +(d * 0.91).toFixed(2) })),
};

const CENE = {
    "BOPP": 3.1, "BOPP SEDEF": 3.5, "BOPP BELI": 3.2, "LDPE": 1.8, "CPP": 2.2,
    "PET": 3.5, "OPA": 4.0, "OPP": 2.9, "PLA": 3.8, "HDPE": 1.9, "ALU": 7.5,
    "CELULOZA": 3.0, "CELOFAN": 3.0, "PA": 4.2, "PA/PE koestruzija": 1.8,
    "CPP PLC": 2.4, "CPP PLCB": 2.4, "CPP PLCBZ": 2.4, "CPP PLCDF": 2.4,
    "CPP PLCM": 2.4, "CPP PLCML": 2.4, "CPP PLCMLS": 2.4, "CPP PLCBAF": 2.4,
    "BOPP FXC": 3.1, "BOPP FXCB": 3.1, "BOPP FXCM": 3.1, "BOPP FXCMT": 3.1,
    "BOPP FXPMT": 3.1, "BOPP FXCFM": 3.1, "BOPP FXCW": 3.1, "BOPP FXPF": 3.1,
    "BOPP FXS": 3.1, "BOPP FXA": 3.1, "BOPP FXAA": 3.1, "BOPP FXPA": 3.1,
    "BOPP FXPM": 3.1, "BOPP FXPFM": 3.1, "BOPP FXPFB": 3.1, "BOPP FXPLA": 3.1,
    "BOPP FXPLF": 3.1, "BOPP FXPU": 3.1, "BOPP FXCLS": 3.1, "BOPP FXCMLS": 3.1,
    "BOPP FXCHFM": 3.1, "BOPP FXPBR": 3.1, "BOPP FXCHM": 3.1, "BOPP FXCMB": 3.1,
};

const USERS = [
    { id: 1, ime: "Admin", uloga: "admin", pass: "admin123" },
    { id: 2, ime: "Jovana", uloga: "radnik", pass: "jovana123" },
    { id: 3, ime: "Jelena", uloga: "radnik", pass: "jelena123" },
    { id: 4, ime: "Dunja", uloga: "radnik", pass: "dunja123" },
    { id: 5, ime: "Tihana", uloga: "radnik", pass: "tihana123" },
    { id: 6, ime: "Milan", uloga: "radnik", pass: "milan123" },
];

const PREVODI = {
    sr: { ponuda: "PONUDA", br: "Broj", dat: "Datum", vaz: "Važi do", kup: "Kupac", adr: "Adresa", kon: "Kontakt", naz: "Naziv proizvoda", kol: "Količina (m)", jc: "Cena €/1000m", uk: "Ukupno €", nap: "Napomena", pot: "Ovlašćeno lice", pdv: "PDV nije uključen", hv: "Hvala na poverenju!", pl: "Plaćanje: 30 dana od fakture." },
    en: { ponuda: "QUOTATION", br: "Number", dat: "Date", vaz: "Valid until", kup: "Customer", adr: "Address", kon: "Contact", naz: "Product name", kol: "Quantity (m)", jc: "Unit price €/1000m", uk: "Total €", nap: "Note", pot: "Authorized person", pdv: "VAT not included", hv: "Thank you for your business!", pl: "Payment: 30 days from invoice." },
    de: { ponuda: "ANGEBOT", br: "Nummer", dat: "Datum", vaz: "Gültig bis", kup: "Kunde", adr: "Adresse", kon: "Kontakt", naz: "Produktname", kol: "Menge (m)", jc: "Einzelpreis €/1000m", uk: "Gesamt €", nap: "Bemerkung", pot: "Bevollmächtigte Person", pdv: "MwSt. nicht enthalten", hv: "Vielen Dank!", pl: "Zahlung: 30 Tage nach Rechnung." },
};

const BOJE = ["#1d4ed8", "#7c3aed", "#0891b2", "#059669"];
const SLOJ = ["A", "B", "C", "D"];
const EM = { tip: "", deb: "", cena: "", stamp: false, kas: 0, lak: 0 };
const f2 = v => isNaN(v) || v === null ? "—" : (+v).toFixed(2).replace(".", ",");
const f4 = v => isNaN(v) || v === null ? "—" : (+v).toFixed(4).replace(".", ",");
const eu = v => f2(v) + " €";
const dnow = () => new Date().toLocaleDateString("sr-RS");
const nbr = () => "MP-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random() * 9000) + 1000);

// ===================== KOMPONENTE =====================
function Counter({ val, set, max, lab, col }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{lab}</div>
            <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#f8fafc" }}>
                <button onClick={function () { set(Math.max(0, val - 1)); }} style={{ width: 32, height: 36, border: "none", background: "transparent", cursor: "pointer", fontSize: 16, color: "#94a3b8", fontWeight: 700 }}>-</button>
                <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 700, padding: "6px 0", color: val > 0 ? col : "#cbd5e1", background: val > 0 ? col + "15" : "transparent", borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" }}>{val}x</div>
                <button onClick={function () { set(Math.min(max, val + 1)); }} style={{ width: 32, height: 36, border: "none", background: "transparent", cursor: "pointer", fontSize: 16, color: "#94a3b8", fontWeight: 700 }}>+</button>
            </div>
        </div>
    );
}

function Notif({ msg, tip }) {
    return (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: tip === "err" ? "#fef2f2" : "#f0fdf4", border: "1px solid " + (tip === "err" ? "#fecaca" : "#bbf7d0"), color: tip === "err" ? "#ef4444" : "#16a34a", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
            {msg}
        </div>
    );
}

function RezultatiKalk({ res, nal, met }) {
    if (!res) return null;
    var card = { background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e8edf3" };
    var lbl = { fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, display: "block" };
    return (
        <div style={{ display: "grid", gap: 12 }}>
            {/* Cene */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {[
                    ["Osn. cena / 1000m", res.osn_1000, "#64748b"],
                    ["Osn. cena / kg", res.osn_kg, "#64748b"],
                    ["Osn. cena nalog", res.osn_nalog, "#64748b"],
                ].map(function (x) {
                    return (
                        <div key={x[0]} style={Object.assign({}, card, { background: "#f8fafc" })}>
                            <span style={lbl}>{x[0]}</span>
                            <div style={{ fontSize: 15, fontWeight: 800, color: x[2] }}>{eu(x[1])}</div>
                        </div>
                    );
                })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {[
                    ["Cena sa maržom / 1000m", res.k1, "#1d4ed8"],
                    ["Cena sa maržom / kg", res.kkg, "#1d4ed8"],
                    ["Cena sa maržom nalog", res.kn, "#059669"],
                ].map(function (x) {
                    return (
                        <div key={x[0]} style={Object.assign({}, card, { background: x[2] + "08", border: "1.5px solid " + x[2] + "30" })}>
                            <span style={lbl}>{x[0]}</span>
                            <div style={{ fontSize: 15, fontWeight: 800, color: x[2] }}>{eu(x[1])}</div>
                        </div>
                    );
                })}
            </div>
            {/* Potrebe materijala */}
            <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📦 Potrebe materijala za nalog ({nal}x1000m)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
                    {res.det.map(function (m, i) {
                        return (
                            <div key={i} style={{ background: BOJE[i] + "08", border: "1px solid " + BOJE[i] + "30", borderRadius: 8, padding: "10px 12px" }}>
                                <div style={{ fontWeight: 700, fontSize: 12, color: BOJE[i], marginBottom: 4 }}>{SLOJ[i]}: {m.tip} {m.deb}µ</div>
                                <div style={{ fontSize: 12, color: "#475569" }}>Težina: <b>{f2(m.tg)} g/m²</b></div>
                                <div style={{ fontSize: 12, color: "#475569" }}>Ukupno kg: <b>{f2(m.tkg_nalog)} kg</b></div>
                                <div style={{ fontSize: 12, color: "#475569" }}>Ukupno m: <b>{f2(+met * +nal * 1000)} m</b></div>
                            </div>
                        );
                    })}
                    {res.ukLep > 0 && (
                        <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: "#854d0e", marginBottom: 4 }}>🔗 Lepak</div>
                            <div style={{ fontSize: 12, color: "#475569" }}>Ukupno kg: <b>{f2(res.ukLep_nalog)} kg</b></div>
                        </div>
                    )}
                    {res.ukLakM > 0 && (
                        <div style={{ background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: "#7c3aed", marginBottom: 4 }}>✨ Lak</div>
                            <div style={{ fontSize: 12, color: "#475569" }}>Ukupno kg: <b>{f2(res.ukLakM_nalog)} kg</b></div>
                        </div>
                    )}
                </div>
            </div>
            {/* Struktura troškova */}
            <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📊 Struktura troškova</div>
                {[["Materijali", res.ukM], ["Lepak", res.ukLep], ["Lak mat.", res.ukLakM], ["Kasiranje", res.ukKas], ["Stampa", res.ukSt], ["Lakiranje usl.", res.ukLakU], ["Transport", res.ukTr], ["Pakovanje", res.ukPk]].map(function (x) {
                    var pct = res.osn > 0 ? x[1] / res.osn * 100 : 0;
                    return (
                        <div key={x[0]} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                            <div style={{ width: 130, fontSize: 11, color: "#64748b" }}>{x[0]}</div>
                            <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", background: "#1d4ed8", borderRadius: 3, width: Math.max(pct, 0.3) + "%" }} />
                            </div>
                            <div style={{ width: 75, textAlign: "right", fontSize: 11, fontWeight: 600 }}>{f4(x[1])} €</div>
                            <div style={{ width: 30, textAlign: "right", fontSize: 10, color: "#94a3b8" }}>{pct.toFixed(0)}%</div>
                        </div>
                    );
                })}
                <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: 8, marginTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                    <span>OSNOVNA CENA / 1000m</span><span style={{ color: "#1d4ed8" }}>{f4(res.osn_1000)} €</span>
                </div>
            </div>
        </div>
    );
}

function PonudaView({ t, naziv, kupac, adr, kon, kol, c1, uk, nap, mats, broj, dat, vaz, printRef, tip }) {
    var f2l = function (v) { return isNaN(v) ? "—" : (+v).toFixed(2).replace(".", ","); };
    var kolLabel = tip === "kesa" ? "Količina (kom)" : tip === "spulna" ? "Količina (špulni)" : "Količina (m)";
    return (
        <div ref={printRef} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 28, fontFamily: "'Segoe UI',serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #1d4ed8" }}>
                <div>
                    <img src={LOGO_B64} alt="Maropack" style={{ height: 50, objectFit: "contain" }} />
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Fleksibilna ambalaza · Srbija</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#1d4ed8" }}>{t.ponuda}</div>
                    {broj && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{t.br}: <b>{broj}</b></div>}
                    {dat && <div style={{ fontSize: 11, color: "#64748b" }}>{t.dat}: <b>{dat}</b></div>}
                    {vaz && <div style={{ fontSize: 11, color: "#64748b" }}>{t.vaz}: <b>{vaz}</b></div>}
                </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.kup}</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{kupac || "—"}</div>
                    {adr && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{adr}</div>}
                    {kon && <div style={{ fontSize: 11, color: "#64748b" }}>{kon}</div>}
                </div>
                <div style={{ background: "#eff6ff", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.naz}</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{naziv || "—"}</div>
                    {mats && mats.filter(function (m) { return m.tip; }).length > 0 && (
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>{mats.filter(function (m) { return m.tip; }).map(function (m) { return m.tip + " " + (m.deb || m.debljina) + "µ"; }).join(" / ")}</div>
                    )}
                </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
                <thead>
                    <tr style={{ background: "#1d4ed8", color: "#fff" }}>
                        <th style={{ padding: "9px 10px", textAlign: "left" }}>{t.naz}</th>
                        <th style={{ padding: "9px 10px", textAlign: "right" }}>{kolLabel}</th>
                        <th style={{ padding: "9px 10px", textAlign: "right" }}>{t.jc}</th>
                        <th style={{ padding: "9px 10px", textAlign: "right" }}>{t.uk}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "10px" }}>{naziv || "—"}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{(kol || 0).toLocaleString()}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{f2l(c1)}</td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{f2l(uk)}</td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr style={{ background: "#f8fafc" }}>
                        <td colSpan={3} style={{ padding: "10px", fontWeight: 700, textAlign: "right" }}>{t.uk}:</td>
                        <td style={{ padding: "10px", fontWeight: 900, fontSize: 15, textAlign: "right", color: "#1d4ed8" }}>{f2l(uk)} €</td>
                    </tr>
                </tfoot>
            </table>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6 }}>* {t.pdv}</div>
            {nap && <div style={{ background: "#fffbeb", borderRadius: 7, padding: "9px 12px", fontSize: 11, color: "#92400e", marginBottom: 10 }}>📌 {t.nap}: {nap}</div>}
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ fontSize: 10, color: "#64748b" }}>{t.pl}</div>
                <div style={{ textAlign: "center" }}>
                    <div style={{ width: 100, borderTop: "1px solid #0f172a", paddingTop: 4, fontSize: 10, color: "#64748b" }}>{t.pot}</div>
                </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>{t.hv}</div>
        </div>
    );
}

function PrintA4({ data, onClose }) {
    const nalog = data.nalog;
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(data.link);
    const isPdf = /\.pdf$/i.test(data.link);
    function print() { window.print(); }
    return (
        <>
            <style>{`@media print{body *{visibility:hidden;}.print-area,.print-area *{visibility:visible;}.print-area{position:absolute;left:0;top:0;width:210mm;min-height:297mm;}.no-print{display:none !important;}}`}</style>
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflow: "auto" }}>
                <div style={{ background: "#fff", borderRadius: 12, maxWidth: 900, width: "100%", maxHeight: "95vh", overflow: "auto", display: "flex", flexDirection: "column" }}>
                    <div className="no-print" style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>A4 prikaz - {data.naz}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={print} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: data.col, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🖨️ Štampaj</button>
                            <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✕</button>
                        </div>
                    </div>
                    <div className="print-area" style={{ padding: "20mm 15mm", fontFamily: "'Segoe UI',system-ui,sans-serif", color: "#0f172a", width: "100%", boxSizing: "border-box", background: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "3px solid " + data.col, marginBottom: 20 }}>
                            <img src={LOGO_B64} alt="Maropack" style={{ height: 45, objectFit: "contain" }} />
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: data.col }}>{data.ik} {data.naz.toUpperCase()}</div>
                                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{new Date().toLocaleDateString("sr-RS")}</div>
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                            {[["Broj naloga", nalog.ponBr || "—"], ["Kupac", nalog.kupac || "—"], ["Proizvod", nalog.prod || nalog.naziv || "—"]].map(function (x) {
                                return <div key={x[0]} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", border: "1px solid #e2e8f0" }}><div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{x[0]}</div><div style={{ fontSize: 14, fontWeight: 700 }}>{x[1]}</div></div>;
                            })}
                        </div>
                        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fafafa" }}>
                            {isImage && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}><img src={data.link} alt={data.naz} style={{ maxWidth: "100%", maxHeight: "180mm", display: "block" }} /></div>}
                            {isPdf && <iframe src={data.link} style={{ width: "100%", height: "180mm", border: "none" }} title={data.naz} />}
                            {!isImage && !isPdf && <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}><div style={{ fontSize: 40, marginBottom: 10 }}>📄</div><a href={data.link} target="_blank" rel="noopener" style={{ color: data.col }}>Otvori dokument</a></div>}
                        </div>
                        <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}>
                            <div>Radnik: _____________________</div>
                            <div>Potpis: _____________________</div>
                            <div>Datum: {new Date().toLocaleDateString("sr-RS")}</div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

// ===================== NALOG IZ BAZE (bez ponude) =====================

// ===================== KALKULATOR FOLIJE =====================
function KalkulatorFolije({ user, db, setDb, setPage, msg, inp, card, lbl }) {
    const [mats, setMats] = useState([Object.assign({}, EM)]);
    const [naziv, setNaziv] = useState("");
    const [kupacKalk, setKupacKalk] = useState("");
    const [sir, setSir] = useState(85);
    const [met, setMet] = useState(1000);
    const [nal, setNal] = useState(120);
    const [sk, setSk] = useState(10);
    const [mar, setMar] = useState(40);
    const [pKas, setPKas] = useState(0.03);
    const [pSt, setPSt] = useState(1.35);
    const [pLakU, setPLakU] = useState(1.1);
    const [pTr, setPTr] = useState(0.3);
    const [pPak, setPPak] = useState(0.2);
    const [plep, setPlep] = useState(0.002);
    const [plak, setPlak] = useState(0.0012);
    const [clep, setClep] = useState(6);
    const [clak, setClak] = useState(6);
    const [ktab, setKtab] = useState("unos");
    const [res, setRes] = useState(null);
    const [pkupac, setPkupac] = useState("");
    const [padr, setPadr] = useState("");
    const [pkon, setPkon] = useState("");
    const [pnap, setPnap] = useState("");
    const [pjez, setPjez] = useState("sr");
    const [aktivna, setAktivna] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const ponudaRef = useRef(null);
    const [nalogFolija, setNalogFolija] = useState(null);

    async function kreirajNalogeDirectno() {
        if (!naziv.trim() || !pkupac.trim()) { msg("Unesite naziv i kupca!", "err"); return; }
        if (!res) { msg("Najpre sačinite kalkulaciju!", "err"); return; }
        var vm = mats.filter(function (m) { return m.tip && m.deb; });
        var brN = "MP-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random() * 9000) + 1000);
        var ik = +sir;
        var nalogData = {
            datumIsp: "", sk: +sk,
            mats: vm.map(function (m) { return Object.assign({}, m); }),
            sir: +sir, ik: ik, nal: +nal, met: +met,
            grafika: "Nov posao", stm: "Flexo", brBoja: "4", smer: "Desno",
            obimValjka: "", hilzna: "76",
            tipPerf: "", oblikPerf: "Fina (mikro)", razmakPerf: "", brzinaPerf: "120",
            secivo: "Zilet", stranaRez: "Stampa spolja",
            rezBrTraka: "", precnikRolne: "do 600mm", duzinaRolne: "5000",
            korona: "Ne", obelezavanje: "Crvena traka",
            pakovanjeRolni: "Svaka pojedinacno", paleta: "Euro paleta",
            tipLepka: "PU solventni", lepakOdnos: "3:1", lepakNanos: "3,5",
            rezFormati: [], res: res,
        };
        var NAZIVI = { mat: "Nalog za materijal", stm: "Nalog za stampu", kas: "Nalog za kasiranje", rez: "Nalog za rezanje" };
        var inserts = Object.keys(NAZIVI).map(function (k) {
            return {
                ponBr: brN, kupac: pkupac, prod: naziv, tip: "folija", kol: +nal * 1000,
                datum: new Date().toLocaleDateString("sr-RS"), status: "Ceka", ko: user.ime,
                nap: pnap, mats: nalogData, res: res, naziv: NAZIVI[k]
            };
        });
        try {
            var r = await supabase.from("nalozi").insert(inserts);
            if (r.error) throw r.error;
            msg("Kreirano " + inserts.length + " naloga! Br: " + brN);
            setNalogFolija(Object.assign({}, nalogData, {
                ponBr: brN, kupac: pkupac, prod: naziv,
                kol: +nal * 1000, datum: new Date().toLocaleDateString("sr-RS"), mats: nalogData
            }));
        } catch (e) { msg("Greska: " + e.message, "err"); }
    }

    if (nalogFolija) {
        return <NalogFolija nalog={nalogFolija} onClose={function () { setNalogFolija(null); }} msg={msg} />;
    }

    const calc = useCallback(function () {
        var vm = mats.filter(function (m) { return m.tip && m.deb; });
        if (!vm.length || !sir || !met) { setRes(null); return; }
        var W = +sir / 1000;
        var M = +met;
        var MN = +nal;
        var kas = vm.reduce(function (s, m) { return s + (+m.kas || 0); }, 0);
        var lak = vm.reduce(function (s, m) { return s + (+m.lak || 0); }, 0);
        var det = vm.map(function (m) {
            var arr = MAT_DATA[m.tip] || [];
            var found = null;
            for (var i = 0; i < arr.length; i++) { if (arr[i].d === +m.deb) { found = arr[i]; break; } }
            var tg = found ? found.t : 0;
            var tkg = (W * M * tg) / 1000;
            var tkg_nalog = (W * M * MN * tg) / 1000;
            var c = +m.cena || CENE[m.tip] || 0;
            return Object.assign({}, m, { tg: tg, tkg: tkg, tkg_nalog: tkg_nalog, c: c, uk: tkg * c });
        });
        var ukM = det.reduce(function (s, m) { return s + m.uk; }, 0);
        var ukK = det.reduce(function (s, m) { return s + m.tkg; }, 0);
        var ukLep = +plep * kas * +clep;
        var ukLep_nalog = ukLep * MN;
        var ukLakM = +plak * (W * M) * lak * +clak;
        var ukLakM_nalog = ukLakM * MN;
        var ukKas = kas * +pKas * W * M;
        var stMat = null;
        for (var i = 0; i < det.length; i++) { if (det[i].stamp) { stMat = det[i]; break; } }
        var ukSt = stMat ? stMat.tkg * +pSt : 0;
        var ukLakU = det.reduce(function (s, m) { return s + (m.lak > 0 ? m.tkg * +pLakU : 0); }, 0);
        var ukTr = +pTr * ukK;
        var ukPk = +pPak;

        // OSNOVNA CENA - za 1000m
        var osn = ukM + ukLep + ukLakM + ukKas + ukSt + ukLakU + ukTr + ukPk;
        var osn_kg = ukK > 0 ? osn / ukK : 0;
        var osn_1000 = osn; // Osnovna za 1000m
        var osn_nalog = osn * MN; // Osnovna za ceo nalog

        // SA ŠKARTOM
        var sas = osn * (1 + (+sk / 100)); // Sa škartom za 1000m
        var pun = sas * MN; // Sa škartom za ceo nalog

        // SA MARŽOM
        var mf = 1 + (+mar / 100);
        var k1 = sas * mf; // SA MARŽOM - CENA ZA 1000m
        var kkg = ukK > 0 ? k1 / ukK : 0; // Cena po kg
        var kn = k1 * MN; // UKUPNA VREDNOST NALOGA (sa maržom)

        setRes({
            det: det,
            ukM: ukM,
            ukK: ukK,
            ukLep: ukLep,
            ukLep_nalog: ukLep_nalog,
            ukLakM: ukLakM,
            ukLakM_nalog: ukLakM_nalog,
            ukKas: ukKas,
            ukSt: ukSt,
            ukLakU: ukLakU,
            ukTr: ukTr,
            ukPk: ukPk,
            kas: kas,
            lak: lak,
            osn: osn,
            osn_kg: osn_kg,
            osn_1000: osn_1000,
            osn_nalog: osn_nalog,
            sas: sas,
            pun: pun,
            k1: k1,
            kkg: kkg,
            kn: kn
        });
    }, [mats, sir, met, nal, sk, mar, pKas, pSt, pLakU, pTr, pPak, plep, plak, clep, clak]);

    useEffect(function () { calc(); }, [calc]);

    function updM(i, f, v) {
        setMats(function (p) { var n = p.slice(); n[i] = Object.assign({}, n[i]); n[i][f] = v; if (f === "tip") { n[i].deb = ""; n[i].cena = CENE[v] || ""; } return n; });
    }
    function addM() { if (mats.length < 4) setMats(function (p) { return p.concat([Object.assign({}, EM)]); }); }
    function delM(i) { if (mats.length > 1) setMats(function (p) { return p.filter(function (_, j) { return j !== i; }); }); }

    async function sacuvaj() {
        if (!res || !naziv.trim()) { msg("Unesite naziv proizvoda!", "err"); return; }
        var ik2 = mats.length > 0 ? +sir : +sir;
        var p = { naziv: naziv, kupac: kupacKalk, sir: sir, ik: ik2, met: met, nal: nal, sk: sk, mar: mar, mats: mats.slice(), res: Object.assign({}, res), datum: dnow(), ko: user.ime, tip: "folija" };
        try { const { error } = await supabase.from('proizvodi').insert([p]); if (error) throw error; msg("Proizvod sacuvan!"); }
        catch (e) { msg("Greska: " + e.message, "err"); }
    }

    async function kreirajPonudu() {
        if (!res || !naziv.trim()) { msg("Najpre zavrsiti kalkulaciju!", "err"); return; }
        if (!pkupac.trim()) { msg("Unesite naziv kupca!", "err"); return; }
        var p = { broj: nbr(), datum: dnow(), vaz: new Date(Date.now() + 30 * 24 * 3600000).toLocaleDateString("sr-RS"), kupac: pkupac, adr: padr, kon: pkon, naziv: naziv, kol: +nal * 1000, c1: res.k1, uk: res.kn, mats: mats.filter(function (m) { return m.tip && m.deb; }), nap: pnap, jez: pjez, status: "Aktivna", ko: user.ime, res: Object.assign({}, res), tip: "folija" };
        try { const { data, error } = await supabase.from('ponude').insert([p]).select(); if (error) throw error; setAktivna(data[0]); msg("Ponuda kreirana!"); }
        catch (e) { msg("Greska: " + e.message, "err"); }
    }

    async function kreirajNaloge(pon) {
        var vm = pon.mats;
        var brKas = vm.reduce(function (s, m) { return s + (+m.kas || 0); }, 0);
        var brLak = vm.reduce(function (s, m) { return s + (+m.lak || 0); }, 0);
        var hasSt = vm.some(function (m) { return m.stamp; });
        var tipProizvoda = (pon.tip || pon.tip_proizvoda || "folija").toLowerCase();
        var tipovi = [];
        tipovi.push({ tip: "materijal", naziv: "Nalog za potrebu materijala", ik: "box", boj: "#f59e0b" });
        if (tipProizvoda === "kesa") {
            tipovi.push({ tip: "stampa", naziv: "Nalog za štampu", ik: "print", boj: "#3b82f6" });
            tipovi.push({ tip: "kesa", naziv: "Nalog za kesu", ik: "bag", boj: "#b91c1c" });
            tipovi.push({ tip: "prikaz_kese", naziv: "Prikaz kese", ik: "image", boj: "#7c2d12" });
        } else if (tipProizvoda === "spulna" || tipProizvoda === "špulna") {
            tipovi.push({ tip: "spulna", naziv: "Nalog za špulne", ik: "roll", boj: "#059669" });
        } else {
            if (hasSt) tipovi.push({ tip: "stampa", naziv: "Nalog za štampu", ik: "print", boj: "#3b82f6" });
            for (var i = 1; i <= brKas; i++)tipovi.push({ tip: "kasiranje" + i, naziv: "Nalog za kaširanje " + i, ik: "link", boj: "#1d4ed8" });
            tipovi.push({ tip: "rezanje", naziv: "Nalog za rezanje", ik: "cut", boj: "#6366f1" });
            tipovi.push({ tip: "perforacija", naziv: "Nalog za perforaciju", ik: "circle", boj: "#8b5cf6" });
            tipovi.push({ tip: "izgled_rolne", naziv: "Izgled na rolni", ik: "roll", boj: "#0ea5e9" });
            if (brLak > 0) tipovi.push({ tip: "lakiranje", naziv: "Nalog za lakiranje", ik: "star", boj: "#7c3aed" });
        }
        var novi = tipovi.map(function (t) { return { ponBr: pon.broj, ponId: pon.id, kupac: pon.kupac, prod: pon.naziv, naziv: t.naziv, ik: t.ik, boj: t.boj, status: "Ceka", datum: dnow(), radnik: "", nap: "", kol: pon.kol, mats: pon.mats, tip: tipProizvoda, tip_proizvoda: tipProizvoda, tip_naloga: t.tip, vrsta: t.tip, operacija: t.naziv }; });
        try {
            const { error: e1 } = await supabase.from('nalozi').insert(novi); if (e1) throw e1;
            const { error: e2 } = await supabase.from('ponude').update({ status: "Odobrena" }).eq('id', pon.id); if (e2) throw e2;
            msg("Kreirano " + novi.length + " radnih naloga!"); setPage("nalozi");
        } catch (e) { msg("Greska: " + e.message, "err"); }
    }

    async function downloadPDF(ref, filename) {
        if (!ref.current) return;
        setPdfLoading(true);
        try { const canvas = await html2canvas(ref.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }); const imgData = canvas.toDataURL("image/png"); const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }); const pdfW = pdf.internal.pageSize.getWidth(); const pdfH = (canvas.height * pdfW) / canvas.width; pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH); pdf.save(filename + ".pdf"); msg("PDF preuzet!"); }
        catch (e) { msg("Greska PDF", "err"); }
        setPdfLoading(false);
    }

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🧮 Kalkulator folije</h2>
                <div style={{ display: "flex", gap: 6 }}>
                    {[["unos", "📋 Unos"], ["param", "⚙️ Parametri"], ["pon", "📄 Ponuda"], ["rez", "📊 Rezultati"]].map(function (t) {
                        return <button key={t[0]} onClick={function () { setKtab(t[0]); }} style={{ padding: "7px 14px", borderRadius: 7, border: ktab === t[0] ? "none" : "1px solid #e2e8f0", cursor: "pointer", fontSize: 12, fontWeight: 700, background: ktab === t[0] ? "#1d4ed8" : "#fff", color: ktab === t[0] ? "#fff" : "#64748b" }}>{t[1]}</button>;
                    })}
                </div>
            </div>

            {ktab === "unos" && (
                <div>
                    <div style={Object.assign({}, card, { marginBottom: 14 })}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div><label style={lbl}>Naziv proizvoda *</label><input style={Object.assign({}, inp, { fontSize: 14, fontWeight: 600 })} value={naziv} onChange={function (e) { setNaziv(e.target.value); }} placeholder="npr. BOPP/ALU/PE laminat 85mm" /></div>
                            <div><label style={lbl}>Kupac</label><input style={Object.assign({}, inp, { fontSize: 14 })} value={kupacKalk} onChange={function (e) { setKupacKalk(e.target.value); }} placeholder="Naziv kupca" /></div>
                        </div>
                    </div>
                    <div style={Object.assign({}, card, { marginBottom: 14 })}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            🧪 Sastav materijala
                            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>{mats.filter(function (m) { return m.tip; }).length}/4 sloja</span>
                            {res && res.kas > 0 && <span style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>🔗 {res.kas}x kas.</span>}
                            {res && res.lak > 0 && <span style={{ fontSize: 11, background: "#f5f3ff", color: "#7c3aed", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>✨ {res.lak}x lak.</span>}
                        </div>
                        {mats.map(function (m, i) {
                            return (
                                <div key={i} style={{ background: m.tip ? BOJE[i] + "08" : "#f8fafc", borderRadius: 10, padding: 14, border: "1.5px solid " + (m.tip ? BOJE[i] + "30" : "#e2e8f0"), marginBottom: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 5, background: BOJE[i], color: "#fff", fontSize: 11, fontWeight: 700 }}>{SLOJ[i]}</span>
                                        <span style={{ fontWeight: 700, fontSize: 13, color: BOJE[i] }}>Materijal {SLOJ[i]}</span>
                                        {mats.length > 1 && <button onClick={function () { delM(i); }} style={{ marginLeft: "auto", background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>x Ukloni</button>}
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                                        <div>
                                            <label style={lbl}>Tip materijala</label>
                                            <select style={inp} value={m.tip} onChange={function (e) { updM(i, "tip", e.target.value); }}>
                                                <option value="">-- Izaberi --</option>
                                                {Object.keys(MAT_DATA).map(function (k) { return <option key={k} value={k}>{k}</option>; })}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={lbl}>Debljina (µ)</label>
                                            <select style={Object.assign({}, inp, { color: m.tip ? "#1e293b" : "#94a3b8" })} value={m.deb} disabled={!m.tip} onChange={function (e) { updM(i, "deb", e.target.value); }}>
                                                <option value="">-- Izaberi --</option>
                                                {(MAT_DATA[m.tip] || []).map(function (o) { return <option key={o.d} value={o.d}>{o.d}µ</option>; })}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={lbl}>Spec. tezina g/m²</label>
                                            <div style={Object.assign({}, inp, { color: "#64748b", background: "#f1f5f9" })}>
                                                {(function () { if (!m.tip || !m.deb) return "—"; var arr = MAT_DATA[m.tip] || []; for (var j = 0; j < arr.length; j++) { if (arr[j].d === +m.deb) return f2(arr[j].t) + " g/m²"; } return "—"; })()}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto 1fr", gap: 10, alignItems: "start" }}>
                                        <Counter val={m.kas} set={function (v) { updM(i, "kas", v); }} max={3} lab="Kasiranje (prolazi)" col="#1d4ed8" />
                                        <Counter val={m.lak} set={function (v) { updM(i, "lak", v); }} max={3} lab="Lakiranje (prolazi)" col="#7c3aed" />
                                        <div>
                                            <label style={lbl}>Stampa</label>
                                            <button onClick={function () { updM(i, "stamp", !m.stamp); }} style={{ padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: "1.5px solid " + (m.stamp ? "#0891b2" : "#e2e8f0"), background: m.stamp ? "#ecfeff" : "#fff", color: m.stamp ? "#0891b2" : "#94a3b8" }}>🖨️ {m.stamp ? "Da" : "Ne"}</button>
                                        </div>
                                        <div>
                                            <label style={lbl}>Cena EUR/kg</label>
                                            <input type="number" style={inp} value={m.cena} step={0.1} placeholder={String(CENE[m.tip] || "")} onChange={function (e) { updM(i, "cena", e.target.value); }} />
                                            {m.tip && <div style={{ fontSize: 10, color: "#1d4ed8", marginTop: 3 }}>Baza: {CENE[m.tip]} EUR/kg</div>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {mats.length < 4 && <button onClick={addM} style={{ width: "100%", padding: 10, borderRadius: 8, border: "2px dashed #cbd5e1", background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>+ Dodaj sloj</button>}
                    </div>
                    <div style={Object.assign({}, card, { marginBottom: 14 })}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📐 Dimenzije i nalog</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
                            {[["Sirina mm", sir, setSir, 1], ["Metraza x1000m", met, setMet, 100], ["Nalog x1000m", nal, setNal, 1], ["Skart %", sk, setSk, 0.5], ["Marza %", mar, setMar, 1]].map(function (item) {
                                return <div key={item[0]}><label style={lbl}>{item[0]}</label><input type="number" style={inp} value={item[1]} step={item[3]} onChange={function (e) { item[2](e.target.value); }} /></div>;
                            })}
                        </div>
                    </div>
                    {res && (
                        <div style={Object.assign({}, card, { background: "linear-gradient(135deg,#eff6ff,#f0fdf4)", border: "1px solid #bfdbfe" })}>
                            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2, fontWeight: 700 }}>CENA SA MARŽOM / 1.000m</div>
                                    <div style={{ fontSize: 26, fontWeight: 900, color: "#1d4ed8" }}>{eu(res.k1)}</div>
                                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Osnovna: {eu(res.osn_1000)} | Nalog: {eu(res.kn)}</div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={sacuvaj}>💾 Sacuvaj</button>
                                    <button style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setKtab("pon"); if (kupacKalk) setPkupac(kupacKalk); }}>📄 Ponuda</button>
                                    <button style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setKtab("rez"); }}>📊 Rezultati</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {ktab === "param" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={card}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🔗 Lepak i lak</div>
                        {[["Potrosak lepka kg/m²", plep, setPlep, 0.0001], ["Cena lepka EUR/kg", clep, setClep, 0.1], ["Potrosak laka kg/m²", plak, setPlak, 0.0001], ["Cena laka EUR/kg", clak, setClak, 0.1]].map(function (x) {
                            return <div key={x[0]} style={{ marginBottom: 10 }}><label style={lbl}>{x[0]}</label><input type="number" style={inp} value={x[1]} step={x[3]} onChange={function (e) { x[2](e.target.value); }} /></div>;
                        })}
                    </div>
                    <div style={card}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🏭 Usluge</div>
                        {[["Kasiranje EUR/m²", pKas, setPKas, 0.01], ["Stampanje EUR/kg", pSt, setPSt, 0.05], ["Lakiranje usluga EUR/kg", pLakU, setPLakU, 0.05], ["Transport EUR/kg", pTr, setPTr, 0.01], ["Pakovanje EUR fiksno", pPak, setPPak, 0.01]].map(function (x) {
                            return <div key={x[0]} style={{ marginBottom: 10 }}><label style={lbl}>{x[0]}</label><input type="number" style={inp} value={x[1]} step={x[3]} onChange={function (e) { x[2](e.target.value); }} /></div>;
                        })}
                    </div>
                </div>
            )}

            {ktab === "pon" && (
                <div>
                    <div style={Object.assign({}, card, { marginBottom: 14 })}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📄 Podaci za ponudu</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div><label style={lbl}>Kupac *</label><input style={inp} value={pkupac} onChange={function (e) { setPkupac(e.target.value); }} placeholder="Firma d.o.o." /></div>
                            <div><label style={lbl}>Adresa</label><input style={inp} value={padr} onChange={function (e) { setPadr(e.target.value); }} placeholder="Ulica, Grad" /></div>
                            <div><label style={lbl}>Kontakt</label><input style={inp} value={pkon} onChange={function (e) { setPkon(e.target.value); }} placeholder="email / tel" /></div>
                            <div><label style={lbl}>Jezik</label>
                                <select style={inp} value={pjez} onChange={function (e) { setPjez(e.target.value); }}>
                                    <option value="sr">🇷🇸 Srpski</option><option value="en">🇬🇧 English</option><option value="de">🇩🇪 Deutsch</option>
                                </select>
                            </div>
                        </div>
                        <div><label style={lbl}>Napomena</label><textarea style={Object.assign({}, inp, { height: 65, resize: "vertical" })} value={pnap} onChange={function (e) { setPnap(e.target.value); }} /></div>
                    </div>
                    {res && (
                        <div style={Object.assign({}, card, { marginBottom: 14, background: "#fafbfc" })}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 12 }}>PREGLED PONUDE</div>
                            <PonudaView printRef={ponudaRef} t={PREVODI[pjez]} naziv={naziv} kupac={pkupac} adr={padr} kon={pkon} kol={+nal * 1000} c1={res.k1} uk={res.kn} nap={pnap} mats={mats.filter(function (m) { return m.tip && m.deb; })} tip="folija" />
                        </div>
                    )}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={kreirajPonudu}>📄 Kreiraj ponudu</button>
                        <button style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={kreirajNalogeDirectno}>⚡ Kreiraj naloge direktno</button>
                        {aktivna && (
                            <>
                                <button style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={function () { kreirajNaloge(aktivna); }}>🔧 Kreiraj naloge</button>
                                <button style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: pdfLoading ? 0.7 : 1 }} onClick={function () { downloadPDF(ponudaRef, "Ponuda-" + aktivna.broj); }}>
                                    {pdfLoading ? "⏳ Generisem..." : "⬇️ Preuzmi PDF"}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {ktab === "rez" && (
                !res ? <div style={Object.assign({}, card, { textAlign: "center", padding: 40, color: "#94a3b8" })}>Unesite materijale u Unos tab.</div> :
                    <RezultatiKalk res={res} nal={nal} met={met} />
            )}
        </div>
    );
}

// ===================== KALKULATOR SPULNE =====================
function KalkulatorSpulne({ user, msg, setPage, inp, card, lbl }) {
    const [naziv, setNaziv] = useState("");
    const [kupac, setKupac] = useState("");
    const [materijal, setMaterijal] = useState("");
    const [sirinaM, setSirinaM] = useState(360);
    const [W, setW] = useState(25);
    const [da, setDa] = useState(158);
    const [di, setDi] = useState(152);
    const [C, setC] = useState(0);
    const [G, setG] = useState(0);
    const [T, setT] = useState(180);
    const [D, setD] = useState(380);
    const [sideA, setSideA] = useState("Papir");
    const [sideB, setSideB] = useState("Silikon");
    const [maxMetara, setMaxMetara] = useState(8000);
    const [gramatura, setGramatura] = useState(60);
    const [cenaKg, setCenaKg] = useState(2.7);
    const [nalog, setNalog] = useState(100);
    const [sk, setSk] = useState(10);
    const [mar, setMar] = useState(40);
    const [pTr, setPTr] = useState(0.3);
    const [pPak, setPPak] = useState(0.2);
    const [nap, setNap] = useState("");
    const [ktab, setKtab] = useState("unos");
    const [res, setRes] = useState(null);
    const [aktivna, setAktivna] = useState(null);
    const [pkupac, setPkupac] = useState("");
    const [padr, setPadr] = useState("");
    const [pkon, setPkon] = useState("");
    const [pnap, setPnap] = useState("");
    const [pjez, setPjez] = useState("sr");

    useEffect(function () {
        if (!W || !maxMetara || !gramatura || !cenaKg || !sirinaM) { setRes(null); return; }
        var w = +W / 1000;
        var mPerSpulna = +maxMetara;
        var m2PerSpulna = w * mPerSpulna;
        var kgPerM2 = +gramatura / 1000;
        var kgPerSpulna = kgPerM2 * (+sirinaM / 1000) * mPerSpulna;
        var ukM2 = (+sirinaM / 1000) * (+nalog) * 1000;
        var brSpulni = Math.ceil(ukM2 / m2PerSpulna);
        var ukKg = kgPerM2 * ukM2;
        var ukMat = ukKg * (+cenaKg);
        var ukTr = (+pTr) * ukKg;
        var ukPk = +pPak;
        var osn = ukMat + ukTr + ukPk;
        var osn_m2 = ukM2 > 0 ? osn / ukM2 : 0;
        var osn_1000m2 = osn_m2 * 1000;
        var osn_kg = ukKg > 0 ? osn / ukKg : 0;
        var sas = osn * (1 + (+sk / 100));
        var mf = 1 + (+mar / 100);
        var kn = sas * mf;
        var k_1000m2 = (sas / ukM2) * 1000 * mf;
        var kkg = ukKg > 0 ? (kn / ukKg) : 0;
        setRes({ w, mPerSpulna, m2PerSpulna, kgPerSpulna, brSpulni, ukKg, ukM2, ukMat, ukTr, ukPk, osn, osn_m2, osn_1000m2, osn_kg, sas, kn, k_1000m2, kkg });
    }, [W, maxMetara, gramatura, cenaKg, sirinaM, nalog, sk, mar, pTr, pPak]);

    const f2l = function (v) { return (!v || isNaN(v)) ? "—" : (+v).toFixed(2).replace(".", ","); };
    const eu = function (v) { return f2l(v) + " €"; };

    async function sacuvaj() {
        if (!naziv.trim()) { msg("Unesite naziv!", "err"); return; }
        var p = { naziv, kupac, materijal, sirina_mat: +sirinaM, W: +W, da: +da, di: +di, C: +C, G: +G, T: +T, D: +D, side_a: sideA, side_b: sideB, max_metara: +maxMetara, napomena: nap, datum: new Date().toLocaleDateString("sr-RS"), ko: user.ime };
        try { const { error } = await supabase.from('spulne').insert([p]); if (error) throw error; msg("Špulna sacuvana!"); }
        catch (e) { msg("Greška: " + e.message, "err"); }
    }

    async function kreirajPonudu() {
        if (!naziv.trim() || !pkupac.trim()) { msg("Unesite naziv i kupca!", "err"); return; }
        if (!res) { msg("Najpre završiti kalkulaciju!", "err"); return; }
        var p = { broj: "MP-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random() * 9000) + 1000), datum: new Date().toLocaleDateString("sr-RS"), vaz: new Date(Date.now() + 30 * 24 * 3600000).toLocaleDateString("sr-RS"), kupac: pkupac, adr: padr, kon: pkon, naziv, kol: res.brSpulni, c1: res.k_1000m2, uk: res.kn, mats: [], nap: pnap, jez: pjez, status: "Aktivna", ko: user.ime, res: Object.assign({}, res), tip: "spulna" };
        try { const { data, error } = await supabase.from('ponude').insert([p]).select(); if (error) throw error; setAktivna(data[0]); msg("Ponuda kreirana!"); }
        catch (e) { msg("Greška: " + e.message, "err"); }
    }

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🔄 Kalkulator špulne</h2>
                <div style={{ display: "flex", gap: 6 }}>
                    {[["unos", "📋 Unos"], ["param", "⚙️ Parametri"], ["pon", "📄 Ponuda"], ["rez", "📊 Rezultati"]].map(function (t) {
                        return <button key={t[0]} onClick={function () { setKtab(t[0]); }} style={{ padding: "7px 14px", borderRadius: 7, border: ktab === t[0] ? "none" : "1px solid #e2e8f0", cursor: "pointer", fontSize: 12, fontWeight: 700, background: ktab === t[0] ? "#7c3aed" : "#fff", color: ktab === t[0] ? "#fff" : "#64748b" }}>{t[1]}</button>;
                    })}
                </div>
            </div>

            {ktab === "unos" && (
                <div>
                    <div style={Object.assign({}, card, { marginBottom: 14 })}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div><label style={lbl}>Naziv *</label><input style={inp} value={naziv} onChange={function (e) { setNaziv(e.target.value); }} placeholder="npr. Trake 25mm - 8000m" /></div>
                            <div><label style={lbl}>Kupac</label><input style={inp} value={kupac} onChange={function (e) { setKupac(e.target.value); }} /></div>
                            <div><label style={lbl}>Materijal</label><input style={inp} value={materijal} onChange={function (e) { setMaterijal(e.target.value); }} placeholder="npr. Papir silikonizani 60gr" /></div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <div><label style={lbl}>Side A</label><input style={inp} value={sideA} onChange={function (e) { setSideA(e.target.value); }} /></div>
                                <div><label style={lbl}>Side B</label><input style={inp} value={sideB} onChange={function (e) { setSideB(e.target.value); }} /></div>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                        <div style={card}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#7c3aed" }}>📐 Dimenzije špulne</div>
                            <img src={SPULNA_B64} alt="Skica" style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 12 }} />
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                {[["W - širina trake mm", W, setW], ["da - spoljašnji prečnik hilzne mm", da, setDa], ["di - unutrašnji prečnik mm", di, setDi], ["C mm", C, setC], ["G - gap mm", G, setG], ["T - širina hilzne mm", T, setT], ["D - max prečnik mm", D, setD], ["Širina materijala mm", sirinaM, setSirinaM], ["Max metara na špulni", maxMetara, setMaxMetara]].map(function (x) {
                                    return <div key={x[0]}><label style={lbl}>{x[0]}</label><input type="number" style={inp} value={x[1]} onChange={function (e) { x[2](e.target.value); }} /></div>;
                                })}
                            </div>
                        </div>
                        <div>
                            <div style={Object.assign({}, card, { marginBottom: 14 })}>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📦 Materijal i nalog</div>
                                <div style={{ display: "grid", gap: 10 }}>
                                    {[["Gramatura materijala g/m²", gramatura, setGramatura], ["Cena materijala EUR/kg", cenaKg, setCenaKg], ["Nalog x1000m", nalog, setNalog], ["Škart %", sk, setSk], ["Marža %", mar, setMar]].map(function (x) {
                                        return <div key={x[0]}><label style={lbl}>{x[0]}</label><input type="number" style={inp} value={x[1]} onChange={function (e) { x[2](e.target.value); }} /></div>;
                                    })}
                                </div>
                            </div>
                            {res && (
                                <div style={Object.assign({}, card, { background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", border: "1px solid #c4b5fd" })}>
                                    <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2, fontWeight: 700 }}>CENA SA MARŽOM / 1000m²</div>
                                    <div style={{ fontSize: 26, fontWeight: 900, color: "#7c3aed" }}>{eu(res.k_1000m2)}</div>
                                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Osnovna: {eu(res.osn_1000m2)} | Nalog: {eu(res.kn)}</div>
                                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <button style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "#059669", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={sacuvaj}>💾 Sacuvaj</button>
                                        <button style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setKtab("pon"); if (kupac) setPkupac(kupac); }}>📄 Ponuda</button>
                                        <button style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "#1d4ed8", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setKtab("rez"); }}>📊 Rezultati</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {ktab === "param" && (
                <div style={card}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⚙️ Parametri troškova</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {[["Transport EUR/kg", pTr, setPTr, 0.01], ["Pakovanje EUR fiksno", pPak, setPPak, 0.01]].map(function (x) {
                            return <div key={x[0]}><label style={lbl}>{x[0]}</label><input type="number" style={inp} value={x[1]} step={x[3]} onChange={function (e) { x[2](e.target.value); }} /></div>;
                        })}
                    </div>
                </div>
            )}

            {ktab === "pon" && (
                <div>
                    <div style={Object.assign({}, card, { marginBottom: 14 })}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📄 Podaci za ponudu</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div><label style={lbl}>Kupac *</label><input style={inp} value={pkupac} onChange={function (e) { setPkupac(e.target.value); }} /></div>
                            <div><label style={lbl}>Adresa</label><input style={inp} value={padr} onChange={function (e) { setPadr(e.target.value); }} /></div>
                            <div><label style={lbl}>Kontakt</label><input style={inp} value={pkon} onChange={function (e) { setPkon(e.target.value); }} /></div>
                            <div><label style={lbl}>Jezik</label>
                                <select style={inp} value={pjez} onChange={function (e) { setPjez(e.target.value); }}>
                                    <option value="sr">🇷🇸 Srpski</option><option value="en">🇬🇧 English</option><option value="de">🇩🇪 Deutsch</option>
                                </select>
                            </div>
                        </div>
                        <div><label style={lbl}>Napomena</label><textarea style={Object.assign({}, inp, { height: 60, resize: "vertical" })} value={pnap} onChange={function (e) { setPnap(e.target.value); }} /></div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={kreirajPonudu}>📄 Kreiraj ponudu</button>
                        {aktivna && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: 12, fontWeight: 700 }}>✅ Ponuda {aktivna.broj} kreirana</div>}
                    </div>
                </div>
            )}

            {ktab === "rez" && (
                !res ? <div style={Object.assign({}, card, { textAlign: "center", padding: 40, color: "#94a3b8" })}>Unesite podatke u Unos tab.</div> : (
                    <div style={{ display: "grid", gap: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                            {[["Osn. cena / 1000m²", res.osn_1000m2, "#64748b"], ["Osn. cena / kg", res.osn_kg, "#64748b"], ["Osnovna cena naloga", res.osn, "#64748b"], ["Cena sa maržom / 1000m²", res.k_1000m2, "#7c3aed"], ["Cena sa maržom / kg", res.kkg, "#7c3aed"], ["Cena sa maržom nalog", res.kn, "#059669"]].map(function (x) {
                                return (
                                    <div key={x[0]} style={Object.assign({}, card, { background: x[2] === "#059669" ? "#f0fdf4" : x[2] === "#7c3aed" ? "#f5f3ff" : "#f8fafc", border: "1.5px solid " + x[2] + "30" })}>
                                        <div style={{ fontSize: 9, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{x[0]}</div>
                                        <div style={{ fontSize: 18, fontWeight: 900, color: x[2] }}>{eu(x[1])}</div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={card}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📦 Potrebe za nalog ({nalog}×1000m)</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
                                {[["Broj špulni", res.brSpulni + " kom", "#7c3aed"], ["Ukupno m²", Math.round(res.ukM2).toLocaleString() + " m²", "#1d4ed8"], ["Ukupno kg mat.", res.ukKg.toFixed(1) + " kg", "#059669"], ["m² po špulni", res.m2PerSpulna.toFixed(1) + " m²", "#64748b"], ["kg po špulni", res.kgPerSpulna.toFixed(2) + " kg", "#64748b"]].map(function (x) {
                                    return (
                                        <div key={x[0]} style={{ background: x[2] + "10", border: "1px solid " + x[2] + "30", borderRadius: 8, padding: "10px 12px" }}>
                                            <div style={{ fontSize: 9, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{x[0]}</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: x[2] }}>{x[1]}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div style={card}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📊 Struktura troškova</div>
                            {[["Materijal", res.ukMat], ["Transport", res.ukTr], ["Pakovanje", res.ukPk]].map(function (x) {
                                var pct = res.osn > 0 ? x[1] / res.osn * 100 : 0;
                                return (
                                    <div key={x[0]} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                                        <div style={{ width: 120, fontSize: 12, color: "#64748b" }}>{x[0]}</div>
                                        <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                                            <div style={{ height: "100%", background: "#7c3aed", borderRadius: 3, width: Math.max(pct, 0.3) + "%" }} />
                                        </div>
                                        <div style={{ width: 80, textAlign: "right", fontSize: 12, fontWeight: 600 }}>{(+x[1]).toFixed(4).replace(".", ",")} €</div>
                                        <div style={{ width: 30, textAlign: "right", fontSize: 10, color: "#94a3b8" }}>{pct.toFixed(0)}%</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
            )}
        </div>
    );
}

// ===================== PONUDE PAGE =====================

// ===================== PONUDE PAGE =====================
function PonudePage({ db, setDb, card, inp, lbl, eu, msg, user, pregPonuda, setPregPonuda, pdfLoading, pregPonudaRef, downloadPDF, kreirajNalogeIzPonude, odbijPonudu, setPage, TIP_BOJA, TIP_LAB }) {
    var [filterKupac, setFilterKupac] = useState("");
    var [filterStatus, setFilterStatus] = useState("");
    var [filterTip, setFilterTip] = useState("");
    var [pretraga, setPretraga] = useState("");
    var [brisanje, setBrisanje] = useState(null);

    var kupci = [...new Set(db.ponude.map(function (p) { return p.kupac; }).filter(Boolean))].sort();

    var filtrirane = db.ponude.filter(function (p) {
        return (!filterKupac || p.kupac === filterKupac) &&
            (!filterStatus || p.status === filterStatus) &&
            (!filterTip || p.tip === filterTip) &&
            (!pretraga || (p.naziv || "").toLowerCase().includes(pretraga.toLowerCase()) || (p.broj || "").toLowerCase().includes(pretraga.toLowerCase()));
    });

    var poKupcu = {};
    filtrirane.forEach(function (p) {
        var k = p.kupac || "—";
        if (!poKupcu[k]) poKupcu[k] = [];
        poKupcu[k].push(p);
    });

    async function obrisiPonudu(id) {
        try {
            var res = await supabase.from('ponude').delete().eq('id', id);
            if (res.error) throw res.error;
            setDb(function (d) { return Object.assign({}, d, { ponude: d.ponude.filter(function (p) { return p.id !== id; }) }); });
            setBrisanje(null);
            setPregPonuda(null);
            msg("Ponuda obrisana!");
        } catch (e) { msg("Greška: " + e.message, "err"); }
    }

    var stBg = function (s) { return s === "Aktivna" ? "#fef9c3" : s === "Odobrena" ? "#dcfce7" : "#fee2e2"; };
    var stCl = function (s) { return s === "Aktivna" ? "#854d0e" : s === "Odobrena" ? "#166534" : "#991b1b"; };

    if (brisanje) {
        return (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 380, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Obriši ponudu?</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Ponuda <b>{brisanje.broj}</b> za <b>{brisanje.kupac}</b> će biti trajno obrisana.</div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                        <button style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={function () { obrisiPonudu(brisanje.id); }}>Da, obriši</button>
                        <button style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={function () { setBrisanje(null); }}>Otkaži</button>
                    </div>
                </div>
            </div>
        );
    }

    if (pregPonuda) {
        return (
            <div>
                <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={function () { setPregPonuda(null); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #1d4ed8", background: "transparent", color: "#1d4ed8", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>← Nazad</button>
                    <button style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: pdfLoading ? 0.7 : 1 }} onClick={function () { downloadPDF(pregPonudaRef, "Ponuda-" + (pregPonuda.broj || "")); }}>
                        {pdfLoading ? "⏳ Generišem..." : "⬇️ Preuzmi PDF"}
                    </button>
                    <button style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fef2f2", color: "#ef4444", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={function () { setBrisanje(pregPonuda); }}>🗑️ Obriši</button>
                </div>
                <div style={card}>
                    <PonudaView printRef={pregPonudaRef} t={PREVODI[pregPonuda.jez || "sr"]} naziv={pregPonuda.naziv} kupac={pregPonuda.kupac} adr={pregPonuda.adr} kon={pregPonuda.kon} kol={pregPonuda.kol} c1={pregPonuda.c1} uk={pregPonuda.uk} nap={pregPonuda.nap} mats={pregPonuda.mats} broj={pregPonuda.broj} dat={pregPonuda.datum} vaz={pregPonuda.vaz} tip={pregPonuda.tip} />
                    {pregPonuda.status === "Aktivna" && (
                        <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid #e2e8f0", display: "flex", gap: 10 }}>
                            <button style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={function () { kreirajNalogeIzPonude(pregPonuda); }}>🔧 Odobri i kreiraj naloge</button>
                            <button style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={function () { odbijPonudu(pregPonuda.id); setPregPonuda(null); }}>✕ Odbij</button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>📄 Ponude</h2>
                <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "#1d4ed8", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setPage("kalk_folija"); }}>🧮 Nova folija</button>
                    <button style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "#059669", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setPage("kalk_kesa"); }}>🛍️ Nova kesa</button>
                    <button style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setPage("kalk_spulna"); }}>🔄 Nova špulna</button>
                </div>
            </div>
            <div style={Object.assign({}, card, { marginBottom: 14, padding: "14px 16px" })}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input style={Object.assign({}, inp, { flex: 1, minWidth: 160 })} placeholder="🔍 Pretraži..." value={pretraga} onChange={function (e) { setPretraga(e.target.value); }} />
                    <select style={Object.assign({}, inp, { width: 170 })} value={filterKupac} onChange={function (e) { setFilterKupac(e.target.value); }}>
                        <option value="">👤 Svi kupci</option>
                        {kupci.map(function (k) { return <option key={k} value={k}>{k}</option>; })}
                    </select>
                    <select style={Object.assign({}, inp, { width: 140 })} value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value); }}>
                        <option value="">📊 Svi statusi</option>
                        <option>Aktivna</option><option>Odobrena</option><option>Odbijena</option>
                    </select>
                    <select style={Object.assign({}, inp, { width: 130 })} value={filterTip} onChange={function (e) { setFilterTip(e.target.value); }}>
                        <option value="">🏷️ Svi tipovi</option>
                        <option value="folija">Folija</option><option value="kesa">Kesa</option><option value="spulna">Špulna</option>
                    </select>
                    {(filterKupac || filterStatus || filterTip || pretraga) && (
                        <button style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setFilterKupac(""); setFilterStatus(""); setFilterTip(""); setPretraga(""); }}>✕ Reset</button>
                    )}
                </div>
            </div>
            {db.ponude.length === 0 ? (
                <div style={Object.assign({}, card, { textAlign: "center", padding: 50, color: "#94a3b8" })}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                    <div>Nema ponuda.</div>
                </div>
            ) : (
                Object.keys(poKupcu).sort().map(function (kupac) {
                    var ponudeKupca = poKupcu[kupac];
                    var ukupno = ponudeKupca.reduce(function (s, p) { return s + (+p.uk || 0); }, 0);
                    return (
                        <div key={kupac} style={{ marginBottom: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#0f172a", borderRadius: "10px 10px 0 0", color: "#fff" }}>
                                <span style={{ fontSize: 16 }}>👤</span>
                                <span style={{ fontWeight: 800, fontSize: 14 }}>{kupac}</span>
                                <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>{ponudeKupca.length} ponuda</span>
                                <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 13, color: "#93c5fd" }}>{ukupno.toFixed(2).replace(".", ",")} €</span>
                            </div>
                            <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", border: "1px solid #e2e8f0", borderTop: "none", overflow: "hidden" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                    <thead><tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                        {["Broj", "Naziv", "Tip", "Kol.", "Ukupno", "Status", "Datum", ""].map(function (h) { return <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11 }}>{h}</th>; })}
                                    </tr></thead>
                                    <tbody>
                                        {ponudeKupca.map(function (p) {
                                            return (
                                                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                    <td style={{ padding: "9px 10px", fontWeight: 700, color: "#1d4ed8" }}>{p.broj}</td>
                                                    <td style={{ padding: "9px 10px", fontWeight: 600, fontSize: 12 }}>{p.naziv}</td>
                                                    <td style={{ padding: "9px 10px" }}><span style={{ background: (TIP_BOJA[p.tip] || "#64748b") + "20", color: TIP_BOJA[p.tip] || "#64748b", borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 10 }}>{TIP_LAB[p.tip] || "—"}</span></td>
                                                    <td style={{ padding: "9px 10px", color: "#64748b" }}>{(p.kol || 0).toLocaleString()}</td>
                                                    <td style={{ padding: "9px 10px", fontWeight: 700, color: "#059669" }}>{eu(p.uk)}</td>
                                                    <td style={{ padding: "9px 10px" }}><span style={{ background: stBg(p.status), color: stCl(p.status), borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 11 }}>{p.status}</span></td>
                                                    <td style={{ padding: "9px 10px", color: "#64748b", fontSize: 12 }}>{p.datum}</td>
                                                    <td style={{ padding: "9px 10px" }}>
                                                        <div style={{ display: "flex", gap: 5 }}>
                                                            <button style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#1d4ed8", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }} onClick={function () { setPregPonuda(p); }}>👁️</button>
                                                            <button style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }} onClick={function () { setBrisanje(p); }}>🗑️</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

// ===================== BAZA PROIZVODA =====================
function BazaProizvoda({ db, setDb, card, inp, lbl, eu, msg, setPage, TIP_BOJA, TIP_LAB }) {
    var [filterKupac, setFilterKupac] = useState("");
    var [filterTip, setFilterTip] = useState("");
    var [pretraga, setPretraga] = useState("");

    var kupci = [...new Set(db.proizvodi.map(function (p) { return p.kupac; }).filter(Boolean))].sort();

    var filtrirani = db.proizvodi.filter(function (p) {
        return (!filterKupac || p.kupac === filterKupac) &&
            (!filterTip || p.tip === filterTip) &&
            (!pretraga || (p.naziv || "").toLowerCase().includes(pretraga.toLowerCase()));
    });

    var poKupcu = {};
    filtrirani.forEach(function (p) {
        var k = p.kupac || "Bez kupca";
        if (!poKupcu[k]) poKupcu[k] = [];
        poKupcu[k].push(p);
    });

    var BOJE = ["#1d4ed8", "#7c3aed", "#0891b2", "#059669"];
    var SLOJ = ["A", "B", "C", "D"];

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>📦 Baza proizvoda</h2>
                <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{filtrirani.length} / {db.proizvodi.length} proizvoda</div>
            </div>
            <div style={Object.assign({}, card, { marginBottom: 14, padding: "14px 16px" })}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input style={Object.assign({}, inp, { flex: 1, minWidth: 160 })} placeholder="🔍 Pretraži..." value={pretraga} onChange={function (e) { setPretraga(e.target.value); }} />
                    <select style={Object.assign({}, inp, { width: 170 })} value={filterKupac} onChange={function (e) { setFilterKupac(e.target.value); }}>
                        <option value="">👤 Svi kupci</option>
                        {kupci.map(function (k) { return <option key={k} value={k}>{k}</option>; })}
                    </select>
                    <select style={Object.assign({}, inp, { width: 140 })} value={filterTip} onChange={function (e) { setFilterTip(e.target.value); }}>
                        <option value="">🏷️ Svi tipovi</option>
                        <option value="folija">Folija</option><option value="kesa">Kesa</option><option value="spulna">Špulna</option>
                    </select>
                    {(filterKupac || filterTip || pretraga) && (
                        <button style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={function () { setFilterKupac(""); setFilterTip(""); setPretraga(""); }}>✕ Reset</button>
                    )}
                </div>
            </div>
            {db.proizvodi.length === 0 ? (
                <div style={Object.assign({}, card, { textAlign: "center", padding: 50, color: "#94a3b8" })}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
                    <div style={{ marginBottom: 12 }}>Baza je prazna.</div>
                    <button style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={function () { setPage("kalk_folija"); }}>+ Nova kalkulacija</button>
                </div>
            ) : (
                Object.keys(poKupcu).sort().map(function (kupac) {
                    var proizvKupca = poKupcu[kupac];
                    return (
                        <div key={kupac} style={{ marginBottom: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#0f172a", borderRadius: "10px 10px 0 0", color: "#fff" }}>
                                <span style={{ fontSize: 16 }}>👤</span>
                                <span style={{ fontWeight: 800, fontSize: 14 }}>{kupac}</span>
                                <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>{proizvKupca.length} {proizvKupca.length === 1 ? "proizvod" : "proizvoda"}</span>
                            </div>
                            <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", border: "1px solid #e2e8f0", borderTop: "none" }}>
                                {proizvKupca.map(function (p, pi) {
                                    var mats = (p.mats || []).filter(function (m) { return m.tip; });
                                    return (
                                        <div key={p.id} style={{ padding: "14px 16px", borderBottom: pi < proizvKupca.length - 1 ? "1px solid #f1f5f9" : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
                                            <span style={{ background: (TIP_BOJA[p.tip] || "#64748b") + "20", color: TIP_BOJA[p.tip] || "#64748b", borderRadius: 6, padding: "3px 10px", fontWeight: 700, fontSize: 10, flexShrink: 0, marginTop: 2 }}>{TIP_LAB[p.tip] || "—"}</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{p.naziv}</div>
                                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                    {mats.map(function (m, i) {
                                                        return (
                                                            <span key={i} style={{ fontSize: 11, background: BOJE[i] + "15", color: BOJE[i], borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>
                                                                {SLOJ[i]}: {m.tip} {m.deb}µ
                                                            </span>
                                                        );
                                                    })}
                                                    {p.sir && <span style={{ fontSize: 11, color: "#64748b", padding: "2px 7px", background: "#f1f5f9", borderRadius: 5 }}>📏 {p.sir}mm</span>}
                                                </div>
                                            </div>
                                            {p.res && p.res.k1 && (
                                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Cena/1000m</div>
                                                    <div style={{ fontSize: 18, fontWeight: 800, color: "#1d4ed8" }}>{eu(p.res.k1)}</div>
                                                </div>
                                            )}
                                            <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                                                <button style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#1d4ed8", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }} onClick={function () {
                                                    if (p.tip === "kesa") setPage("kalk_kesa");
                                                    else if (p.tip === "spulna") setPage("kalk_spulna");
                                                    else setPage("kalk_folija");
                                                }}>📋 Otvori kalk.</button>
                                                <button style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }} onClick={function () { setPage("novi_nalog_izbor"); }}>⚡ Kreiraj nalog</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

// ===================== MOBILNA STRANICA ZA RADNIKE =====================
var ZASTOJI = [
    { k: "Pauza za ručak", kat: "Planirani", i: "🍽️" },
    { k: "Kratka pauza", kat: "Planirani", i: "☕" },
    { k: "Promena smene", kat: "Planirani", i: "🔄" },
    { k: "Kvar mašine", kat: "Tehnički", i: "⚙️" },
    { k: "Održavanje mašine", kat: "Tehnički", i: "🧰" },
    { k: "Promena podešavanja", kat: "Tehnički", i: "🔧" },
    { k: "Nestanak struje/vazduha", kat: "Tehnički", i: "⚡" },
    { k: "Nema materijala", kat: "Materijal", i: "📦" },
    { k: "Nema boje", kat: "Materijal", i: "🎨" },
    { k: "Zamena rolne", kat: "Materijal", i: "🔁" },
    { k: "Loš materijal", kat: "Materijal", i: "⚠️" },
    { k: "Čeka prethodni nalog", kat: "Priprema", i: "📋" },
    { k: "Testiranje uzorka", kat: "Priprema", i: "🧪" },
    { k: "Kalibracija", kat: "Priprema", i: "🎯" },
    { k: "Kontrola kvaliteta", kat: "Kvalitet", i: "🔍" },
    { k: "Dorada", kat: "Kvalitet", i: "♻️" },
    { k: "Ostalo", kat: "Ostalo", i: "📝" },
];

function MobilniRadnik({ nalogId }) {
    var [nalog, setNalog] = useState(null);
    var [status, setStatus] = useState("ceka");
    var [startTime, setStartTime] = useState(null);
    var [elapsed, setElapsed] = useState(0);
    var [pauzeVreme, setPauzeVreme] = useState(0);
    var [pauzeStart, setPauzeStart] = useState(null);
    var [pauzeRazlog, setPauzeRazlog] = useState("");
    var [pauzeNapomena, setPauzeNapomena] = useState("");
    var [uradjeno, setUradjeno] = useState("");
    var [skart, setSkart] = useState("");
    var [radnik, setRadnik] = useState("");
    var [loading, setLoading] = useState(true);
    var [birePazu, setBirePazu] = useState(false);

    var IKONE = { "Nalog za materijal": "📦", "Nalog za stampu": "🖨️", "Nalog za kasiranje": "🔗", "Nalog za rezanje": "✂️", "Nalog za perforaciju": "🔵", "Nalog za lakiranje": "✨", "Nalog za spulne": "🔄" };

    useEffect(function () {
        supabase.from('nalozi').select('*').eq('id', nalogId).single().then(function (r) {
            if (r.data) setNalog(r.data);
            setLoading(false);
        });
    }, [nalogId]);

    useEffect(function () {
        if (status !== "u_toku" || !startTime) return;
        var t = setInterval(function () {
            setElapsed(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000) - pauzeVreme);
        }, 1000);
        return function () { clearInterval(t); };
    }, [status, startTime, pauzeVreme]);

    async function pocni() {
        var now = new Date().toISOString();
        setStartTime(now);
        setStatus("u_toku");
        await supabase.from('nalozi').update({ status: "U toku", radnik: radnik, start_time: now }).eq('id', nalogId);
    }

    function kliknutaPauza() {
        setBirePazu(true);
    }

    async function potvrdiPauzu(razlogObj) {
        var now = Date.now();
        setPauzeStart(now);
        setPauzeRazlog(razlogObj.k);
        setStatus("pauza");
        setBirePazu(false);
        // Snimi zastoj u bazu
        try {
            await supabase.from('nalog_zastoji').insert([{
                nalog_id: +nalogId,
                razlog: razlogObj.k,
                kategorija: razlogObj.kat,
                start_time: new Date(now).toISOString(),
                radnik: radnik || "nepoznat",
                napomena: pauzeNapomena
            }]);
        } catch (e) { console.error(e); }
    }

    async function nastavi() {
        var now = Date.now();
        var dodatno = Math.floor((now - pauzeStart) / 1000);
        setPauzeVreme(function (p) { return p + dodatno; });
        // Update zastoj u bazi
        try {
            var res = await supabase.from('nalog_zastoji')
                .select('id')
                .eq('nalog_id', +nalogId)
                .is('end_time', null)
                .order('id', { ascending: false })
                .limit(1);
            if (res.data && res.data[0]) {
                await supabase.from('nalog_zastoji').update({
                    end_time: new Date(now).toISOString(),
                    trajanje: dodatno
                }).eq('id', res.data[0].id);
            }
        } catch (e) { console.error(e); }
        setPauzeStart(null);
        setPauzeRazlog("");
        setPauzeNapomena("");
        setStatus("u_toku");
    }

    async function zavrsi() {
        if (!uradjeno) { alert("Unesite količinu!"); return; }
        var now = new Date().toISOString();
        await supabase.from('nalozi').update({
            status: "Završeno",
            end_time: now,
            vreme_rada: elapsed,
            uradjeno: +uradjeno,
            skart: +skart || 0
        }).eq('id', nalogId);
        setStatus("zavrseno");
    }

    var fmt = function (s) { var h = Math.floor(s / 3600); var m = Math.floor((s % 3600) / 60); var sec = s % 60; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0"); };

    if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#94a3b8" }}>⏳ Učitavam...</div>;
    if (!nalog) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#ef4444" }}>❌ Nalog nije pronađen!</div>;

    var ik = IKONE[nalog.naziv] || "🔧";

    // ---- IZBOR RAZLOGA PAUZE ----
    if (birePazu) {
        var grupirani = {};
        ZASTOJI.forEach(function (z) {
            if (!grupirani[z.kat]) grupirani[z.kat] = [];
            grupirani[z.kat].push(z);
        });
        var katBoje = { "Planirani": "#8b5cf6", "Tehnički": "#ef4444", "Materijal": "#f59e0b", "Priprema": "#0891b2", "Kvalitet": "#ec4899", "Ostalo": "#64748b" };
        return (
            <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI',system-ui,sans-serif", padding: 16, maxWidth: 420, margin: "0 auto" }}>
                <div style={{ background: "#fef3c7", borderRadius: 12, padding: 14, marginBottom: 14, border: "2px solid #fde68a", textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>⏸️</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#92400e" }}>Razlog pauze/zastoja</div>
                    <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>Izaberi razlog za nastavak</div>
                </div>
                {Object.keys(grupirani).map(function (kat) {
                    return (
                        <div key={kat} style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: katBoje[kat], textTransform: "uppercase", marginBottom: 6, paddingLeft: 4, letterSpacing: 0.5 }}>{kat}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                {grupirani[kat].map(function (z) {
                                    return (
                                        <button key={z.k} onClick={function () { potvrdiPauzu(z); }}
                                            style={{ padding: "12px 10px", borderRadius: 10, border: "1.5px solid " + katBoje[kat] + "40", background: "#fff", color: "#1e293b", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 20 }}>{z.i}</span>
                                            <span>{z.k}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
                <button onClick={function () { setBirePazu(false); }} style={{ width: "100%", marginTop: 10, padding: 14, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>← Otkaži</button>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", background: status === "u_toku" ? "#f0fdf4" : status === "pauza" ? "#fffbeb" : "#f8fafc", fontFamily: "'Segoe UI',system-ui,sans-serif", padding: 20, maxWidth: 420, margin: "0 auto" }}>
            <div style={{ background: "#0f172a", borderRadius: 14, padding: "14px 18px", marginBottom: 16, color: "#fff" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Radni nalog</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{nalog.ponBr}</div>
                <div style={{ fontSize: 14, color: "#93c5fd", marginTop: 2 }}>{nalog.kupac} · {nalog.prod}</div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", marginBottom: 14, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>{ik}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{nalog.naziv}</div>
                <div style={{ fontSize: 14, color: "#64748b" }}>Količina: <b>{(nalog.kol || 0).toLocaleString()} m</b></div>
            </div>

            {status === "ceka" && (
                <div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tvoje ime (opciono)</label>
                        <input value={radnik} onChange={function (e) { setRadnik(e.target.value); }} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 16, outline: "none", boxSizing: "border-box" }} placeholder="npr. Milan" />
                    </div>
                    <button onClick={pocni} style={{ width: "100%", padding: 20, borderRadius: 16, border: "none", background: "#059669", color: "#fff", fontSize: 22, fontWeight: 800, cursor: "pointer" }}>▶️ POČNI RAD</button>
                </div>
            )}

            {status === "u_toku" && (
                <div>
                    <div style={{ background: "#dcfce7", borderRadius: 14, padding: 20, textAlign: "center", marginBottom: 14, border: "2px solid #bbf7d0" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>⏱️ U TOKU</div>
                        <div style={{ fontSize: 52, fontWeight: 900, color: "#059669", fontVariantNumeric: "tabular-nums" }}>{fmt(elapsed)}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <button onClick={kliknutaPauza} style={{ padding: 18, borderRadius: 12, border: "none", background: "#f59e0b", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>⏸️ PAUZA</button>
                        <button onClick={function () { setStatus("unos"); }} style={{ padding: 18, borderRadius: 12, border: "none", background: "#1d4ed8", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>⏹️ ZAVRŠI</button>
                    </div>
                </div>
            )}

            {status === "pauza" && (
                <div>
                    <div style={{ background: "#fef3c7", borderRadius: 14, padding: 20, textAlign: "center", marginBottom: 14, border: "2px solid #fde68a" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", textTransform: "uppercase", marginBottom: 4 }}>⏸️ PAUZA</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>{pauzeRazlog}</div>
                        <div style={{ fontSize: 52, fontWeight: 900, color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>{fmt(elapsed)}</div>
                    </div>
                    <button onClick={nastavi} style={{ width: "100%", padding: 18, borderRadius: 12, border: "none", background: "#059669", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>▶️ NASTAVI RAD</button>
                </div>
            )}

            {status === "unos" && (
                <div style={{ background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📊 Unesi rezultate</div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Urađena količina (m) *</label>
                        <input type="number" value={uradjeno} onChange={function (e) { setUradjeno(e.target.value); }} style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "2px solid #1d4ed8", fontSize: 22, fontWeight: 700, outline: "none", boxSizing: "border-box" }} placeholder="0" />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Škart (m)</label>
                        <input type="number" value={skart} onChange={function (e) { setSkart(e.target.value); }} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 18, outline: "none", boxSizing: "border-box" }} placeholder="0" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <button onClick={function () { setStatus("u_toku"); }} style={{ padding: 14, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Nazad</button>
                        <button onClick={zavrsi} style={{ padding: 14, borderRadius: 10, border: "none", background: "#059669", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✅ Potvrdi</button>
                    </div>
                </div>
            )}

            {status === "zavrseno" && (
                <div style={{ background: "#f0fdf4", borderRadius: 14, padding: 28, border: "2px solid #bbf7d0", textAlign: "center" }}>
                    <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#166534", marginBottom: 10 }}>Završeno!</div>
                    <div style={{ fontSize: 14, color: "#064e3b", marginBottom: 4 }}>Vreme rada: <b>{fmt(elapsed)}</b></div>
                    <div style={{ fontSize: 14, color: "#064e3b", marginBottom: 4 }}>Urađeno: <b>{(+uradjeno).toLocaleString()} m</b></div>
                    {+skart > 0 && <div style={{ fontSize: 14, color: "#ef4444" }}>Škart: <b>{(+skart).toLocaleString()} m</b></div>}
                </div>
            )}
        </div>
    );
}

// Mobilna stranica za radnike - pronalazi nalog po ponBr+suffix
function MobilniRadnikPonBr({ ponBr }) {
    var [nalogId, setNalogId] = useState(null);
    var [greska, setGreska] = useState(false);

    useEffect(function () {
        supabase.from('nalozi').select('id').eq('ponBr', ponBr).single()
            .then(function (r) {
                if (r.data) setNalogId(r.data.id);
                else {
                    // Try matching ponBr prefix (e.g. MP-2026-1042 matches MP-2026-1042-7)
                    var base = ponBr.replace(/-\d+$/, '');
                    supabase.from('nalozi').select('id').eq('ponBr', base).limit(1)
                        .then(function (r2) {
                            if (r2.data && r2.data[0]) setNalogId(r2.data[0].id);
                            else setGreska(true);
                        });
                }
            });
    }, [ponBr]);

    if (greska) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", flexDirection: "column", gap: 12 }}><div style={{ fontSize: 48 }}>❌</div><div style={{ color: "#ef4444", fontWeight: 700 }}>Nalog nije pronađen: {ponBr}</div></div>;
    if (!nalogId) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#94a3b8" }}>⏳ Učitavam nalog...</div>;
    return <MobilniRadnik nalogId={nalogId} />;
}

// ============================================
// GLAVNA APLIKACIJA SA AUTH SISTEMOM
// ============================================
function MainAppContent() {
    // ✅ AUTH HOOK - dobija user info
    const { user, userProfile, signOut, isAdmin, isManager, isMagacioner, canEdit } = useAuth();

    // ✅ PROFESIONALNI NALOZI
    // Jedan glavni prikaz naloga: PregledNalogaPRO. Nema više paralelnog starog print layout-a.

    // ---- MAGACIN QR SCANNER (QR skeniranje rolni) ----
    var urlParams = new URLSearchParams(window.location.search);
    var rolnaQR = urlParams.get("rolna"); // ?rolna=R-2026-001
    var nalogQR = urlParams.get("nalog"); // ?nalog=MP-2026-0001

    var scannerQR = urlParams.get("scanner"); // ?scanner=rolne

    if (scannerQR === "rolne" || scannerQR === "rolls") {
        return <MobileRollScanner msg={function(m){ console.log(m); }} />;
    }

    if (rolnaQR) {
        return <MobilniMagacin brRolne={rolnaQR} />;
    }

    if (nalogQR) {
        return <PregledNalogaPRO brojNaloga={nalogQR} osnovniNalog={{ ponBr: nalogQR }} />;
    }
    // -----------------------------------------------------

    const [page, setPage] = useState("dashboard_pro");
    const [openGroups, setOpenGroups] = useState(['dashboard']);
    const [isMobileViewport, setIsMobileViewport] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.innerWidth < 768;
    });

    useEffect(function () {
        function handleResize() {
            setIsMobileViewport(window.innerWidth < 768);
        }
        handleResize();
        window.addEventListener("resize", handleResize);
        window.addEventListener("orientationchange", handleResize);
        return function () {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("orientationchange", handleResize);
        };
    }, []);

    useEffect(function () {
        if (isMagacioner) {
            setPage("rolne_engine");
            setOpenGroups(["magacin"]);
        }
    }, [isMagacioner]); // ✅ ACCORDION STATE
    const [db, setDb] = useState({ proizvodi: [], ponude: [], nalozi: [], master_nalozi: [], rolne: [], masine: [], radnici: [], production_sessions: [], qc_zapisnici: [] });
    const [notif, setNotif] = useState(null);
    const [lIme, setLIme] = useState("");
    const [lPass, setLPass] = useState("");
    const [lErr, setLErr] = useState("");
    const [pregNalog, setPregNalog] = useState(null);
    const [pregPonuda, setPregPonuda] = useState(null);
    const [stampa, setStampa] = useState(null);
    const [uploading, setUploading] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const pregPonudaRef = useRef(null);

    const msg = useCallback(function (m, t) { setNotif({ msg: m, tip: t || "ok" }); setTimeout(function () { setNotif(null); }, 3000); }, []);


    // ========================================================================
    // LEGACY KOMPATIBILNOST: dugme "Prihvati ponudu" sada koristi PRO tok
    // Kalkulacija -> Ponuda -> Profesionalni radni nalozi
    // ========================================================================
    async function handlePrihvatiPonudu(ponuda) {
        return kreirajNalogeIzPonude(ponuda);
    }

    async function downloadPDF(ref, filename) {
        if (!ref.current) return;
        setPdfLoading(true);
        try { const canvas = await html2canvas(ref.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }); const imgData = canvas.toDataURL("image/png"); const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }); const pdfW = pdf.internal.pageSize.getWidth(); const pdfH = (canvas.height * pdfW) / canvas.width; pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH); pdf.save(filename + ".pdf"); msg("PDF preuzet!"); }
        catch (e) { msg("Greska PDF", "err"); }
        setPdfLoading(false);
    }

    useEffect(function () {
        if (!user) return;
        async function loadData() {
            try {
                let core = { proizvodi: [], ponude: [], nalozi: [], master_nalozi: [], rolne: [], masine: [], radnici: [], production_sessions: [], qc_zapisnici: [] };
                try {
                    core = await fetchCoreData();
                } catch (coreError) {
                    console.warn("Supabase Core tabele nisu dostupne ili RLS blokira čitanje, koristim lokalni fallback:", coreError.message);
                }

                let lokalniDb = { proizvodi: [], ponude: [], nalozi: [], master_nalozi: [], rolne: [], masine: [], radnici: [], production_sessions: [], qc_zapisnici: [] };
                try { lokalniDb = JSON.parse(window.localStorage.getItem("maropack_db") || "{}"); } catch (e) { }
                let lokalniNalozi = [];
                let lokalniMasteri = [];
                try { lokalniNalozi = JSON.parse(window.localStorage.getItem("maropack_nalozi_trajno") || "[]"); } catch (e) { }
                try { lokalniMasteri = JSON.parse(window.localStorage.getItem("maropack_master_nalozi") || "[]"); } catch (e) { }

                const spojNalozi = [...(core.nalozi || []), ...lokalniNalozi, ...(lokalniDb.nalozi || [])]
                    .filter((x, i, arr) => x && i === arr.findIndex(y => String(y.id || y.broj_naloga || y.broj) === String(x.id || x.broj_naloga || x.broj)));
                const spojPonude = [...(core.ponude || []), ...(lokalniDb.ponude || [])]
                    .filter((x, i, arr) => x && i === arr.findIndex(y => String(y.id || y.broj) === String(x.id || x.broj)));
                const spojMasteri = [...(core.master_nalozi || []), ...lokalniMasteri, ...(lokalniDb.master_nalozi || [])]
                    .filter((x, i, arr) => x && i === arr.findIndex(y => String(y.id || y.broj || y.broj_naloga) === String(x.id || x.broj || x.broj_naloga)));

                setDb({
                    proizvodi: (core.proizvodi || []).length ? core.proizvodi : (lokalniDb.proizvodi || []),
                    ponude: spojPonude,
                    nalozi: spojNalozi,
                    master_nalozi: spojMasteri,
                    rolne: (core.rolne || []).length ? core.rolne : (lokalniDb.rolne || []),
                    masine: (core.masine || []).length ? core.masine : (lokalniDb.masine || []),
                    radnici: (core.radnici || []).length ? core.radnici : (lokalniDb.radnici || []),
                    production_sessions: (core.production_sessions || []).length ? core.production_sessions : (lokalniDb.production_sessions || []),
                    qc_zapisnici: (core.qc_zapisnici || []).length ? core.qc_zapisnici : (lokalniDb.qc_zapisnici || [])
                });
            } catch (e) { console.error(e); }
        }
        loadData();
        if (supabase.__localDemo) return undefined;
        const ch = supabase.channel('maropack-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proizvodi' }, function () { loadData(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ponude' }, function () { loadData(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nalozi' }, function () { loadData(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'master_nalozi' }, function () { loadData(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rolne' }, function () { loadData(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'production_sessions' }, function () { loadData(); })
            .subscribe();
        return function () { supabase.removeChannel(ch); };
    }, [user]);

    async function updN(id, f, v) {
        try { const { error } = await supabase.from('nalozi').update({ [f]: v }).eq('id', id); if (error) throw error; }
        catch (e) { msg("Greska: " + e.message, "err"); }
    }

    async function uploadFajl(nalogId, tipFajla, file) {
        if (!file) return;
        setUploading(nalogId + "_" + tipFajla);
        try {
            const ext = file.name.split('.').pop();
            const path = "nalog_" + nalogId + "/" + tipFajla + "_" + Date.now() + "." + ext;
            const { error: upErr } = await supabase.storage.from('maropack-files').upload(path, file); if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('maropack-files').getPublicUrl(path);
            const url = urlData.publicUrl;
            const kolona = "link_" + tipFajla;
            const { error: dbErr } = await supabase.from('nalozi').update({ [kolona]: url }).eq('id', nalogId); if (dbErr) throw dbErr;
            msg("Fajl uploadovan!");
        } catch (e) { msg("Greska upload: " + e.message, "err"); }
        setUploading(null);
    }

    async function obrisiFajl(nalogId, tipFajla) {
        try { const { error } = await supabase.from('nalozi').update({ ["link_" + tipFajla]: null }).eq('id', nalogId); if (error) throw error; msg("Fajl obrisan"); }
        catch (e) { msg("Greska: " + e.message, "err"); }
    }

    async function odbijPonudu(id) {
        try { const { error } = await supabase.from('ponude').update({ status: "Odbijena" }).eq('id', id); if (error) throw error; msg("Ponuda odbijena"); }
        catch (e) { msg("Greska: " + e.message, "err"); }
    }

    function normalizujTipProizvoda(tip) {
        var t = String(tip || "folija").toLowerCase();
        if (t === "špulna") return "spulna";
        if (t.includes("spul")) return "spulna";
        if (t.includes("kes")) return "kesa";
        return "folija";
    }

    function osnovniBrojPonude(pon) {
        return pon.ponBr || pon.broj || pon.broj_ponude || pon.broj_naloga || ("RN-" + new Date().getFullYear() + "-" + String(pon.id || Date.now()).padStart(4, "0"));
    }

    async function kreirajNalogeIzPonude(pon) {
        if (!pon) { msg("Ponuda nije pronađena", "err"); return; }

        // V14: ako ponuda postoji u Supabase Core tabeli, prvo koristi RPC funkciju
        // public.generate_master_nalog_from_ponuda(). Ako RPC nije dostupan ili ponuda
        // nema UUID, automatski nastavlja stari lokalni fallback da test ne stane.
        try {
            const rpcResult = await generateMasterFromPonuda(pon);
            if (rpcResult.usedRpc && !rpcResult.error) {
                msg("Master nalog i operativni nalozi kreirani preko Supabase RPC funkcije.");
                setPage("master_nalozi");
                setPregPonuda(null);
                return;
            }
            if (rpcResult.usedRpc && rpcResult.error) {
                console.warn("RPC generate_master_nalog_from_ponuda nije uspeo, koristim fallback:", rpcResult.error.message);
            }
        } catch (rpcFatal) {
            console.warn("RPC tok nije dostupan, koristim fallback:", rpcFatal.message);
        }

        var vm = Array.isArray(pon.mats) ? pon.mats : (Array.isArray(pon.struktura) ? pon.struktura : []);
        var brKas = vm.reduce(function (s, m) { return s + (+m.kas || +m.kasiranje || 0); }, 0);
        var brLak = vm.reduce(function (s, m) { return s + (+m.lak || +m.lakiranje || 0); }, 0);
        var hasSt = vm.some(function (m) { return !!(m.stamp || m.stampa || m.stampanje); });
        var tipProizvoda = normalizujTipProizvoda(pon.tip || pon.tip_proizvoda || pon.vrsta || "folija");
        var broj = osnovniBrojPonude(pon);
        var nazivProizvoda = pon.prod || pon.proizvod || pon.naziv || "Proizvod";
        var kupac = pon.kupac || pon.klijent || "Kupac";
        var kol = pon.kol || pon.kolicina || pon.količina || 0;
        var masterId = "MASTER-" + String(broj).replace(/[^a-zA-Z0-9_-]/g, "-");
        var masterNalog = {
            id: masterId,
            master_nalog_id: masterId,
            broj_naloga: broj,
            ponBr: broj,
            master_broj: broj,
            ponuda_id: pon.id || pon.ponuda_id || null,
            kalkulacija_id: pon.kalkulacija_id || pon.kalkulacije_id || null,
            tip: tipProizvoda,
            tip_proizvoda: tipProizvoda,
            kupac: kupac,
            prod: nazivProizvoda,
            proizvod: nazivProizvoda,
            kol: kol,
            kolicina: kol,
            status: "Ceka",
            datum: dnow(),
            mats: vm,
            struktura: vm,
            res: pon.res || pon.rezultat || null,
            nap: pon.nap || pon.napomena || "",
            izvor: "ponuda"
        };

        // Spreči dupliranje naloga za istu ponudu/broj - proverava i Supabase i lokalni fallback.
        try {
            var lokalniPostojeci = [];
            try { lokalniPostojeci = JSON.parse(window.localStorage.getItem("maropack_nalozi_trajno") || "[]"); } catch (e) { lokalniPostojeci = []; }
            if (lokalniPostojeci.some(function (x) { return String(x.ponBr || x.broj_naloga || x.broj) === String(broj); })) {
                msg("Nalozi za ovu ponudu već postoje lokalno. Otvaram pregled naloga.");
                setPage("nalozi");
                setPregPonuda(null);
                return;
            }

            const { data: postojeci, error: checkError } = await supabase
                .from('nalozi')
                .select('id, ponBr, broj_naloga')
                .or('ponBr.eq.' + broj + ',broj_naloga.eq.' + broj + ',broj.eq.' + broj);
            if (checkError) throw checkError;
            if (postojeci && postojeci.length > 0) {
                msg("Nalozi za ovu ponudu već postoje. Otvaram pregled naloga.");
                setPage("nalozi");
                setPregPonuda(null);
                return;
            }
        } catch (e) {
            console.warn("Provera duplikata nije uspela, nastavljam kreiranje:", e.message);
        }

        var tipovi = [];
        tipovi.push({ tip: "materijal", naziv: "Nalog za potrebu materijala", ik: "box", boj: "#f59e0b" });

        if (tipProizvoda === "kesa") {
            if (hasSt || true) tipovi.push({ tip: "stampa", naziv: "Nalog za štampu", ik: "print", boj: "#3b82f6" });
            tipovi.push({ tip: "kesa", naziv: "Nalog za kesu", ik: "bag", boj: "#b91c1c" });
            tipovi.push({ tip: "prikaz_kese", naziv: "Prikaz / crtež kese", ik: "image", boj: "#7c2d12" });
        } else if (tipProizvoda === "spulna") {
            tipovi.push({ tip: "formatiranje", naziv: "Nalog za formatiranje", ik: "roll", boj: "#7c3aed" });
            tipovi.push({ tip: "spulna", naziv: "Nalog za špulne", ik: "roll", boj: "#059669" });
        } else {
            if (hasSt) tipovi.push({ tip: "stampa", naziv: "Nalog za štampu", ik: "print", boj: "#3b82f6" });
            for (var i = 1; i <= brKas; i++) tipovi.push({ tip: "kasiranje", naziv: "Nalog za kaširanje " + i, ik: "link", boj: "#1d4ed8", redni_broj: i });
            tipovi.push({ tip: "rezanje", naziv: "Nalog za rezanje", ik: "cut", boj: "#6366f1" });
            tipovi.push({ tip: "perforacija", naziv: "Nalog za perforaciju", ik: "circle", boj: "#8b5cf6" });
            tipovi.push({ tip: "izgled_rolne", naziv: "Izgled na rolni", ik: "roll", boj: "#0ea5e9" });
            if (brLak > 0) tipovi.push({ tip: "lakiranje", naziv: "Nalog za lakiranje", ik: "star", boj: "#7c3aed" });
        }

        var qrCodeBase64 = null;
        try {
            qrCodeBase64 = await QRCode.toDataURL(JSON.stringify({ broj_naloga: broj, ponuda_id: pon.id || null, tip: tipProizvoda, kupac: kupac, proizvod: nazivProizvoda }), { errorCorrectionLevel: 'M', type: 'image/png', width: 260, margin: 2 });
        } catch (e) { console.warn("QR nije kreiran:", e.message); }

        var novi = tipovi.map(function (t) {
            return {
                // NOVI STANDARD
                broj_naloga: broj,
                ponBr: broj,
                ponId: pon.id || pon.ponId || null,
                ponuda_id: pon.id || pon.ponuda_id || null,
                master_nalog_id: masterId,
                master_broj: broj,
                master_nalog: masterNalog,
                kalkulacija_id: pon.kalkulacija_id || pon.kalkulacije_id || null,
                tip: tipProizvoda,
                tip_proizvoda: tipProizvoda,
                tip_naloga: t.tip,
                vrsta: t.tip,
                operacija: t.naziv,
                naziv: t.naziv,
                ik: t.ik,
                boj: t.boj,
                status: "Ceka",
                datum: dnow(),
                kupac: kupac,
                prod: nazivProizvoda,
                proizvod: nazivProizvoda,
                kol: kol,
                kolicina: kol,
                mats: vm,
                struktura: vm,
                res: pon.res || pon.rezultat || null,
                specifikacija: pon.specifikacija || pon.struktura || vm,
                qr_kod: qrCodeBase64,
                radnik: "",
                nap: pon.nap || pon.napomena || "",
                redni_broj: t.redni_broj || null
            };
        });

        try {
            try {
                await supabase.from('master_nalozi').insert([masterNalog]);
            } catch (masterErr) {
                console.warn("Master nalog tabela nije dostupna ili RLS blokira upis, nastavljam preko nalozi/localStorage:", masterErr.message);
            }
            const { error: e1 } = await supabase.from('nalozi').insert(novi);
            if (e1) throw e1;
            if (pon.id) {
                await supabase.from('ponude').update({ status: "prihvaceno" }).eq('id', pon.id);
            }
            setDb(function (old) {
                var stari = old && old.nalozi ? old.nalozi : [];
                return Object.assign({}, old, { nalozi: [].concat(novi, stari), master_nalozi: [masterNalog].concat((old && old.master_nalozi) || []) });
            });
            msg("Kreirano " + novi.length + " profesionalnih naloga za " + tipProizvoda + "! Br: " + broj);
            setPage("nalozi");
            setPregPonuda(null);
        } catch (e) {
            // Fallback za lokalni rad bez podešenog Supabase-a/RLS-a: nalozi se ne gube.
            try {
                var lokalni = JSON.parse(window.localStorage.getItem("maropack_nalozi_trajno") || "[]");
                var noviSaId = novi.map(function (n, i) {
                    return Object.assign({ id: "LOCAL-" + broj + "-" + (i + 1) }, n, { local_only: true });
                });
                window.localStorage.setItem("maropack_nalozi_trajno", JSON.stringify(noviSaId.concat(lokalni)));
                var lokalniMasteri = [];
                try { lokalniMasteri = JSON.parse(window.localStorage.getItem("maropack_master_nalozi") || "[]"); } catch (e2) { lokalniMasteri = []; }
                window.localStorage.setItem("maropack_master_nalozi", JSON.stringify([masterNalog].concat(lokalniMasteri)));
                setDb(function (old) {
                    var stari = old && old.nalozi ? old.nalozi : [];
                    return Object.assign({}, old, { nalozi: [].concat(noviSaId, stari), master_nalozi: [masterNalog].concat((old && old.master_nalozi) || []) });
                });
                msg("Supabase nije prihvatio upis, ali nalozi su sačuvani lokalno za test. Br: " + broj, "ok");
                setPage("nalozi");
                setPregPonuda(null);
            } catch (localErr) {
                msg("Greška kreiranja naloga: " + e.message, "err");
            }
        }
    }

    var inp = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#1e293b", background: "#f8fafc", outline: "none", boxSizing: "border-box" };
    var card = { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #e8edf3" };
    var lbl = { fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4, display: "block" };
    var SBJ = { "Ceka": "#f59e0b", "U toku": "#3b82f6", "Završeno": "#10b981", "Ceka_bg": "#fffbeb", "U toku_bg": "#eff6ff", "Završeno_bg": "#f0fdf4" };
    var ICONS = { "box": "📦", "print": "🖨️", "link": "🔗", "cut": "✂️", "circle": "🔵", "star": "✨", "bag": "🛍️", "image": "📐", "roll": "🎞️" };
    var TIP_BOJA = { "folija": "#1d4ed8", "kesa": "#059669", "spulna": "#7c3aed" };
    var TIP_LAB = { "folija": "Folija", "kesa": "Kesa", "spulna": "Špulna" };


    // Print je sada unutar PregledNalogaPRO / NalogLayoutPRO, da svi nalozi imaju isti profesionalni izgled.

    // ✅ LOGIN JE PREBAČEN U AuthProvider - ovaj blok se briše

    // ✅ FINAL CLEAN ACCORDION NAVIGATION STRUCTURE
    // Navigacija je izdvojena u src/config/navigation.js da App.jsx ne drži meni u sebi.
    const navGroups = getNavGroups(isAdmin, userProfile?.uloga);
    const mobileMagacionerMode = isMagacioner && isMobileViewport;

    function toggleGroup(groupKey) {
        if (openGroups.includes(groupKey)) {
            setOpenGroups(openGroups.filter(k => k !== groupKey));
        } else {
            setOpenGroups([...openGroups, groupKey]);
        }
    }

    async function handleLogout() {
        await signOut();
        window.location.href = '/';
    }

    return (
        <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Segoe UI',system-ui,sans-serif", color: "#1e293b", display: "flex" }}>
            {notif && <Notif msg={notif.msg} tip={notif.tip} />}
            {stampa && <PrintA4 data={stampa} onClose={function () { setStampa(null); }} />}

            {/* ACCORDION SIDEBAR */}
            <div style={{ width: 240, background: "#0f172a", display: mobileMagacionerMode ? "none" : "flex", flexDirection: "column", flexShrink: 0, minHeight: "100vh" }}>
                <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid #1e293b", textAlign: "center" }}>
                    <img src={LOGO_B64} alt="Maropack" style={{ maxWidth: 160, height: 42, objectFit: "contain" }} />
                </div>

                <nav style={{ padding: "10px 8px", flex: 1, overflowY: "auto" }}>
                    {navGroups.map(function (group) {
                        const isOpen = openGroups.includes(group.key);
                        const hasActivePage = group.items.some(item => item.k === page);

                        return (
                            <div key={group.key} style={{ marginBottom: 8 }}>
                                {/* GROUP HEADER */}
                                <div
                                    onClick={function () { toggleGroup(group.key); }}
                                    style={{
                                        padding: "10px 12px",
                                        background: hasActivePage ? "#3b82f6" : "#1e293b",
                                        borderRadius: 8,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        transition: "all 0.2s",
                                        marginBottom: isOpen ? 4 : 0
                                    }}
                                    onMouseEnter={function (e) {
                                        if (!hasActivePage) e.currentTarget.style.background = "#334155";
                                    }}
                                    onMouseLeave={function (e) {
                                        if (!hasActivePage) e.currentTarget.style.background = "#1e293b";
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 16 }}>{group.icon}</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: "white" }}>
                                            {group.label}
                                        </span>
                                    </div>
                                    <span style={{
                                        fontSize: 12,
                                        color: "white",
                                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                                        transition: "transform 0.2s"
                                    }}>
                                        ▶
                                    </span>
                                </div>

                                {/* GROUP ITEMS */}
                                <div style={{
                                    maxHeight: isOpen ? (group.items.length * 40 + 20) + "px" : "0px",
                                    overflow: "hidden",
                                    transition: "max-height 0.3s ease",
                                    paddingLeft: 28
                                }}>
                                    {group.items.map(function (item) {
                                        const isActive = page === item.k;
                                        return (
                                            <div
                                                key={item.k}
                                                onClick={function () { setPage(item.k); }}
                                                style={{
                                                    padding: "8px 12px",
                                                    fontSize: 13,
                                                    borderRadius: 6,
                                                    margin: "2px 0",
                                                    cursor: "pointer",
                                                    color: isActive ? "white" : "#94a3b8",
                                                    background: isActive ? "#3b82f6" : "transparent",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 8,
                                                    transition: "all 0.2s"
                                                }}
                                                onMouseEnter={function (e) {
                                                    if (!isActive) {
                                                        e.currentTarget.style.background = "#1e293b";
                                                        e.currentTarget.style.color = "white";
                                                    }
                                                }}
                                                onMouseLeave={function (e) {
                                                    if (!isActive) {
                                                        e.currentTarget.style.background = "transparent";
                                                        e.currentTarget.style.color = "#94a3b8";
                                                    }
                                                }}
                                            >
                                                <span style={{ fontSize: 14 }}>{item.i}</span>
                                                <span>{item.l}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </nav>

                {/* USER INFO - NA KRAJU SIDEBARA */}
                <div style={{
                    padding: 16,
                    borderTop: "1px solid #1e293b",
                    background: "#020617"
                }}>
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 10
                    }}>
                        <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 16,
                            fontWeight: 700,
                            color: "white"
                        }}>
                            {(userProfile?.ime || user?.email || "U")[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "white",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                            }}>
                                {userProfile?.ime || user?.email?.split('@')[0] || "User"}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                                {userProfile?.uloga === 'admin' ? '👑 Admin' :
                                    userProfile?.uloga === 'manager' ? '⭐ Manager' :
                                    userProfile?.uloga === 'magacioner' ? '🏪 Magacioner' : '👷 User'}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={async function () {
                            if (window.confirm('Da li želite da se odjavite?')) {
                                await signOut();
                            }
                        }}
                        style={{
                            width: "100%",
                            padding: "8px",
                            background: "#1e293b",
                            color: "#94a3b8",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 12,
                            cursor: "pointer",
                            transition: "all 0.2s",
                            fontWeight: 600
                        }}
                        onMouseEnter={function (e) {
                            e.currentTarget.style.background = "#dc2626";
                            e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={function (e) {
                            e.currentTarget.style.background = "#1e293b";
                            e.currentTarget.style.color = "#94a3b8";
                        }}
                    >
                        🚪 Odjavi se
                    </button>
                </div>
            </div>

            {/* SADRZAJ */}
            <div style={{ flex: 1, overflow: "auto", padding: mobileMagacionerMode ? 0 : 22 }}>

                {/* DASHBOARD */}
                {(page === "dash" || page === "dashboard") && <DashboardPRO setPage={setPage} />}

                {/* KALKULATORI */}
                {page === "kalk_folija" && <KalkulacijaFolije />}

                {/* LISTA KALKULACIJA */}
                {page === "kalkulacije_lista" && (
                    <ListaKalkulacija
                        setPage={setPage}
                        onOtvoriKalkulaciju={(kal) => {
                            // Otvori odgovarajuću stranicu zavisno od tipa
                            if (kal.tip === 'folija') {
                                setPage('kalk_folija');
                                // Sačuvaj kalkulaciju u localStorage za učitavanje
                                localStorage.setItem('editKalkulacija', JSON.stringify(kal));
                            } else if (kal.tip === 'kesa') {
                                setPage('kalk_kesa');
                                localStorage.setItem('editKalkulacija', JSON.stringify(kal));
                            } else if (kal.tip === 'spulna') {
                                setPage('kalk_spulna');
                                localStorage.setItem('editKalkulacija', JSON.stringify(kal));
                            }
                        }}
                        onKreirajPonudu={async (kal) => {
                            console.log('🚀 Kreiram ponudu iz:', kal);
                            try {
                                const result = await kreirajPonuduIzKalkulacije(kal);
                                console.log('📊 Rezultat:', result);

                                if (result.success) {
                                    msg('Ponuda kreirana iz kalkulacije!');
                                    setPage('ponude');
                                } else {
                                    console.error('❌ Greška:', result.error);
                                    msg('Greška pri kreiranju ponude: ' + result.error, 'err');
                                }
                            } catch (err) {
                                console.error('💥 Exception:', err);
                                msg('Greška: ' + err.message, 'err');
                            }
                        }}
                    />
                )}

                {/* KALKULACIJA KESE */}
                {page === "kalk_kesa" && (
                    <KalkulacijaKese setPage={setPage} />
                )}
                {/* KALKULACIJA ŠPULNE */}
                {page === "kalk_spulna" && (
                    <KalkulacijaSpulne setPage={setPage} />
                )}

                {/* PONUDE - ZAMENJENO: render PonudePRO sa handlerima */}
                {page === "ponude" && (

                    <PonudePRO

                        onPrihvati={kreirajNalogeIzPonude}

                        onOtvoriKalkulaciju={(kal) => {

                            if (kal.tip === 'folija') {

                                setPage('kalk_folija');

                                localStorage.setItem(
                                    'editKalkulacija',
                                    JSON.stringify(kal)
                                );

                            } else if (kal.tip === 'kesa') {

                                setPage('kalk_kesa');

                                localStorage.setItem(
                                    'editKalkulacija',
                                    JSON.stringify(kal)
                                );

                            } else if (kal.tip === 'spulna') {

                                setPage('kalk_spulna');

                                localStorage.setItem(
                                    'editKalkulacija',
                                    JSON.stringify(kal)
                                );
                            }
                        }}
                    />
                )}


                {page === "master_nalozi" && (
                    <MasterNalogEngine db={db} setPage={setPage} setPregNalog={setPregNalog} msg={msg} />
                )}

                {page === "nalozi_pro" && (
                    <NaloziProMES db={db} setPage={setPage} msg={msg} />
                )}

                {page === "mes_workflow_pro" && (
                    <MESWorkflowPRO msg={msg} />
                )}

                {page === "plan_proizvodnje" && (
                    <MachineSchedulerPRO msg={msg} />
                )}

                {page === "live_production" && (
                    <LiveProductionMES db={db} msg={msg} />
                )}

                {page === "mes_tracking_quality" && (
                    <MESTrackingQualityPRO db={db} msg={msg} />
                )}

                {page === "quality_control" && (
                    <QualityControlPRO db={db} msg={msg} />
                )}

                {page === "tehnicki_list" && (
                    <TehnickiListPRO db={db} msg={msg} />
                )}

                {page === "qr_workflow" && (
                    <QRWorkflow db={db} msg={msg} />
                )}

                {page === "mobile_roll_scanner" && (
                    <MobileRollScanner msg={msg} />
                )}

                {page === "rolne_engine" && (
                    <RolneWarehouseEngine db={db} setDb={setDb} msg={msg} forceMobile={isMagacioner && isMobileViewport} />
                )}

                {page === "kalkulator_maticnih" && (
                    <KalkulatorMaticnihRolni db={db} msg={msg} />
                )}

                {page === "planer_rezanja_magacin" && (
                    <PlanerRezanjaIzMagacina db={db} setDb={setDb} msg={msg} />
                )}

                {page === "formatiranje_rolni" && (
                    <FormatiranjeRolniPRO msg={msg} />
                )}

                {/* RADNI NALOZI */}
                {page === "nalozi" && (
                    <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🔧 Radni nalozi</h2>
                            <div style={{ fontSize: 13, color: "#64748b" }}>{db.nalozi.filter(function (n) { return n.status !== "Završeno"; }).length} otvorenih / {db.nalozi.length} ukupno</div>
                        </div>
                        {pregNalog ? (
                            <PregledNalogaPRO
                                brojNaloga={pregNalog.ponBr || pregNalog.broj_naloga || pregNalog.broj}
                                osnovniNalog={pregNalog}
                                onBack={function () { setPregNalog(null); }}
                            />
                        ) : db.nalozi.length === 0 ? (
                            <div style={Object.assign({}, card, { textAlign: "center", padding: 50, color: "#94a3b8" })}>
                                <div style={{ fontSize: 36, marginBottom: 10 }}>🔧</div>
                                <div>Nema naloga. Odobrite ponudu da kreirate naloge.</div>
                            </div>
                        ) : (
                            <div>
                                {(function () {
                                    var grupe = {};
                                    db.nalozi.forEach(function (n) { var key = n.ponBr || n.broj_naloga || n.broj || "Bez broja"; if (!grupe[key]) grupe[key] = []; grupe[key].push(n); });
                                    return Object.keys(grupe).map(function (br) {
                                        var gr = grupe[br];
                                        var zav = gr.filter(function (n) { return n.status === "Završeno"; }).length;
                                        var pct = gr.length > 0 ? (zav / gr.length) * 100 : 0;
                                        var tipNaloga = normalizujTipProizvoda(gr[0].tip || gr[0].tip_proizvoda || "folija");
                                        return (
                                            <div key={br} style={Object.assign({}, card, { marginBottom: 14 })}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                                                    <span style={{ fontWeight: 800, fontSize: 14, color: "#1d4ed8" }}>{br || 'N/A'}</span>
                                                    <span style={{ background: (TIP_BOJA[tipNaloga] || "#64748b") + "20", color: TIP_BOJA[tipNaloga] || "#64748b", borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 10 }}>{TIP_LAB[tipNaloga] || "—"}</span>
                                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{gr[0].kupac || gr[0].klijent}</span>
                                                    <span style={{ color: "#64748b", fontSize: 12 }}>{gr[0].prod || gr[0].proizvod || gr[0].naziv}</span>
                                                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>{zav}/{gr.length} završeno</span>
                                                    <div style={{ width: 80, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                                                        <div style={{ height: "100%", background: "#10b981", borderRadius: 3, width: pct + "%" }} />
                                                    </div>
                                                </div>
                                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
                                                    {gr.map(function (n) {
                                                        return (
                                                            <div key={n.id} onClick={function () { setPregNalog(n); }} style={{ background: SBJ[n.status + "_bg"] || "#f8fafc", border: "1.5px solid " + (SBJ[n.status] || "#e2e8f0") + "40", borderRadius: 10, padding: "11px 13px", cursor: "pointer" }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                                                    <span style={{ fontSize: 16 }}>{ICONS[n.ik]}</span>
                                                                    <span style={{ fontWeight: 700, fontSize: 12 }}>{n.naziv}</span>
                                                                </div>
                                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                                    <span style={{ background: (SBJ[n.status] || "#64748b") + "20", color: SBJ[n.status] || "#64748b", borderRadius: 6, padding: "2px 7px", fontWeight: 700, fontSize: 10 }}>{n.status}</span>
                                                                    {n.radnik && <span style={{ fontSize: 10, color: "#64748b" }}>{n.radnik}</span>}
                                                                </div>
                                                                <div style={{ marginTop: 8, fontSize: 10, color: "#64748b", fontWeight: 700 }}>Klikni za PRO pregled / štampu</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </div>
                )}



                {/* Profesionalni nalozi se prikazuju samo kroz PregledNalogaPRO. */}

                {/* BAZA / TEMPLATE MODULI */}
                {page === "baza_materijala" && <MaterialMasterPRO msg={msg} />}
                {page === "baza_proizvoda_pro" && (<ProductMasterPRO db={db} setPage={setPage} msg={msg} />)}
                {page === "lista_proizvoda_kupci" && (<ListaProizvodaKupci msg={msg} />)}
                {page === "template_engine" && (<ProductTemplateEngineV20 db={db} setDb={setDb} msg={msg} setPage={setPage} />)}

                {/* ✅ NOVO: AUDIT LOG */}
                {page === "audit_log" && isAdmin && <AuditLog />}
                {page === "user_management" && isAdmin && <UserManagement />}

                {/* MAGACIN UNIFIED - SVE U JEDNOM */}
                {page === "analiza_potrosnje_materijala" && (<AnalizaPotrosnjeMaterijala msg={msg} />)}

                {/* ✅ DRUGI PRO MODULI */}
                {page === "dashboard_pro" && <DashboardPRO setPage={setPage} />}
                {page === "manager_dashboard" && <ManagerDashboard />}
                {page === "finansije_kpi" && <FinansijeKPI_PRO db={db} msg={msg} />}
                {page === "mobile" && <MobileApp setPage={setPage} />}

                {/* 🤖 AI MODULI */}
                {page === "ai_planner" && <AIProductionPlanner setPage={setPage} />}
                {page === "ai_chat" && <AIChatAssistant />}
                {page === "ai_agent_command" && <AIAgentCommandCenter />}
                {page === "ai_workflow" && <ProductAIWorkflow db={db} setDb={setDb} msg={msg} setPage={setPage} />}
                {page === "ai_documents" && <DocumentAIWorkflow db={db} setDb={setDb} msg={msg} setPage={setPage} />}
                {page === "ai_waste" && <AIWasteOptimizer />}
                {page === "ai_quality" && <AIQualityInspector />}

                {page === "system_stabilization" && <SystemStabilizationCenter db={db} msg={msg} />}
                {page === "production_hardening" && <ProductionHardeningCenter db={db} msg={msg} />}
                {page === "final_qa_deployment" && <FinalQADeploymentCenter db={db} msg={msg} />}
                {page === "final_production_readiness" && <FinalProductionReadinessCenter db={db} msg={msg} />}
                {page === "system_status" && <SystemStatusPRO db={db} />}
                {page === "backup_security" && <BackupSecurityCenter db={db} />}

                {page === "ai_kalk" && (
                    <AIAsistentKalkulacije
                        card={card}
                        inp={inp}
                        lbl={lbl}
                        msg={msg}
                    />
                )}
                {/* PODESAVANJA */}
                {page === "pod" && isAdmin && (
                    <div>
                        <h2 style={{ margin: "0 0 18px", fontSize: 20, fontWeight: 800 }}>⚙️ Podešavanja</h2>
                        <div style={card}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>👥 Korisnici sistema</div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead><tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                                    {["Ime", "Uloga", "Lozinka"].map(function (h) { return <th key={h} style={{ padding: "8px", textAlign: "left", color: "#64748b", fontWeight: 600 }}>{h}</th>; })}
                                </tr></thead>
                                <tbody>
                                    {USERS.map(function (u) {
                                        return (
                                            <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                <td style={{ padding: "10px 8px", fontWeight: 600 }}>{u.ime}</td>
                                                <td style={{ padding: "10px 8px" }}><span style={{ background: u.uloga === "admin" ? "#fef3c7" : "#dbeafe", color: u.uloga === "admin" ? "#92400e" : "#1e40af", borderRadius: 6, padding: "2px 10px", fontWeight: 700, fontSize: 11 }}>{u.uloga === "admin" ? "Administrator" : u.uloga === "magacioner" ? "Magacioner" : u.uloga === "manager" ? "Manager" : "Radnik"}</span></td>
                                                <td style={{ padding: "10px 8px", fontFamily: "monospace", color: "#94a3b8" }}>{u.pass}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}


// ============================================
// AUTH WRAPPER (ROOT)
// ============================================
export default function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

// ============================================
// AUTH ROUTER
// ============================================
function AppContent() {
    const { loading, user } = useAuth();

    // Loading state
    if (loading) {
        return (
            <div style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f8fafc",
                flexDirection: "column"
            }}>
                <div style={{
                    width: 60,
                    height: 60,
                    border: "4px solid #e2e8f0",
                    borderTopColor: "#667eea",
                    borderRadius: "50%",
                    margin: "0 auto 20px",
                    animation: "spin 0.8s linear infinite"
                }} />
                <p style={{ color: "#64748b", fontWeight: 600, fontSize: 16 }}>
                    Učitavanje...
                </p>
                <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
            </div>
        );
    }

    // Not logged in → show Login
    if (!user) {
        return <Login />;
    }

    // Logged in → show protected app
    return (
        <ProtectedRoute>
            <MainAppContent />
        </ProtectedRoute>
    );
}