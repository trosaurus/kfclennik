// Gedeelde hoofdnavigatie-lijst — gebruikt door zowel Layout (de normale
// header/mobiele nav) als TrainingsModus (het navigatiemenu daar), zodat er
// maar één plek is om bij te werken wanneer een rubriek toegevoegd/hernoemd wordt.

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  /** Speciaal opgemaakt "terug naar de actieve trainingsmodus"-item (Layout.tsx). */
  resume?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/',              label: 'Start',       icon: '🏠', end: true },
  { to: '/matchday',      label: 'Matchday',    icon: '⚽' },
  { to: '/spelers',       label: 'Spelers',     icon: '👥' },
  { to: '/wedstrijden',   label: 'Wedstrijden', icon: '📋' },
  { to: '/seizoen',       label: 'Seizoen',     icon: '📈' },
  { to: '/trainingen',    label: 'Trainingen',  icon: '📝' },
  { to: '/oefendatabank', label: 'Oefeningen',  icon: '📚' },
  { to: '/whiteboard',    label: 'Whiteboard',  icon: '🎨' },
  { to: '/tactiek',       label: 'Tactiek',     icon: '🧠' },
];
