// Gedeelde hoofdnavigatie — gebruikt door de zijbalk (Layout) en het menu in
// de trainingsmodus, zodat er maar één plek is om een rubriek toe te voegen.
import type { NavIconName } from '../components/icons/NavIcons';

export interface NavItem {
  to: string;
  label: string;
  icon: NavIconName;
  /** Extra routepaden waaronder dit item ook als actief moet gelden. */
  activePaths?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Trainen',
    items: [
      { to: '/trainingen',    label: 'Trainingen', icon: 'trainingen' },
      { to: '/oefendatabank', label: 'Oefeningen', icon: 'oefeningen' },
      { to: '/whiteboard',    label: 'Tekentool',  icon: 'tekentool' },
      { to: '/tactiek',       label: 'Tactiek',    icon: 'tactiek' },
    ],
  },
  {
    label: 'Wedstrijd',
    items: [
      { to: '/wedstrijden', label: 'Wedstrijden', icon: 'wedstrijden' },
      { to: '/spelers',     label: 'Spelers',     icon: 'spelers' },
    ],
  },
];

/** Platte lijst (zonder groepen) — voor compacte menu's. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items);
