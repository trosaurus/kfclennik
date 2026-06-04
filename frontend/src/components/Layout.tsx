import { NavLink, Outlet, useLocation } from 'react-router-dom';
import logo from '../assets/Logo-KFC-Lennik.png';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/',           label: 'Matchday',   icon: '⚽', end: true },
  { to: '/spelers',    label: 'Spelers',     icon: '👥' },
  { to: '/wedstrijden',label: 'Wedstrijden', icon: '📋' },
  { to: '/seizoen',    label: 'Seizoen',     icon: '📈' },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          {/* Brand */}
          <div className="header-brand">
            <img src={logo} alt="KFC Lennik" className="brand-logo" />
            <div className="brand-text">
              <span className="brand-name">KFC Lennik</span>
              <span className="brand-number">4157</span>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="nav desktop-nav">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-nav">
        {NAV_ITEMS.map(item => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
              <span className="mobile-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
