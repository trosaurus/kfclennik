// Gedeelde hoofdnavigatie-lijst — gebruikt door zowel Layout (de normale
// header/mobiele nav) als TrainingsModus (het navigatiemenu daar), zodat er
// maar één plek is om bij te werken wanneer een rubriek toegevoegd/hernoemd wordt.
//
// Spelers/Wedstrijden/Seizoen en Trainingen/Oefeningen/Whiteboard zijn elk
// samengevoegd tot 1 navigatie-item (linkt naar de eerste van de groep) —
// de onderlinge pagina's zelf blijven gewoon aparte routes, maar krijgen een
// tabstrip erboven (zie App.tsx's SectionTabs) om tussen elkaar te wisselen.
// Dat houdt de bottom nav op mobiel bruikbaar (5 items i.p.v. 9).

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  /** Speciaal opgemaakt "terug naar de actieve trainingsmodus"-item (Layout.tsx). */
  resume?: boolean;
  /** Extra routepaden waaronder dit item ook als actief moet gelden — voor een
   * samengevoegd item linkt `to` naar de eerste pagina van de groep, maar het
   * item moet ook actief oplichten wanneer je op een van de andere zit. */
  activePaths?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/',           label: 'Start',       icon: '🏠', end: true },
  { to: '/matchday',   label: 'Matchday',    icon: '⚽' },
  {
    to: '/spelers', label: 'Team', icon: '👥',
    activePaths: ['/spelers', '/wedstrijden', '/seizoen'],
  },
  {
    to: '/trainingen', label: 'Trainingen', icon: '📝',
    activePaths: ['/trainingen', '/oefendatabank', '/whiteboard'],
  },
  { to: '/tactiek', label: 'Tactiek', icon: '🧠' },
];
