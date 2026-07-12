import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { LANGS, DICT, TIP_KESE_I18N, translate } from "./i18n.js";

export { translate };

const LanguageContext = createContext(null);

const STORAGE_KEY = "maropack_lang";

export function LanguageProvider({ children, defaultLang = "sr" }) {
    const [lang, setLangState] = useState(() => {
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved && DICT[saved]) return saved;
        } catch (e) { /* localStorage nedostupan */ }
        return defaultLang;
    });

    const setLang = useCallback((next) => {
        if (!DICT[next]) return;
        setLangState(next);
        try { window.localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
    }, []);

    useEffect(() => {
        try { document.documentElement.lang = lang; } catch (e) { /* ignore */ }
    }, [lang]);

    // t("nav.magacin") -> "Magacin" / "Warehouse" / "Lager"
    const t = useCallback((key, fallback) => translate(lang, key, fallback), [lang]);

    // tipKese("bodenfalten") -> lokalizovan naziv tipa kese
    const tipKese = useCallback((k) => (TIP_KESE_I18N[k] && TIP_KESE_I18N[k][lang]) || k, [lang]);

    return (
        <LanguageContext.Provider value={{ lang, setLang, t, tipKese, langs: LANGS }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLang() {
    const ctx = useContext(LanguageContext);
    if (!ctx) {
        // Fallback ako provider nije postavljen — aplikacija i dalje radi na srpskom
        return { lang: "sr", setLang: () => { }, t: (k, f) => translate("sr", k, f), tipKese: (k) => k, langs: LANGS };
    }
    return ctx;
}

// Prekidač jezika — stavi ga u sidebar (iznad menija) ili u header
export function LanguageSwitcher({ compact = false, style }) {
    const { lang, setLang, t, langs } = useLang();
    return (
        <div style={{ background: "#1e3a5f", borderRadius: 10, padding: compact ? 6 : 10, ...style }}>
            {!compact && (
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", fontWeight: 800, marginBottom: 6 }}>
                    {t("lang")}
                </div>
            )}
            <div style={{ display: "flex", gap: 5 }}>
                {langs.map((l) => {
                    const on = l.code === lang;
                    return (
                        <button
                            key={l.code}
                            onClick={() => setLang(l.code)}
                            title={l.name}
                            style={{
                                flex: 1,
                                background: on ? "#2563eb" : "#0f2744",
                                border: `1px solid ${on ? "#60a5fa" : "#33507a"}`,
                                color: on ? "#fff" : "#cbd5e1",
                                borderRadius: 7,
                                padding: compact ? "5px 4px" : "7px 4px",
                                fontSize: 12,
                                fontWeight: 800,
                                cursor: "pointer",
                            }}
                        >
                            {l.flag} {l.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default LanguageProvider;
