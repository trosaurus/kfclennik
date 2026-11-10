import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Match, Attendance, Period, Goal,
  getMatches, getMatchOfTheWeek, getAttendancesForMatch, getPeriodsForMatch, getGoalsForMatch, getMatchScore,
  createPeriod, updatePeriod, updateMatch, addGoal, removeGoal, resetMatchScore,
} from '../lib/api';
import { useTeam } from '../lib/TeamContext';
import { fmtMin, FIELD_LINIES, LINIE_SHORT, Linie, blockChanges, swapInBlock } from '../lib/speeltijd';
import { toPlanPlayers, buildPlan } from '../lib/speeltijdSettings';
import { usePlannerSettings } from '../lib/usePlannerSettings';
import './SchemaMatchday.css';

// ── Match live (schema-matchday) ─────────────────────────────────────────────
// Lichte variant van Matchday: geen klok en niets te starten. Je bladert door de
// blokken van het wisselschema (zoals ingesteld bij Wedstrijden → Wisselschema),
// ziet wie op het veld staat, en tikt op een naam om een doelpunt te noteren.
// Slepen op een andere speler wisselt die twee in dit blok; de latere blokken
// worden daarna herrekend, zodat de speeltijd eerlijk verdeeld blijft. Het schema
// is gedeeld tussen de trainers; welk blok je bekijkt blijft per toestel.
// Doelpunten en stand worden geregeld opnieuw opgehaald, zodat een tweede trainer
// meekijkt met wat de eerste noteert.
// Doelpunten en stand per periode gaan naar dezelfde Goal/Period-records als
// Matchday, zodat ze overal (seizoensoverzicht, wedstrijdlijst) meetellen.

const MATCH_KEY = 'schema_md_match';
const blockKey = (matchId: string) => `schema_md_block_${matchId}`;

function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* opslag niet beschikbaar */ }
}

/** Hoe vaak doelpunten en stand van een andere trainer opgehaald worden. */
const LIVE_POLL_MS = 10_000;

/** Pixels beweging voordat een tik een versleping wordt. */
const DRAG_THRESHOLD = 8;

interface DragState { id: string; linie: Linie | 'bench'; over: string | null; x: number; y: number }

/** Speler-id onder de vinger/muis (de sleep-kopie zelf laat pointer-events door). */
function dropTargetAt(x: number, y: number): string | null {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-player-id]')?.dataset.playerId ?? null;
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });

export default function SchemaMatchday({ matchId: fixedMatchId }: { matchId?: string } = {}) {
  const { teamId, category } = useTeam();
  const [matches, setMatches] = useState<Match[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [blockIdx, setBlockIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // id van de knop die bezig is
  // Laatst genoteerd doelpunt — toont een melding met "Ongedaan maken".
  const [lastGoal, setLastGoal] = useState<Goal | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Na een versleping volgt soms nog een click op de speler — dat is geen doelpunt.
  const suppressClick = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  // Telt eigen opslagacties: een poll die er eentje kruist heeft verouderde data.
  const writes = useRef(0);

  const matchId = match?.id;
  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    let inFlight = false;

    async function sync() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      const startedAt = writes.current;
      try {
        const [per, gls, score] = await Promise.all([
          getPeriodsForMatch(matchId!), getGoalsForMatch(matchId!), getMatchScore(matchId!),
        ]);
        if (!alive || startedAt !== writes.current) return;
        setPeriods(per);
        setGoals(gls);
        // Door de andere trainer verwijderd: dan valt er niets meer ongedaan te maken.
        setLastGoal(g => g && gls.some(x => x.id === g.id) ? g : null);
        if (score) {
          setMatch(m => m && m.id === matchId ? { ...m, ...score } : m);
          setMatches(all => all.map(m => m.id === matchId ? { ...m, ...score } : m));
        }
      } catch (e) {
        console.error(e); // bv. even geen bereik — de volgende poll probeert opnieuw
      } finally {
        inFlight = false;
      }
    }

    const onVisible = () => { if (!document.hidden) sync(); };
    const interval = setInterval(sync, LIVE_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [matchId]);

  useEffect(() => { boot(); }, [teamId, fixedMatchId]);

  async function boot() {
    setLoading(true);
    setLoadError(null);
    try {
      const all = await getMatches(teamId ?? undefined);
      setMatches(all);
      const fixed = fixedMatchId ? all.find(m => m.id === fixedMatchId) : undefined;
      const saved = all.find(m => m.id === readLS(MATCH_KEY));
      const pick = fixedMatchId ? fixed : (saved ?? getMatchOfTheWeek(all));
      if (pick) await loadMatch(pick);
      else setMatch(null);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  async function loadMatch(m: Match) {
    setMatch(m);
    writeLS(MATCH_KEY, m.id);
    setBlockIdx(parseInt(readLS(blockKey(m.id)) ?? '0') || 0);
    // Eerst leegmaken, anders rekent het schema even met de selectie van de vorige wedstrijd.
    setAttendances([]);
    setPeriods([]);
    setGoals([]);
    setLoadError(null);
    try {
      const [att, per, gls] = await Promise.all([
        getAttendancesForMatch(m.id), getPeriodsForMatch(m.id), getGoalsForMatch(m.id),
      ]);
      setAttendances(att);
      setPeriods(per);
      setGoals(gls);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refresh() {
    if (!match) return;
    const [per, gls, all] = await Promise.all([
      getPeriodsForMatch(match.id), getGoalsForMatch(match.id), getMatches(teamId ?? undefined),
    ]);
    setPeriods(per);
    setGoals(gls);
    setMatches(all);
    const fresh = all.find(m => m.id === match.id);
    if (fresh) setMatch(fresh);
  }

  // ── Schema ──
  const cat = match?.team?.category ?? category ?? undefined;
  const { settings, update: updateSettings, syncError } = usePlannerSettings(match?.id ?? null, cat);
  const planPlayers = useMemo(
    () => toPlanPlayers(attendances.filter(a => a.selected === 'true').map(a => a.player)),
    [attendances],
  );
  const { plan, planError } = useMemo(() => {
    if (!match) return { plan: null, planError: null };
    try {
      return { plan: buildPlan(planPlayers, settings), planError: null };
    } catch (e) {
      console.error(e);
      return { plan: null, planError: e instanceof Error ? e.message : String(e) };
    }
  }, [match?.id, planPlayers, settings]);

  const blocks = plan?.blocks ?? [];
  const idx = Math.min(blockIdx, Math.max(0, blocks.length - 1));
  const block = blocks[idx];
  const multiBlock = blocks.some(b => b.block > 0);
  const blockLabel = (b: { period: number; block: number }) => multiBlock ? `P${b.period}.${b.block + 1}` : `P${b.period}`;

  function go(i: number) {
    if (!match) return;
    const next = Math.max(0, Math.min(blocks.length - 1, i));
    setBlockIdx(next);
    writeLS(blockKey(match.id), String(next));
  }

  // ── Versleping ──
  /** Bewaart de wissel: een vastgezet blok rechtstreeks, anders als aanpassing op dit blok. */
  function swapPlayers(a: string, b: string) {
    // Op het schema van dát moment: de andere trainer kan intussen iets gewijzigd hebben.
    updateSettings(s => {
      const current = buildPlan(planPlayers, s).blocks[idx];
      if (!current) return s;
      const next = swapInBlock(current, a, b);
      return idx < s.fixed.length
        ? { ...s, fixed: s.fixed.map((f, i) => i === idx ? next : f) }
        : { ...s, overrides: { ...s.overrides, [idx]: next } };
    });
  }

  function resetBlock() {
    updateSettings(s => {
      const overrides = { ...s.overrides };
      delete overrides[idx];
      return { ...s, overrides };
    });
  }

  function startDrag(e: ReactPointerEvent, id: string, linie: Linie | 'bench') {
    if (e.button !== 0 || busy) return;
    suppressClick.current = false;
    const { clientX: startX, clientY: startY, pointerId } = e;
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        suppressClick.current = true;
      }
      setDrag({ id, linie, over: dropTargetAt(ev.clientX, ev.clientY), x: ev.clientX, y: ev.clientY });
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      stopDrag.current = null;
      setDrag(null);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      if (!dragging) return;
      const target = dropTargetAt(ev.clientX, ev.clientY);
      // Bank ↔ bank verandert niets aan het schema.
      if (target && target !== id && !(linie === 'bench' && block?.bench.includes(target))) swapPlayers(id, target);
    };
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) stop(); };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    stopDrag.current = stop;
  }

  // ── Stand ──
  // scoreHome/scoreAway zijn de letterlijke thuis-/uitploeg-kolommen; welke
  // daarvan "ons" is hangt af van match.location (zoals in addGoal).
  const ownField = match?.location === 'home' ? 'scoreHome' : 'scoreAway';
  const oppField = match?.location === 'home' ? 'scoreAway' : 'scoreHome';
  const periodCount = Math.max(plan ? Math.max(...blocks.map(b => b.period), 0) : 0, ...periods.map(p => p.periodNumber));
  const periodScore = (n: number) => {
    const p = periods.find(x => x.periodNumber === n);
    return { own: p?.[ownField] ?? 0, opp: p?.[oppField] ?? 0 };
  };
  const currentPeriod = block?.period ?? 1;
  const tussenstand = Array.from({ length: currentPeriod }, (_, i) => periodScore(i + 1))
    .reduce((acc, s) => ({ own: acc.own + s.own, opp: acc.opp + s.opp }), { own: 0, opp: 0 });

  const goalsByPlayer = new Map<string, number>();
  for (const g of goals) if (g.player) goalsByPlayer.set(g.player.id, (goalsByPlayer.get(g.player.id) ?? 0) + 1);

  async function ensurePeriod(n: number): Promise<Period> {
    // Vers ophalen: de andere trainer kan de periode aangemaakt of de stand gewijzigd hebben.
    const fresh = await getPeriodsForMatch(match!.id);
    setPeriods(fresh);
    const existing = fresh.find(p => p.periodNumber === n);
    if (existing) return existing;
    const created = await createPeriod(match!.id, n);
    setPeriods(prev => [...prev, created]);
    return created;
  }

  async function recomputeTotals() {
    const all = await getPeriodsForMatch(match!.id);
    await updateMatch(match!.id, {
      scoreHome: all.reduce((s, p) => s + (p.scoreHome || 0), 0),
      scoreAway: all.reduce((s, p) => s + (p.scoreAway || 0), 0),
    });
  }

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    writes.current++;
    try { await fn(); await refresh(); }
    catch (e) { console.error(e); alert('Opslaan mislukt — controleer je verbinding en probeer opnieuw.'); }
    finally { writes.current++; setBusy(null); }
  }

  function scoreGoal(playerId: string) {
    run(`goal-${playerId}`, async () => {
      await ensurePeriod(currentPeriod);
      const g = await addGoal(match!.id, playerId, currentPeriod, match!.location);
      setLastGoal(g);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setLastGoal(null), 8000);
    });
  }

  /** Doelpunt verwijderen; `ask` = eerst bevestigen (niet nodig bij "Ongedaan maken"). */
  function deleteGoal(g: Goal, ask = true) {
    if (ask && !confirm(`Doelpunt van ${g.player?.name ?? "onbekende speler"} in periode ${g.periodNumber} verwijderen?`)) return;
    if (lastGoal?.id === g.id) setLastGoal(null);
    run(`del-${g.id}`, () => removeGoal(g.id, match!.id, g.periodNumber, match!.location));
  }

  function changeOpp(delta: number) {
    run(`opp${delta}`, async () => {
      const p = await ensurePeriod(currentPeriod);
      const cur = p[oppField] ?? 0;
      if (delta < 0 && cur === 0) return;
      await updatePeriod(p.id, { [oppField]: Math.max(0, cur + delta) });
      await recomputeTotals();
    });
  }

  /** Tweede stap van "Opnieuw beginnen" — de eerste stap is het bevestigingspaneel. */
  function resetMatch() {
    if (!confirm(`Laatste controle: alle doelpunten en de stand van ${match!.opponent} wissen?`)) return;
    run('reset', async () => {
      await resetMatchScore(match!.id);
      setLastGoal(null);
      setConfirmReset(false);
      go(0);
    });
  }

  function toggleFinished() {
    const finished = match!.status === 'finished';
    run('status', async () => {
      await updateMatch(match!.id, finished
        ? { status: 'planned', periodStatus: 'idle' }
        : { status: 'finished', periodStatus: 'finished' });
    });
  }

  // ── Render ──
  if (loading) return <div className="page"><div className="loading-spinner">Laden...</div></div>;

  const nameOf = new Map(planPlayers.map(p => [p.id, p.name]));
  const numberOf = new Map(attendances.filter(a => a.player).map(a => [a.player.id, a.player.number]));
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
  const names = (ids: string[]) => ids.map(id => nameOf.get(id) ?? '?').join(', ');

  const matchSelect = (
    <select className="smd-match-select" value={match?.id ?? ''} aria-label="Wedstrijd kiezen"
      onChange={e => { const m = matches.find(x => x.id === e.target.value); if (m) loadMatch(m); }}>
      {!match && <option value="">Kies een wedstrijd…</option>}
      {matches.map(m => (
        <option key={m.id} value={m.id}>
          {fmtDate(m.date)} — {m.location === 'home' ? 'Thuis' : 'Uit'} vs. {m.opponent}{m.status === 'finished' ? ' ✓' : ''}
        </option>
      ))}
    </select>
  );

  if (!match) {
    return (
      <div className="page smd">
        <div className="card smd-head">{matchSelect}</div>
        {loadError && <div className="smd-error">Laden mislukt: {loadError} <button className="btn btn-outline btn-sm" onClick={boot}>Opnieuw</button></div>}
        <div className="card empty-state" style={{ padding: '32px 16px' }}>Geen wedstrijden gevonden — maak er eerst een aan bij Wedstrijden.</div>
      </div>
    );
  }

  const nextBlock = blocks[idx + 1];
  const nextIn = new Set(nextBlock?.in ?? []);
  const nextOut = new Set(nextBlock?.out ?? []);
  const changes = block && nextBlock ? blockChanges(block, nextBlock) : null;
  const finished = match.status === 'finished';
  const isLastPeriod = currentPeriod >= periodCount;

  /** Speler op het veld of de bank: tik = doelpunt, slepen = wisselen. Bewust geen
   *  component: een nieuw componenttype per render zou de speler tijdens het slepen herbouwen. */
  const renderToken = (id: string, linie: Linie | 'bench') => {
    const bench = linie === 'bench';
    const n = goalsByPlayer.get(id) ?? 0;
    const name = nameOf.get(id) ?? '?';
    const nr = numberOf.get(id);
    const isBusy = busy === `goal-${id}`;
    const leaving = !bench && nextOut.has(id);
    const coming = bench && nextIn.has(id);
    const droppable = drag && drag.id !== id && drag.over === id && !(bench && drag.linie === 'bench');
    return (
      <button key={id} type="button" data-player-id={id}
        className={`smd-token smd-l-${linie} ${bench ? 'bench' : ''} ${isBusy ? 'busy' : ''} ${leaving ? 'leaving' : ''} ${coming ? 'coming' : ''} ${drag?.id === id ? 'dragging' : ''} ${droppable ? 'drop-target' : ''}`}
        disabled={busy !== null}
        onPointerDown={e => startDrag(e, id, linie)}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          scoreGoal(id);
        }}
        title={`${name} — tik om een doelpunt te noteren (periode ${currentPeriod}), sleep om te wisselen`}>
        <span className="smd-shirt">
          {isBusy ? '…' : nr != null ? nr : initials(name)}
          {n > 0 && <span className="smd-badge-goal" aria-label={`${n} doelpunten`}>{n > 1 ? n : '⚽'}</span>}
          {leaving && <span className="smd-badge-out" title="Gaat eruit bij de volgende wissel">▼</span>}
          {coming && <span className="smd-badge-in" title="Komt erin bij de volgende wissel">▲</span>}
        </span>
        <span className="smd-token-name">{name}</span>
      </button>
    );
  };

  return (
    <div className="page smd">
      {/* ── Kop: wedstrijd + scorebord ── */}
      <div className="card smd-head">
        <div className="smd-head-top">
          {fixedMatchId ? <span className="smd-match-fixed">vs. {match.opponent}</span> : matchSelect}
          <span className={`smd-status ${finished ? 'done' : ''}`}>{finished ? 'Afgesloten' : match.location === 'home' ? 'Thuis' : 'Uit'}</span>
        </div>

        <div className="smd-board">
          <div className="smd-board-team">
            <span className="smd-board-name">KFC Lennik</span>
          </div>
          <div className="smd-board-score">
            <span>{tussenstand.own}</span><span className="smd-board-sep">–</span><span>{tussenstand.opp}</span>
          </div>
          <div className="smd-board-team opp">
            <span className="smd-board-name">{match.opponent}</span>
            <div className="smd-opp-ctrl" aria-label={`Tegendoelpunten periode ${currentPeriod}`}>
              <button type="button" disabled={busy !== null || periodScore(currentPeriod).opp === 0}
                onClick={() => changeOpp(-1)} title="Tegendoelpunt verwijderen">−</button>
              <button type="button" className="plus" disabled={busy !== null}
                onClick={() => changeOpp(1)} title={`Tegendoelpunt in periode ${currentPeriod}`}>+ Tegen</button>
            </div>
          </div>
        </div>
        <div className="smd-board-sub">
          {isLastPeriod ? 'Eindstand' : `Tussenstand na periode ${currentPeriod}`}
          {!isLastPeriod && <> · totaal {match[ownField]}–{match[oppField]}</>}
        </div>

        {lastGoal && (
          <div className="smd-toast">
            <span>⚽ <strong>{lastGoal.player?.name ?? 'Doelpunt'}</strong> genoteerd in P{lastGoal.periodNumber}</span>
            <button type="button" disabled={busy !== null} onClick={() => deleteGoal(lastGoal, false)}>↶ Ongedaan maken</button>
          </div>
        )}
      </div>

      {loadError && <div className="smd-error">Laden mislukt: {loadError} <button className="btn btn-outline btn-sm" onClick={() => loadMatch(match)}>Opnieuw</button></div>}

      {syncError && <div className="smd-error">Niet gesynchroniseerd — wijzigingen staan voorlopig enkel op dit toestel en worden opnieuw verstuurd zodra het kan.</div>}

      {planError ? (
        <div className="smd-error">Het wisselschema kon niet berekend worden: {planError}. Open Wedstrijden → Wisselschema en controleer de instellingen.</div>
      ) : !plan || planPlayers.length === 0 ? (
        <div className="card empty-state" style={{ padding: '32px 16px' }}>
          Nog geen selectie voor deze wedstrijd — selecteer spelers bij Wedstrijden → Selectie en stel het wisselschema in.
        </div>
      ) : block && (<>
        {/* ── Tijdlijn: periodes met hun blokken + stand ── */}
        <div className="smd-timeline">
          {Array.from({ length: periodCount }, (_, i) => i + 1).map(n => {
            const sc = periodScore(n);
            const pBlocks = blocks.map((b, i) => ({ b, i })).filter(x => x.b.period === n);
            const active = n === currentPeriod;
            return (
              <div key={n} className={`smd-tl-period ${active ? 'active' : ''} ${n < currentPeriod ? 'past' : ''}`}>
                <button type="button" className="smd-tl-head" onClick={() => go(pBlocks[0]?.i ?? 0)}>
                  <span>P{n}</span><strong>{sc.own}–{sc.opp}</strong>
                </button>
                {multiBlock && (
                  <div className="smd-tl-blocks">
                    {pBlocks.map(({ b, i }) => (
                      <button key={i} type="button" className={`smd-tl-block ${i === idx ? 'active' : ''}`}
                        onClick={() => go(i)} title={`${blockLabel(b)} · ${fmtMin(b.startMin)}–${fmtMin(b.endMin)}`} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Blok-navigatie ── */}
        <div className="smd-nav">
          <button type="button" className="smd-nav-btn" disabled={idx === 0} onClick={() => go(idx - 1)} aria-label="Vorig blok">‹</button>
          <div className="smd-nav-title">
            <strong>Periode {block.period}{multiBlock && <span className="smd-nav-part"> · deel {block.block + 1}</span>}</strong>
            <span>{fmtMin(block.startMin)} – {fmtMin(block.endMin)}</span>
          </div>
          <button type="button" className="smd-nav-btn" disabled={idx >= blocks.length - 1} onClick={() => go(idx + 1)} aria-label="Volgend blok">›</button>
        </div>

        {nextBlock && changes && (
          <button type="button" className="smd-next" onClick={() => go(idx + 1)}>
            <span className="smd-next-head">
              <span className="smd-next-label">Volgende wissel</span>
              <span className="smd-next-when">
                Periode {nextBlock.period}{multiBlock && ` · deel ${nextBlock.block + 1}`} · {fmtMin(nextBlock.startMin)} ›
              </span>
            </span>
            {changes.swaps.length > 0 ? (
              <span className="smd-next-swaps">
                {changes.swaps.map((c, i) => (
                  <span key={i} className="smd-swap">
                    {c.linie && <span className={`smd-swap-pos smd-l-${c.linie}`}>{LINIE_SHORT[c.linie]}</span>}
                    <span className="out">▼ {c.out ? names([c.out]) : '—'}</span>
                    <span className="smd-swap-arrow">→</span>
                    <span className="in">▲ {c.in ? names([c.in]) : '—'}</span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="smd-next-none">Geen wissels — iedereen op het veld speelt door</span>
            )}
            {changes.moved.length > 0 && (
              <span className="smd-next-moved">
                Schuift door: {changes.moved.map(m => `${names([m.id])} ${LINIE_SHORT[m.from]} → ${LINIE_SHORT[m.to]}`).join(', ')}
              </span>
            )}
          </button>
        )}

        {/* ── Veld: aanval boven, doelman onder ── */}
        <div className="smd-pitch">
          <div className="smd-pitch-lines" aria-hidden="true"><span className="smd-pitch-box" /></div>
          {[...FIELD_LINIES].reverse().filter(l => block.lines[l].length > 0).map(l => (
            <div key={l} className="smd-row" aria-label={LINIE_SHORT[l]}>
              {block.lines[l].map(id => renderToken(id, l))}
            </div>
          ))}
          {block.gk && <div className="smd-row">{renderToken(block.gk, 'gk')}</div>}
          <div className="smd-pitch-hint">Tik = doelpunt · Sleep op een andere speler = wisselen</div>
        </div>

        {block.edited && (
          <div className="smd-edited">
            <span>✎ Dit deel is aangepast — de delen erna zijn herrekend.</span>
            <button type="button" onClick={resetBlock}>↺ Herstel dit deel</button>
          </div>
        )}

        {block.in.length > 0 && (
          <div className="smd-subs">
            <div className="smd-subs-col in"><span className="smd-subs-label">▲ Erin</span>{names(block.in)}</div>
            <div className="smd-subs-col out"><span className="smd-subs-label">▼ Eruit</span>{names(block.out)}</div>
          </div>
        )}

        {block.bench.length > 0 && (
          <div className="smd-bench">
            <span className="smd-bench-label">Bank</span>
            <div className="smd-bench-row">
              {block.bench.map(id => renderToken(id, 'bench'))}
            </div>
          </div>
        )}
      </>)}

      {/* ── Alle doelpunten (ook buiten het schema om te corrigeren) ── */}
      <details className="card smd-goallist" open={goals.length > 0 && goals.length <= 6}>
        <summary>
          <span>Doelpunten KFC Lennik</span>
          <span className="smd-goallist-count">{goals.length}</span>
        </summary>
        {goals.length === 0
          ? <div className="smd-empty">Nog geen doelpunten genoteerd.</div>
          : goals.map(g => (
            <div key={g.id} className={`smd-goal-row ${g.periodNumber === currentPeriod ? 'current' : ''}`}>
              <span className="smd-goal-period">P{g.periodNumber}</span>
              <span className="smd-goal-name">⚽ {g.player?.name ?? <em>onbekende speler</em>}</span>
              <button type="button" className="smd-goal-del" disabled={busy !== null} onClick={() => deleteGoal(g)}
                title="Doelpunt verwijderen" aria-label={`Doelpunt van ${g.player?.name ?? 'onbekende speler'} verwijderen`}>
                {busy === `del-${g.id}` ? '…' : '✕'}
              </button>
            </div>
          ))}
      </details>

      <div className="smd-footer">
        <button className={`btn btn-sm ${finished ? 'btn-outline' : 'btn-primary'}`}
          disabled={busy !== null} onClick={toggleFinished}>
          {finished ? '↺ Heropen wedstrijd' : '✓ Wedstrijd afsluiten'}
        </button>
        <span className="smd-footer-note">
          {finished
            ? 'Afgesloten — doelpunten tellen mee in het seizoensoverzicht.'
            : 'Sluit af na de match, zodat doelpunten meetellen in het seizoensoverzicht.'}
        </span>
        {!confirmReset && (
          <button type="button" className="btn btn-danger btn-sm smd-reset-btn" disabled={busy !== null}
            onClick={() => setConfirmReset(true)}>⟲ Opnieuw beginnen</button>
        )}
      </div>

      {confirmReset && (
        <div className="smd-reset" role="alertdialog" aria-labelledby="smd-reset-title">
          <strong id="smd-reset-title">Wedstrijd opnieuw beginnen?</strong>
          <p>
            Dit wist <b>alle {goals.length} doelpunt{goals.length === 1 ? '' : 'en'}</b> en de stand van elke periode
            ({match[ownField]}–{match[oppField]} → 0–0), en zet de wedstrijd terug op periode 1 en "niet afgesloten".
            De selectie en het wisselschema blijven behouden. Dit kan niet ongedaan gemaakt worden.
          </p>
          <div className="smd-reset-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmReset(false)}>Annuleren</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={resetMatch}>
              {busy === 'reset' ? 'Bezig…' : 'Ja, alles wissen'}
            </button>
          </div>
        </div>
      )}

      {drag && createPortal(
        <div className={`smd-ghost smd-l-${drag.linie}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <span className="smd-shirt">{numberOf.get(drag.id) ?? initials(nameOf.get(drag.id) ?? '?')}</span>
          <span className="smd-token-name">{nameOf.get(drag.id) ?? '?'}</span>
        </div>,
        document.body,
      )}
    </div>
  );
}
