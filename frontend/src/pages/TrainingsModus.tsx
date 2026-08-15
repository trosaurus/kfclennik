import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTraining, updateTraining, Training, EXERCISE_FASE_LABELS, parseDrawingScene } from '../lib/api';
import DrawingCanvas from '../components/DrawingCanvas';
import './TrainingsModus.css';

const EINDGESPREK_VRAGEN = ['Actief?', 'Plezant?', 'Wat geleerd?'];

/** Parseert vrije-tekst tijdstip-invoer ("18:30", "18u30", "18.30") naar een
 * Date van vandaag. Geeft null bij lege/onherkenbare invoer — de tijdlijn
 * wordt dan gewoon niet getoond i.p.v. een onzinnig schema op te bouwen. */
function parseTijdstip(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[:.uUhH]\s*(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

function fmtHM(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** Formatteert seconden als mm:ss, met een '-' voor negatieve waarden (over tijd). */
function fmtSigned(totalSec: number): string {
  const sign = totalSec < 0 ? '-' : '';
  const abs = Math.abs(totalSec);
  const m = Math.floor(abs / 60), s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, '0')}`;
}

export default function TrainingsModus() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading]   = useState(true);
  const [screenIdx, setScreenIdx] = useState(0);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [finishing, setFinishing] = useState(false);

  // Trainingstimer: start één keer (bij de eerste oefening die gestart wordt) en
  // loopt daarna ononderbroken door tot het ingestelde einduur, ook als je tussen
  // oefeningen navigeert — dit is bewust geen per-oefening stopwatch meer.
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);

  // Live klok, voor de tijdlijn/"over tijd"-indicator en de sessietimer
  const [now, setNow] = useState(() => new Date());

  useEffect(() => { if (id) load(id); }, [id]);

  useEffect(() => {
    const clockRef = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockRef);
  }, []);

  async function load(trainingId: string) {
    setLoading(true);
    try { setTraining(await getTraining(trainingId)); } finally { setLoading(false); }
  }

  function handleStartSession() {
    setSessionStarted(true);
    setSessionStartedAt(new Date());
  }

  async function handleFinish() {
    if (!training) return;
    setFinishing(true);
    try {
      await updateTraining(training.id, { status: 'afgewerkt' });
      navigate('/trainingen');
    } finally { setFinishing(false); }
  }

  if (loading) return <div className="tm-page"><div className="loading-spinner">Training laden...</div></div>;
  if (!training) return (
    <div className="tm-page">
      <div className="empty-state">⚠ Training niet gevonden</div>
      <button className="btn btn-outline" onClick={() => navigate('/trainingen')}>← Terug</button>
    </div>
  );

  const exercises = training.exercises;
  if (exercises.length === 0) {
    return (
      <div className="tm-page">
        <div className="tm-topbar">
          <button className="tm-back" onClick={() => navigate('/trainingen')}>← Terug</button>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🏃</div>
          Deze training heeft nog geen oefeningen.
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/trainingen/${training.id}`)}>Oefeningen toevoegen</button>
          </div>
        </div>
      </div>
    );
  }

  const totalScreens = exercises.length + 1;
  const isEindgesprek = screenIdx === exercises.length;
  const ex = !isEindgesprek ? exercises[screenIdx] : null;
  const totalMinDone = exercises.slice(0, screenIdx).reduce((a, e) => a + (e.duurMinuten || 0), 0);

  // Tijdlijn: gepland start-/einduur per oefening, opgebouwd vanaf het ingegeven
  // tijdstip + de cumulatieve duur van de voorgaande oefeningen — zo zie je in
  // klokuren wanneer elke oefening zou moeten starten/eindigen, en of je nog op
  // schema zit t.o.v. de live klok (`now`).
  const scheduleStart = parseTijdstip(training.tijdstip);
  const schedule = scheduleStart
    ? exercises.map((e, i) => {
        const startMin = exercises.slice(0, i).reduce((a, x) => a + (x.duurMinuten || 0), 0);
        const start = new Date(scheduleStart.getTime() + startMin * 60000);
        const end = new Date(start.getTime() + (e.duurMinuten || 0) * 60000);
        return { start, end };
      })
    : [];
  const curSlot = !isEindgesprek ? schedule[screenIdx] : null;

  // Live status van het huidige blok t.o.v. de klok: nog te starten / bezig / over tijd.
  let curStatus: { kind: 'before' | 'during' | 'over'; minutes: number } | null = null;
  if (curSlot) {
    if (now < curSlot.start) curStatus = { kind: 'before', minutes: Math.round((curSlot.start.getTime() - now.getTime()) / 60000) };
    else if (now > curSlot.end) curStatus = { kind: 'over', minutes: Math.round((now.getTime() - curSlot.end.getTime()) / 60000) };
    else curStatus = { kind: 'during', minutes: Math.round((curSlot.end.getTime() - now.getTime()) / 60000) };
  }

  // Ingesteld einduur = tijdstip + de duur die voor de hele training is ingegeven
  // (niet de som van de oefeningen — dat vergelijken we net hieronder). Zonder
  // tijdstip valt de sessietimer terug op het écht gestarte moment als anker.
  const trainingEnd = scheduleStart ? new Date(scheduleStart.getTime() + (training.duurMinuten || 0) * 60000) : null;
  const effectiveEnd = trainingEnd
    ?? (sessionStartedAt ? new Date(sessionStartedAt.getTime() + (training.duurMinuten || 0) * 60000) : null);
  const remainingSec = sessionStarted && effectiveEnd ? Math.round((effectiveEnd.getTime() - now.getTime()) / 1000) : null;

  // Passen de oefeningen samen binnen de ingegeven totale duur van de training?
  const totalPlannedMin = exercises.reduce((a, e) => a + (e.duurMinuten || 0), 0);
  const overCapacityMin = totalPlannedMin - (training.duurMinuten || 0);

  return (
    <div className="tm-page">
      <div className="tm-topbar">
        <button className="tm-back" onClick={() => navigate('/trainingen')}>✕</button>
        <div className="tm-topbar-title">
          <span className="tm-title-main">{training.titel || 'Training'}</span>
          {training.jaarplanLabel && <span className="tm-title-sub">{training.jaarplanLabel}</span>}
        </div>
        <span className="tm-screen-count">{isEindgesprek ? '✓' : `${screenIdx + 1}/${exercises.length}`}</span>
      </div>

      <div className="tm-progress-wrap">
        <div className="tm-progress-fill" style={{ width: `${((screenIdx) / totalScreens) * 100}%` }} />
      </div>
      <div className="tm-progress-label">{totalMinDone}min afgewerkt van {training.duurMinuten}min gepland</div>

      {/* ── Statusbalk: elk trainingsonderdeel + of ze samen binnen de geplande duur passen ── */}
      {scheduleStart ? (
        <div className="tm-schedule">
          {schedule.map((slot, i) => {
            const state = i === screenIdx && !isEindgesprek ? 'current' : now > slot.end ? 'past' : 'future';
            return (
              <button
                key={i}
                className={`tm-schedule-chip tm-schedule-${state}`}
                onClick={() => setScreenIdx(i)}
                title={exercises[i].naam || 'Naamloze oefening'}
              >
                <span className="tm-schedule-time">{fmtHM(slot.start)}</span>
                <span className="tm-schedule-name">{exercises[i].naam || `Oef. ${i + 1}`}</span>
              </button>
            );
          })}
          {trainingEnd && (
            <div className={`tm-schedule-end ${overCapacityMin > 0 ? 'over' : ''}`} title="Ingesteld einduur">
              🏁 {fmtHM(trainingEnd)}
            </div>
          )}
        </div>
      ) : (
        <div className="tm-schedule-hint">
          ⏱ Vul een tijdstip in bij de trainingsgegevens (✏️ Bewerken) om hier een tijdschema per oefening te zien.
        </div>
      )}

      <div className={`tm-capacity ${overCapacityMin > 0 ? 'over' : 'ok'}`}>
        {overCapacityMin > 0
          ? `⚠ Oefeningen samen ${totalPlannedMin} min — dat is ${overCapacityMin} min meer dan de ingestelde duur (${training.duurMinuten} min)`
          : `✓ Oefeningen (${totalPlannedMin} min) passen binnen de ingestelde duur (${training.duurMinuten} min)`}
      </div>

      {/* ── Sessietimer: start bij de eerste oefening en loopt door tot het ingestelde einduur ── */}
      <div className="tm-timer">
        {!sessionStarted ? (
          <button className="btn btn-primary tm-start-btn" onClick={handleStartSession}>▶ Start training</button>
        ) : (
          <>
            <span className={`tm-timer-clock ${remainingSec !== null && remainingSec < 0 ? 'over' : ''}`}>
              {remainingSec !== null ? fmtSigned(remainingSec) : '—:—'}
            </span>
            {effectiveEnd && <span className="tm-timer-target">tot {fmtHM(effectiveEnd)}</span>}
            <button className="btn btn-ghost btn-sm" title="Herstart sessietimer"
              onClick={() => { setSessionStarted(false); setSessionStartedAt(null); }}>↺</button>
          </>
        )}
      </div>

      {!isEindgesprek && ex && (
        <div className="tm-exercise">
          <span className={`tm-fase-badge tm-fase-${ex.fase}`}>{EXERCISE_FASE_LABELS[ex.fase]}</span>
          <h1 className="tm-ex-name">{ex.naam || 'Naamloze oefening'}</h1>

          {curSlot && curStatus && (
            <div className={`tm-schedule-status tm-schedule-status-${curStatus.kind}`}>
              {`Gepland ${fmtHM(curSlot.start)}–${fmtHM(curSlot.end)} · `}
              {curStatus.kind === 'before' && `start over ${curStatus.minutes} min`}
              {curStatus.kind === 'during' && `nog ${curStatus.minutes} min`}
              {curStatus.kind === 'over' && `⚠ ${curStatus.minutes} min over tijd`}
            </div>
          )}

          {(ex.organisatieSpelers || ex.organisatieAfmetingen || ex.organisatieMateriaal) && (
            <div className="tm-info-block tm-info-grid">
              {ex.organisatieSpelers && <div><span className="tm-info-pill">Spelers</span>{ex.organisatieSpelers}</div>}
              {ex.organisatieAfmetingen && <div><span className="tm-info-pill">Afmetingen</span>{ex.organisatieAfmetingen}</div>}
              {ex.organisatieMateriaal && <div><span className="tm-info-pill">Materiaal</span>{ex.organisatieMateriaal}</div>}
            </div>
          )}
          {ex.beschrijving && (
            <div className="tm-info-block">
              <div className="tm-info-title">Beschrijving</div>
              <div className="tm-info-text">{ex.beschrijving}</div>
            </div>
          )}
          {ex.coachingPunten && (
            <div className="tm-info-block">
              <div className="tm-info-title">Coaching</div>
              <div className="tm-info-text">{ex.coachingPunten}</div>
            </div>
          )}
          {ex.maximaalActief && (
            <div className="tm-info-block">
              <div className="tm-info-title">Maximaal actief</div>
              <div className="tm-info-text">{ex.maximaalActief}</div>
            </div>
          )}
          {ex.fun && (
            <div className="tm-info-block">
              <div className="tm-info-title">Fun</div>
              <div className="tm-info-text">{ex.fun}</div>
            </div>
          )}

          <div className="tm-drawing">
            <DrawingCanvas scene={parseDrawingScene(ex.drawingData)} readOnly />
          </div>
        </div>
      )}

      {isEindgesprek && (
        <div className="tm-exercise tm-eindgesprek">
          <span className="tm-fase-badge tm-fase-cooling_down">Eindgesprek</span>
          <h1 className="tm-ex-name">Afsluiten</h1>
          <div className="tm-eindgesprek-list">
            {EINDGESPREK_VRAGEN.map((q, i) => (
              <button key={q} className={`tm-eindgesprek-item ${checked[i] ? 'checked' : ''}`}
                onClick={() => setChecked(c => ({ ...c, [i]: !c[i] }))}>
                <span className="tm-eindgesprek-check">{checked[i] ? '✓' : ''}</span>
                <span>{q}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary tm-finish-btn" disabled={finishing} onClick={handleFinish}>
            {finishing ? 'Bezig...' : '✓ Training afronden'}
          </button>
        </div>
      )}

      <div className="tm-nav">
        <button className="tm-nav-btn" disabled={screenIdx === 0} onClick={() => setScreenIdx(i => Math.max(0, i - 1))}>◀ Vorige</button>
        <button className="tm-nav-btn" disabled={isEindgesprek} onClick={() => setScreenIdx(i => Math.min(totalScreens - 1, i + 1))}>Volgende ▶</button>
      </div>
    </div>
  );
}
