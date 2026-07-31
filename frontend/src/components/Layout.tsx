import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout } from '../lib/auth';
import { useTeam } from '../lib/TeamContext';
import { useTheme } from '../lib/ThemeContext';
import logo from '../assets/Logo-KFC-Lennik.png';
import './Layout.css';

export default function Layout() {
  const { trainer, setTrainer, isAdmin, category } = useTeam();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const NAV_ITEMS = [
    { to: '/',            label: 'Start',        icon: '🏠', end: true },
    { to: '/matchday',    label: 'Matchday',     icon: '⚽' },
    { to: '/spelers',     label: 'Spelers',      icon: '👥' },
    { to: '/wedstrijden', label: 'Wedstrijden',  icon: '📋' },
    { to: '/seizoen',     label: 'Seizoen',      icon: '📈' },
    { to: '/trainingen',  label: 'Trainingen',   icon: '📝' },
    { to: '/oefendatabank', label: 'Oefeningen', icon: '📚' },
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
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
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
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}>
              <span className="mobile-nav-icon">{item.icon}</span>
              <span className="mobile-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
