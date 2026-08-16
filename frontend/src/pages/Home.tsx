import { Link } from 'react-router-dom';
import { useTeam } from '../lib/TeamContext';
import './Home.css';

const TILES = [
  { to: '/matchday',      icon: '⚽', label: 'Matchday',            desc: 'Live speeltijden & opstelling' },
  { to: '/spelers',       icon: '👥', label: 'Spelers',              desc: 'Spelerslijst & profielen' },
  { to: '/wedstrijden',   icon: '📋', label: 'Wedstrijden',          desc: 'Matchen beheren' },
  { to: '/seizoen',       icon: '📈', label: 'Seizoensoverzicht',    desc: 'Speeltijd & statistieken' },
  { to: '/trainingen',    icon: '📝', label: 'Trainingen',           desc: 'Trainingen voorbereiden' },
  { to: '/oefendatabank', icon: '📚', label: 'Oefeningen',           desc: 'Oefeningendatabank' },
  { to: '/whiteboard',    icon: '🎨', label: 'Whiteboard',           desc: 'Snel een tekening maken' },
  { to: '/tactiek',       icon: '🧠', label: 'Tactiek',              desc: 'Het gamemodel van de club' },
];

export default function Home() {
  const { trainer, category } = useTeam();

  return (
    <div className="page">
      <div className="home-header">
        <h1 className="page-title">Welkom{trainer?.name ? `, ${trainer.name.split(' ')[0]}` : ''}</h1>
        <p className="page-subtitle">
          {trainer?.team ? `${trainer.team.name} · ${category ?? trainer.team.category}` : 'KFC Lennik 4157'}
        </p>
      </div>

      <div className="home-tiles">
        {TILES.map(t => (
          <Link key={t.to} to={t.to} className="home-tile">
            <span className="home-tile-icon">{t.icon}</span>
            <span className="home-tile-label">{t.label}</span>
            <span className="home-tile-desc">{t.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
