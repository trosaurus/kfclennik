import ErrorBoundary from './ErrorBoundary';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout } from '../lib/auth';
import { useTeam } from '../lib/TeamContext';
import { useTheme } from '../lib/ThemeContext';
import { NAV_GROUPS, NavItem } from '../lib/navItems';
import { getActiveTraining } from '../lib/activeTraining';
import { NavIcon } from './icons/NavIcons';
import logo from '../assets/Logo-KFC-Lennik.png';
import './Layout.css';

// App-schil: vaste zijbalk op tablet/desktop, op telefoon een bovenbalk met
// een uitschuifmenu (dezelfde zijbalk als drawer).
export default function Layout() {
  const { trainer, setTrainer, isAdmin } = useTeam();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Gelezen bij het mounten — Layout wordt opnieuw gemount wanneer je de
  // (standalone) trainingsmodus verlaat, dus een gestarte sessie wordt opgepikt.
  const [activeTraining] = useState(() => getActiveTraining());

  // Menu sluiten na navigatie (mobiel).
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  function isActive(item: NavItem): boolean {
    const paths = item.activePaths ?? [item.to];
    return paths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
  }

  async function handleLogout() {
    await logout();
    setTrainer(null);
  }

  const initials = (trainer?.name ?? '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');

  const sidebar = (
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <Link to="/trainingen" className="sidebar-brand">
        <img src={logo} alt="" className="sidebar-logo" />
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">KFC Lennik</span>
          <span className="sidebar-brand-sub">
            {trainer?.team ? `${trainer.team.name} · ${trainer.team.category}` : 'Voetbaltraining'}
          </span>
        </div>
      </Link>

      {activeTraining && (
        <Link to={`/trainingen/${activeTraining.id}/modus`} className="sidebar-resume">
          <span className="sidebar-resume-icon"><NavIcon name="play" size={16} /></span>
          <span className="sidebar-resume-text">
            <span className="sidebar-resume-label">Training bezig</span>
            <span className="sidebar-resume-title">{activeTraining.titel}</span>
          </span>
        </Link>
      )}

      <nav className="sidebar-nav">
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="sidebar-group">
            <div className="sidebar-group-label">{group.label}</div>
            {group.items.map(item => (
              <NavLink key={item.to} to={item.to}
                className={`sidebar-link ${isActive(item) ? 'active' : ''}`}>
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
        {isAdmin && (
          <div className="sidebar-group">
            <div className="sidebar-group-label">Beheer</div>
            <NavLink to="/admin" className={`sidebar-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`}>
              <NavIcon name="admin" />
              <span>Admin</span>
            </NavLink>
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <span className="sidebar-avatar">{initials}</span>
          <span className="sidebar-user-name">{trainer?.name}</span>
        </div>
        <div className="sidebar-footer-actions">
          <button className="sidebar-icon-btn" onClick={toggleTheme}
            title={theme === 'dark' ? 'Lichte modus' : 'Donkere modus'}
            aria-label={theme === 'dark' ? 'Lichte modus' : 'Donkere modus'}>
            <NavIcon name={theme === 'dark' ? 'zon' : 'maan'} size={18} />
          </button>
          <button className="sidebar-icon-btn" onClick={handleLogout} title="Afmelden" aria-label="Afmelden">
            <NavIcon name="uit" size={18} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="topbar-menu" onClick={() => setMenuOpen(true)} aria-label="Menu openen">
          <NavIcon name="menu" />
        </button>
        <Link to="/trainingen" className="topbar-brand">
          <img src={logo} alt="" />
          <span>KFC Lennik</span>
        </Link>
        {activeTraining ? (
          <Link to={`/trainingen/${activeTraining.id}/modus`} className="topbar-resume" aria-label="Training hervatten">
            <NavIcon name="play" size={16} />
          </Link>
        ) : <span className="topbar-spacer" />}
      </header>

      {sidebar}
      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
      {menuOpen && (
        <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Menu sluiten">
          <NavIcon name="sluit" />
        </button>
      )}

      <main className="main-content">
        <ErrorBoundary resetKey={location.pathname}><Outlet /></ErrorBoundary>
      </main>
    </div>
  );
}
