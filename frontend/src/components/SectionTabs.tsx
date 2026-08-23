import { NavLink, Outlet } from 'react-router-dom';
import './SectionTabs.css';

interface Tab {
  to: string;
  label: string;
  icon: string;
}

interface Props {
  tabs: Tab[];
}

/** Tabstrip boven een groep verwante pagina's (bv. Spelers/Wedstrijden/Seizoen) —
 * laat meerdere rubrieken onder 1 navigatie-item vallen zonder een popup/dropdown,
 * puur via gewone routes + tabs. Elke tab is een volwaardige eigen route/pagina;
 * dit component levert enkel de tabstrip erboven via een pathless layout-route. */
export default function SectionTabs({ tabs }: Props) {
  return (
    <>
      <div className="section-tabs">
        <div className="section-tabs-inner">
          {tabs.map(tab => (
            <NavLink key={tab.to} to={tab.to}
              className={({ isActive }) => `section-tab ${isActive ? 'active' : ''}`}>
              <span className="section-tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </>
  );
}
