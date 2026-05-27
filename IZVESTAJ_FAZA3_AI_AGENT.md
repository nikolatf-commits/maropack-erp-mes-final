# MAROPACK V52 — FAZA 3 AI AGENT

Ubačen je centralni AI Agent Command Center.

## Šta je dodato

- `src/services/aiAgentCore.js`
- `src/modules/AIAgentCommandCenter.jsx`
- meni: **AI asistent → AI Agent Command Center**
- SQL dopune za:
  - `ai_akcije`
  - `ai_agent_memorija`

## Šta AI agent sada radi

- čita AI Data Hub i sve povezane tabele
- prepoznaje nameru korisnika
- predlaže plan rezanja
- predlaže rezervaciju materijala
- predlaže raspored po mašinama
- analizira otpad
- predlaže nabavku
- prikazuje upozorenja za nedostajuće tabele
- čuva AI akcije kao predlog za potvrdu

## Bitno

AI ne menja stanje automatski bez potvrde korisnika. Predlozi se čuvaju kao `ai_akcije`.

## Sledeći korak

FAZA 4:
- role i dozvole
- mobile/tablet/kiosk režim
- offline/backup režim
- lazy loading i performance optimizacija
