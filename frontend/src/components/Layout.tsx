import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout } from '../lib/auth';
import { useTeam } from '../lib/TeamContext';
import { useTheme } from '../lib/ThemeContext';
import { useFont } from '../lib/FontContext';
import { NAV_ITEMS as BASE_NAV_ITEMS } from '../lib/navItems';
import { getActiveTraining } from '../lib/activeTraining';
import logo from '../assets/Logo-KFC-Lennik.png';
import './Layout.css';

export default function Layout() {
  const { trainer, setTrainer, isAdmin, category } = useTeam();
  const { theme, toggleTheme } = useTheme();
  const { font, toggleFont } = useFont();
  const location = useLocation();
  // Gelezen bij het mounten van Layout — Layout wordt altijd opnieuw gemount
  // wanneer je de (aparte, standalone) trainingsmodus-route verlaat, dus dit
  // pikt een intussen gestarte sessie steeds correct op.
  const [activeTraining] = useState(() => getActiveTraining());

  const NAV_ITEMS = [
    ...BASE_NAV_ITEMS,
    ...(activeTraining
      ? [{ to: `/trainingen/${activeTraining.id}/modus`, label: activeTraining.titel, icon: '▶', resume: true }]
      : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️' }] : []),
  ];

  async function handleLogout() {
    await logout();
    setTrainer(null);
  }

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="header-brand">
            <img src={logo} alt="KFC Lennik" className="brand-logo" />
            <div className="brand-text">
              <span className="brand-name">KFC Lennik</span>
              <span className="brand-number">
                {trainer?.team ? `${trainer.team.name} · ${trainer.team.category}` : '4157'}
              </span>
            </div>
          </Link>

          <nav className="nav desktop-nav">
            {NAV_ITEMS.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''} ${item.resume ? 'nav-link-resume' : ''}`}>
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="header-user">
            <button className="btn btn-ghost btn-icon" onClick={toggleTheme}
              title={theme === 'dark' ? 'Lichte modus' : 'Donkere modus'}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="btn btn-ghost btn-icon" onClick={toggleFont}
              title={font === 'default' ? 'Poppins lettertype' : 'Standaard lettertype'}
              style={{
                fontFamily: font === 'default' ? "'Poppins', sans-serif" : 'var(--font-body)',
                textTransform: 'none', letterSpacing: 0,
              }}>
              Aa
            </button>
            <span className="header-trainer-name">{trainer?.name}</span>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Afmelden">↩ Afmelden</button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <nav className="mobile-nav">
        {NAV_ITEMS.map(item => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={`mobile-nav-item ${isActive ? 'active' : ''} ${item.resume ? 'mobile-nav-item-resume' : ''}`}>
              <span className="mobile-nav-icon">{item.icon}</span>
              <span className="mobile-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
