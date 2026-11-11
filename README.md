# Voetbaltraining.app

Trainersportaal voor jeugdvoetbal: bereid trainingen voor, beheer je spelerslijst, volg aanwezigheid per match en registreer speeltijden live. Oorspronkelijk gebouwd voor KFC Lennik; clubnaam, stamnummer en logo zijn nu een instelling per club.

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

## Multi-trainer & login

### Eerste keer opstarten
```bash
cd backend && npm install --legacy-peer-deps && npm run dev
```
Keystone vraagt bij de eerste start om een **eerste admin account** aan te maken op http://localhost:3000/admin. Dit is je admin-login.

### Daarna via Admin UI of via de app (⚙️ Admin pagina)
1. Maak een club aan (tabblad **Clubs**: naam, stamnummer, logo)
2. Maak ploegen aan en koppel ze aan die club (bv. U10A — categorie U10)
3. Maak trainers aan en koppel ze aan een ploeg
4. Elke trainer logt in en ziet enkel de eigen ploeg, met naam en logo van de eigen club

Bij een bestaande database van vóór het Club-model maakt de backend bij het opstarten automatisch één club aan (standaard "KFC Lennik", stamnummer 4157 en het logo uit `backend/assets/images/`, aan te passen met `LEGACY_CLUB_NAME`/`LEGACY_CLUB_STAMNUMMER`) en koppelt alle ploegen eraan. Dat gebeurt enkel zolang er nog geen enkele club bestaat.

### Categorieën & veldformaten
| Categorie | Formaat | Kwartduur |
|-----------|---------|-----------|
| U6        | 2v2     | 10 min    |
| U7        | 3v3     | 10 min    |
| U8/U9     | 5v5     | 15 min    |
| U10/U11   | 8v8     | 15 min    |
| U12       | 8v8     | 20 min    |
| U13       | 11v11   | 20 min    |
| U15/U17   | 11v11   | 25 min    |
