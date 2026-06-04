# KFC Lennik 4157 — Speeltijdbeheer

Voetbalapplicatie voor KFC Lennik. Beheer je spelerslijst, volg aanwezigheid per match, en registreer speeltijden live.

## Mappenstructuur

```
kfc-lennik/
├── backend/       → Keystone.js 6 (GraphQL API + SQLite)
└── frontend/      → Vite + React + TypeScript
```

## Installatie & Opstarten

### Backend

```bash
cd backend
npm install --legacy-peer-deps
npm run dev
```

Keystone start op **http://localhost:3000**
Admin UI: **http://localhost:3000/admin** (eerste keer aanmaken je een admin account)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App start op **http://localhost:5173**

## Functionaliteiten

### 👥 Spelerslijst
- Voeg spelers toe met naam, rugnummer en positie
- Groepering per positie (doelman, verdediger, middenvelder, aanvaller)
- Activeer/deactiveer spelers

### 📅 Matchen
- Maak matchen aan (tegenstander, datum, thuis/uit)
- Volg de status: gepland → bezig → afgelopen
- Houd de score bij

### ⚽ Match Detail — 3 tabbladen

1. **Aanwezigheid**: Vink aan welke spelers aanwezig zijn, selecteer ze voor de opstelling
2. **Opstelling**: 
   - Klik "Start Match" → alle geselecteerde spelers beginnen speeltijd te lopen
   - Klik "↔ Wissel" naast een speler → kies een invaller → speeltijd wordt automatisch overgedragen
   - Live timer zichtbaar per speler
3. **Speeltijden**: Overzicht hoeveel minuten elke speler heeft gespeeld

## Technische details

- **Backend**: Keystone.js 6, SQLite, GraphQL
- **Frontend**: Vite 5, React 18, TypeScript, React Router 6
- **Poorten**: Backend 3000, Frontend 5173
- **Proxy**: Frontend proxyt `/api/graphql` → `localhost:3000/graphql`
