import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTeam } from '../lib/TeamContext';
import { getMatches, Match } from '../lib/api';
import WedstrijdBeheer from './WedstrijdBeheer';
import Matchday from './Matchday';
import SchemaMatchday from './SchemaMatchday';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import './Wedstrijd.css';

// ── Wedstrijdflow ────────────────────────────────────────────────────────────
// Eén scherm per wedstrijd, in de volgorde waarin een trainer ermee werkt:
//   1. Selectie      — wie is er mee (WedstrijdBeheer, tab selectie)
//   2. Wisselschema  — speeltijd vooraf eerlijk verdelen (SpeeltijdPlanner)
//   3. Live          — klok + speeltijd per speler (Matchday) of
//                      "volgens schema" zonder klok (SchemaMatchday)
//   4. Evaluatie     — spelers quoteren op het weekthema
// De stap staat in de URL (/wedstrijden/:id/:stap), zodat herladen of een
// gedeelde link op dezelfde plek uitkomt.

const STEPS = [
  { key: 'selectie',     label: 'Selectie' },
  { key: 'wisselschema', label: 'Wisselschema' },
  { key: 'live',         label: 'Live' },
  { key: 'evaluatie',    label: 'Evaluatie' },
] as const;
type StepKey = typeof STEPS[number]['key'];

type LiveMode = 'klok' | 'schema';
const LIVE_MODE_KEY = 'vt-live-mode';
function readLiveMode(): LiveMode {
  try { return localStorage.getItem(LIVE_MODE_KEY) === 'schema' ? 'schema' : 'klok'; } catch { return 'klok'; }
}

export default function Wedstrijd() {
  const { id, stap } = useParams<{ id: string; stap?: string }>();
  const navigate = useNavigate();
  const { teamId } = useTeam();
  const [match, setMatch] = useState<Match | null>(null);
  const [liveMode, setLiveMode] = useState<LiveMode>(readLiveMode);

  useEffect(() => {
    let alive = true;
    getMatches(teamId ?? undefined)
      .then(all => { if (alive) setMatch(all.find(m => m.id === id) ?? null); })
      .catch(() => { /* WedstrijdBeheer toont zelf de fout */ });
    return () => { alive = false; };
  }, [id, teamId]);

  const step = STEPS.find(s => s.key === stap)?.key as StepKey | undefined;
  if (!id) return <Navigate to="/wedstrijden" replace />;
  if (!step) return <Navigate to={`/wedstrijden/${id}/selectie`} replace />;
  const stepIdx = STEPS.findIndex(s => s.key === step);

  function chooseLiveMode(m: LiveMode) {
    setLiveMode(m);
    try { localStorage.setItem(LIVE_MODE_KEY, m); } catch { /* opslag niet beschikbaar */ }
  }

  return (
    <div className="wf">
      <div className="wf-header">
        <Link to="/wedstrijden" className="wf-back">← Alle wedstrijden</Link>
        <div className="wf-title-row">
          <h1 className="wf-title">{match ? `vs. ${match.opponent}` : 'Wedstrijd'}</h1>
          {match && (
            <span className="wf-meta">
              {format(new Date(match.date), 'EEEE d MMMM · HH:mm', { locale: nl })}
              {' · '}{match.location === 'home' ? 'Thuis' : 'Uit'}
            </span>
          )}
        </div>

        <nav className="wf-steps" aria-label="Stappen">
          {STEPS.map((s, i) => (
            <Link key={s.key} to={`/wedstrijden/${id}/${s.key}`}
              className={`wf-step ${s.key === step ? 'active' : ''} ${i < stepIdx ? 'done' : ''}`}
              aria-current={s.key === step ? 'step' : undefined}>
              <span className="wf-step-num">{i + 1}</span>
              <span className="wf-step-label">{s.label}</span>
            </Link>
          ))}
        </nav>

        {step === 'live' && (
          <div className="wf-live-mode">
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={liveMode === 'klok'}
                className={`segmented-item ${liveMode === 'klok' ? 'active' : ''}`}
                onClick={() => chooseLiveMode('klok')}>Met klok &amp; speeltijd</button>
              <button role="tab" aria-selected={liveMode === 'schema'}
                className={`segmented-item ${liveMode === 'schema' ? 'active' : ''}`}
                onClick={() => chooseLiveMode('schema')}>Volgens wisselschema</button>
            </div>
          </div>
        )}
      </div>

      <div className="wf-body">
        {step === 'live'
          ? (liveMode === 'klok' ? <Matchday key={id} matchId={id} /> : <SchemaMatchday key={id} matchId={id} />)
          : <WedstrijdBeheer key={id} matchId={id} tab={step} onClosed={() => navigate('/wedstrijden')} />}
      </div>

      <div className="wf-footer">
        {stepIdx > 0 && (
          <Link className="btn btn-outline" to={`/wedstrijden/${id}/${STEPS[stepIdx - 1].key}`}>← {STEPS[stepIdx - 1].label}</Link>
        )}
        <span style={{ flex: 1 }} />
        {stepIdx < STEPS.length - 1 && (
          <Link className="btn btn-primary" to={`/wedstrijden/${id}/${STEPS[stepIdx + 1].key}`}>{STEPS[stepIdx + 1].label} →</Link>
        )}
      </div>
    </div>
  );
}

/** Lijst van wedstrijden; een wedstrijd openen start de flow. */
export function WedstrijdLijst() {
  const navigate = useNavigate();
  return <WedstrijdBeheer onOpenMatch={m => navigate(`/wedstrijden/${m.id}/selectie`)} />;
}
