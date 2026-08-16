// Onthoudt welke training-sessie momenteel "aan staat" in de trainingsmodus,
// zodat het hoofdnavigatiemenu (Layout) er overal in de app rechtstreeks naar
// kan doorlinken — los van de per-training voortgang die TrainingsModus zelf
// al bewaart (zie tm-progress-* in TrainingsModus.tsx).

const KEY = 'tm-active-training';

export interface ActiveTraining {
  id: string;
  titel: string;
}

export function setActiveTraining(t: ActiveTraining) {
  localStorage.setItem(KEY, JSON.stringify(t));
}

export function getActiveTraining(): ActiveTraining | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearActiveTraining() {
  localStorage.removeItem(KEY);
}
