// Centralna konfiguracija menija — sa prevodima (SR/EN/DE).
// Tekstovi se prevode preko i18n rečnika; ključ prevoda = k (stavka) / key (grupa).
import { translate } from "../i18n.js";

// Centralna konfiguracija menija.
// Ovde menjamo meni, a App.jsx samo renderuje grupe i stavke.

function getNavGroupsRaw(isAdmin, userRole) {
    if (userRole === 'magacioner') {
        return [
            {
                key: 'magacin',
                label: 'Magacin',
                icon: '🏪',
                items: [
                    { k: 'rolne_engine', l: 'Magacin Materijala i Rolni PRO', i: '🏪' }
                ]
            }
        ];
    }
    return [
        {
            key: 'dashboard',
            label: 'Dashboard',
            icon: '📊',
            items: [
                { k: 'dashboard_pro', l: 'Dashboard PRO', i: '📈' },
                { k: 'manager_dashboard', l: 'Menadžerski dashboard', i: '🏭' },
                { k: 'finansije_kpi', l: 'Finansije + KPI', i: '💰' }
            ]
        },
        {
            key: 'kalkulacije',
            label: 'Kalkulacije',
            icon: '🧮',
            items: [
                { k: 'kalk_folija', l: 'Folije', i: '🎞️' },
                { k: 'kalk_kesa', l: 'Kese', i: '🛍️' },
                { k: 'kalk_spulna', l: 'Špulne', i: '🧵' },
                { k: 'kalkulacije_lista', l: 'Sve kalkulacije', i: '📋' },
                { k: 'ai_kalk', l: 'AI Kalkulacije', i: '🤖' }
            ]
        },
        {
            key: 'baza',
            label: 'Baza proizvoda',
            icon: '📚',
            items: [
                { k: 'lista_proizvoda_kupci', l: 'Lista proizvoda po kupcima', i: '🗂️' },
                { k: 'baza_proizvoda_pro', l: 'Baza proizvoda PRO', i: '📦' },
                { k: 'template_engine', l: 'Template Engine', i: '🧩' },
                { k: 'baza_materijala', l: 'Baza materijala', i: '🧪' }
            ]
        },
        {
            key: 'proizvodnja',
            label: 'Proizvodnja',
            icon: '🏭',
            items: [
                { k: 'nalozi', l: 'Glavni nalozi', i: '🏭' },
                { k: 'ponude', l: 'Ponude', i: '📄' },
                { k: 'plan_proizvodnje', l: 'Plan proizvodnje', i: '📅' },
                { k: 'live_production', l: 'Praćenje proizvodnje', i: '🔴' },
                { k: 'quality_control', l: 'Kontrola kvaliteta', i: '✅' },
                { k: 'tehnicki_list', l: 'Tehnički listovi', i: '📄' }
            ]
        },
        {
            key: 'magacin',
            label: 'Magacin',
            icon: '🏪',
            items: [
                { k: 'rolne_engine', l: 'Magacin rolni i materijala', i: '🏪' },
                { k: 'analiza_potrosnje_materijala', l: 'Analiza potrošnje materijala', i: '📊' },
                { k: 'kalkulator_maticnih', l: 'Kalkulator matičnih rolni', i: '📊' },
                { k: 'planer_rezanja_magacin', l: 'Planer rezanja iz magacina', i: '✂️' },
                { k: 'formatiranje_rolni', l: 'Formatiranje rolni', i: '✂️' },
                { k: 'analiza_materijal_stavke', l: 'Analiza materijala', i: '📊' }
            ]
        },
        {
            key: 'ai',
            label: 'AI asistent',
            icon: '🤖',
            items: [
                { k: 'ai_agent_command', l: 'AI Agent Command Center', i: '🧠' },
                { k: 'ai_chat', l: 'AI chat', i: '💬' },
                { k: 'ai_workflow', l: 'AI tok rada', i: '⚡' },
                { k: 'ai_documents', l: 'AI Dokumenti / OCR', i: '📄' },
                { k: 'ai_planner', l: 'AI planiranje', i: '🏭' },
                { k: 'ai_waste', l: 'AI optimizacija otpada', i: '♻️' },
                { k: 'ai_quality', l: 'AI kontrola kvaliteta', i: '✅' }
            ]
        },
        {
            key: 'sistem',
            label: 'Sistem',
            icon: '⚙️',
            items: [
                { k: 'system_status', l: 'Status sistema', i: '🟢' },
                { k: 'system_stabilization', l: 'Stabilizacija sistema', i: '🔗' },
                { k: 'production_hardening', l: 'Production hardening', i: '🧱' },
                { k: 'final_qa_deployment', l: 'Final QA / Deployment', i: '🚀' },
                { k: 'final_production_readiness', l: 'Final Production Ready', i: '🏁' },
                { k: 'backup_security', l: 'Backup i bezbednost', i: '🛡️' },
                { k: 'mobile', l: 'Mobilni / tablet režim', i: '📱' },
                ...(isAdmin ? [
                    { k: 'user_management', l: 'Korisnici', i: '👥' },
                    { k: 'pod', l: 'Podešavanja', i: '⚙️' },
                    { k: 'audit_log', l: 'Audit evidencija', i: '📜' }
                ] : [])
            ]
        }
    ];
}

// Prevedeni meni — App.jsx poziva ovo (prosledi lang iz useLang()).
export function getNavGroups(isAdmin, userRole, lang = "sr") {
    const T = (key, fallback) => translate(lang, key, fallback);
    return getNavGroupsRaw(isAdmin, userRole).map((g) => ({
        ...g,
        label: T(`nav.${g.key}`, g.label),
        items: (g.items || []).map((it) => ({
            ...it,
            l: T(`nav.${it.k}`, it.l),
        })),
    }));
}
