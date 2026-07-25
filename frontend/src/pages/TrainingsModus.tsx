import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTraining, updateTraining, Training, EXERCISE_FASE_LABELS, parseDrawingScene } from '../lib/api';
import DrawingCanvas from '../components/DrawingCanvas';
import './TrainingsModus.css';

const EINDGESPREK_VRAGEN = ['Actief?', 'Plezant?', 'Wat geleerd?'];

export default function TrainingsModus() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading]   = useState(true);
  const [screenIdx, setScreenIdx] = useState(0);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [finishing, setFinishing] = useState(false);

  // Per-oefening stopwatch
  const [elapsedSec, setElapsedSec] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (id) load(id); }, [id]);

  useEffect(() => {
    setElapsedSec(0);
    setRunning(false);
  }, [screenIdx]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  async function load(trainingId: string) {
    setLoading(true);
    try { setTraining(await getTraining(trainingId)); } finally { setLoading(false); }
  }

  async function handleFinish() {
    if (!training) return;
    setFinishing(true);
    try {
      await updateTraining(training.id, { status: 'afgewerkt' });
      navigate('/trainingen');
    } finally { setFinishing(false); }
  }

  function fmtClock(sec: number) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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

      {!isEindgesprek && ex && (
        <div className="tm-exercise">
          <span className={`tm-fase-badge tm-fase-${ex.fase}`}>{EXERCISE_FASE_LABELS[ex.fase]}</span>
          <h1 className="tm-ex-name">{ex.naam || 'Naamloze oefening'}</h1>

          <div className="tm-timer">
            <span className="tm-timer-clock">{fmtClock(elapsedSec)}</span>
            <span className="tm-timer-target">/ {ex.duurMinuten}:00</span>
            <button className="btn btn-primary btn-sm" onClick={() => setRunning(r => !r)}>{running ? '⏸ Pauze' : '▶ Start'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setElapsedSec(0); setRunning(false); }}>↺</button>
          </div>

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
