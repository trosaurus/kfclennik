// Lijn-iconen voor de navigatie (zijbalk + mobiel menu). Eén stijl: 24×24,
// stroke 1.8, currentColor — zodat ze meekleuren met actief/hover/donker thema.

import { ReactNode } from 'react';

export type NavIconName =
  | 'trainingen' | 'oefeningen' | 'tekentool' | 'tactiek'
  | 'wedstrijden' | 'spelers' | 'admin' | 'play'
  | 'zon' | 'maan' | 'uit' | 'menu' | 'sluit';

const PATHS: Record<NavIconName, ReactNode> = {
  trainingen: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  oefeningen: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M10 4h4v16h-4zM14 6.2l3.6-1 3 11.6-3.6 1z" /></>,
  tekentool:  <><path d="M4 20l4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2z" /><path d="M14 7.4l2.6 2.6" /></>,
  tactiek:    <><circle cx="6" cy="6" r="2" /><path d="M16 4l4 4M20 4l-4 4" /><circle cx="17" cy="18" r="2" /><path d="M7.5 7.5c2 5 5 8 7.5 9" strokeDasharray="2 2.5" /></>,
  wedstrijden:<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5l3.2 2.3-1.2 3.7h-4l-1.2-3.7z" /><path d="M12 3.5v4M20.2 9.8l-5 0M16.8 19l-2.8-5.5M7.2 19l2.8-5.5M3.8 9.8l5 0" /></>,
  spelers:    <><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.2 3.5 4.7" /></>,
  admin:      <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>,
  play:       <path d="M8 5.5v13l10-6.5z" />,
  zon:        <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  maan:       <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  uit:        <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  menu:       <path d="M4 7h16M4 12h16M4 17h16" />,
  sluit:      <path d="M6 6l12 12M18 6L6 18" />,
};

export function NavIcon({ name, size = 20 }: { name: NavIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
