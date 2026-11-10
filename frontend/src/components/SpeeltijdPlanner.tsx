import { useMemo, useState } from 'react';
import type { Player } from '../lib/api';
import {
  planToText, fmtMin, formationForCategory, formationLabel,
  Linie, ALL_LINIES, FIELD_LINIES, LINIE_SHORT, LINIE_FULL,
} from '../lib/speeltijd';
import {
  PRESETS, PRIORITY_WEIGHTS, PlannerSettings as Settings, toPlanPlayers, buildPlan,
} from '../lib/speeltijdSettings';
import { usePlannerSettings } from '../lib/usePlannerSettings';
import './SpeeltijdPlanner.css';

interface Props {
  matchId: string;
  category?: string;
  title: string;            // gebruikt in de gekopieerde tekst
  players: Player[];        // geselecteerde spelers voor deze wedstrijd
}

export default function SpeeltijdPlanner({ matchId, category, title, players }: Props) {
  // Kleine vertraging: elke toets in een getalveld hoeft geen eigen opslag te zijn.
  const { settings: s, update: mutate, syncError } = usePlannerSettings(matchId, category, 500);
  const [copied, setCopied] = useState(false);

  // Een andere opstelling of blokindeling maakt handmatige aanpassingen zinloos.
  const update = (patch: Partial<Settings>) => mutate(prev => ({
    ...prev, ...patch,
    ...(patch.formation || patch.periods || patch.blocksPerPeriod ? { overrides: {} } : {}),
  }));

  const planPlayers = useMemo(() => toPlanPlayers(players), [players]);

  const absent = new Set(s.absent);
  const priority = new Set(s.priority);
  const present = planPlayers.filter(p => !absent.has(p.id));
  const locked = s.fixed.length;

  const plan = useMemo(() => buildPlan(planPlayers, s), [planPlayers, s]);

  const nameOf = new Map(planPlayers.map(p => [p.id, p.name]));
  const names = (ids: string[]) => ids.map(id => nameOf.get(id) ?? '?').join(', ');
  const multiBlock = s.blocksPerPeriod > 1;
  const blockLabel = (period: number, block: number) => multiBlock ? `P${period}.${block + 1}` : `P${period}`;

  // "V" of "V/M" (hoofd- / tweede positie), "?" zonder positie.
  const posLabel = (p: { linie: Linie | null; linie2?: Linie | null }) =>
    p.linie ? LINIE_SHORT[p.linie] + (p.linie2 ? '/' + LINIE_SHORT[p.linie2] : '') : '?';
  const linieRank = (l: Linie | null) => l ? ALL_LINIES.indexOf(l) : ALL_LINIES.length;
  const firstFree = plan.blocks.find(b => !b.fixed);
  const lockedTitle = 'Zet "al gespeeld" eerst terug op "Nog niet begonnen" om dit te wijzigen';
  const tableRows = [...plan.players].sort((a, b) => linieRank(a.linie) - linieRank(b.linie) || a.name.localeCompare(b.name));
  const absentPlayers = planPlayers.filter(p => absent.has(p.id));

  function setPreset(key: string) {
    if (key === 'categorie' && category) update({ preset: key, formation: formationForCategory(category) });
    else {
      const p = PRESETS.find(x => x.key === key);
      update({ preset: key, ...(p ? { formation: p.formation } : {}) });
    }
  }

  function setCount(l: Linie, value: number) {
    const max = l === 'gk' ? 1 : 11;
    update({ preset: 'eigen', formation: { ...s.formation, [l]: Math.max(0, Math.min(max, value || 0)) } });
  }

  function toggleAbsent(id: string) {
    mutate(prev => ({ ...prev, absent: prev.absent.includes(id) ? prev.absent.filter(x => x !== id) : [...prev.absent, id] }));
  }

  function togglePriority(id: string) {
    mutate(prev => ({ ...prev, priority: prev.priority.includes(id) ? prev.priority.filter(x => x !== id) : [...prev.priority, id] }));
  }

  /** Blokken 1..n vastzetten als gespeeld; wijzigingen gelden daarna enkel voor de rest. */
  function setLocked(n: number) {
    if (n <= locked) update({ fixed: s.fixed.slice(0, n) });
    else update({ fixed: plan.blocks.slice(0, n).map(b => ({ gk: b.gk, lines: b.lines, bench: b.bench })) });
  }

  async function copySchema() {
    try {
      await navigator.clipboard.writeText(planToText(plan, title));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Kopiëren mislukt — je browser staat geen klembordtoegang toe.');
    }
  }

  if (planPlayers.length === 0) {
    return (
      <div className="card">
        <div className="empty-state" style={{ padding: '32px 16px' }}>
          <div className="empty-icon">⏱</div>
          Selecteer eerst spelers in de tab Selectie — het wisselschema wordt gemaakt op basis van de selectie.
        </div>
      </div>
    );
  }

  return (
    <div className="spt">
      {syncError && (
        <div className="spt-warnings">⚠️ Niet gesynchroniseerd — wijzigingen staan voorlopig enkel op dit toestel en worden opnieuw verstuurd zodra het kan.</div>
      )}

      {/* ── Instellingen ── */}
      <div className="card spt-settings">
        <div className="spt-settings-grid">
          <label className="spt-field">
            <span className="input-label">Spelvorm</span>
            <select className="input-field" value={s.preset} onChange={e => setPreset(e.target.value)}>
              {category && <option value="categorie">{category} ({formationLabel(formationForCategory(category))})</option>}
              {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value="eigen">Eigen opstelling ({formationLabel(s.formation)})</option>
            </select>
          </label>
          <div className="spt-field">
            <span className="input-label">Aantal per linie</span>
            <div className="spt-counts">
              {ALL_LINIES.map(l => (
                <label key={l} className="spt-count">
                  <span>{LINIE_SHORT[l]}</span>
                  <input type="number" className="input-field" min={0} max={l === 'gk' ? 1 : 11}
                    value={s.formation[l]} onChange={e => setCount(l, parseInt(e.target.value))} />
                </label>
              ))}
            </div>
          </div>
          <label className="spt-field">
            <span className="input-label">Periodes</span>
            <input type="number" className="input-field" min={1} max={8} value={s.periods}
              disabled={locked > 0} title={locked > 0 ? lockedTitle : undefined}
              onChange={e => update({ periods: Math.max(1, Math.min(8, parseInt(e.target.value) || 1)) })} />
          </label>
          <label className="spt-field">
            <span className="input-label">Min. per periode</span>
            <input type="number" className="input-field" min={1} max={60} value={s.minutesPerPeriod}
              disabled={locked > 0} title={locked > 0 ? lockedTitle : undefined}
              onChange={e => update({ minutesPerPeriod: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) })} />
          </label>
          <label className="spt-field">
            <span className="input-label">Wissels per periode</span>
            <select className="input-field" value={s.blocksPerPeriod}
              disabled={locked > 0} title={locked > 0 ? lockedTitle : undefined}
              onChange={e => update({ blocksPerPeriod: parseInt(e.target.value) })}>
              <option value={1}>Geen (1 blok)</option>
              <option value={2}>Halverwege (2 blokken)</option>
              <option value={3}>Twee keer (3 blokken)</option>
            </select>
          </label>
          <label className="spt-field">
            <span className="input-label">Doelman wisselt</span>
            <select className="input-field" value={s.gkMode} onChange={e => update({ gkMode: e.target.value as Settings['gkMode'] })}>
              <option value="period">Enkel per periode</option>
              <option value="block">Bij elk blok</option>
            </select>
          </label>
          <label className="spt-field">
            <span className="input-label">Voorrang ★-spelers</span>
            <select className="input-field" value={s.priorityWeight}
              onChange={e => update({ priorityWeight: parseFloat(e.target.value) })}>
              {PRIORITY_WEIGHTS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </label>
        </div>

        <div className="spt-presence">
          <span className="input-label">
            {locked > 0
              ? `Aanwezig — afwezig zetten geldt vanaf ${firstFree ? blockLabel(firstFree.period, firstFree.block) : 'het volgende blok'}`
              : 'Aanwezig — klik om afwezig te zetten'}
            {' · '}★ = moet het meeste spelen
          </span>
          <div className="spt-chips">
            {planPlayers.map(p => (
              <span key={p.id}
                className={`spt-chip spt-l-${p.linie ?? 'none'} ${absent.has(p.id) ? 'absent' : ''} ${priority.has(p.id) ? 'prio' : ''}`}>
                <button type="button" className="spt-chip-main" onClick={() => toggleAbsent(p.id)}
                  title={absent.has(p.id) ? 'Afwezig — klik om aanwezig te zetten' : 'Aanwezig — klik om afwezig te zetten'}>
                  <span className="spt-chip-linie">{posLabel(p)}</span>
                  <span className="spt-chip-name">{p.name}</span>
                </button>
                <button type="button" className="spt-chip-star" onClick={() => togglePriority(p.id)}
                  aria-pressed={priority.has(p.id)}
                  title={priority.has(p.id) ? 'Voorrang — klik om uit te zetten' : 'Geef voorrang: moet het meeste spelen'}>
                  {priority.has(p.id) ? '★' : '☆'}
                </button>
              </span>
            ))}
          </div>
          {planPlayers.some(p => !p.linie) && (
            <p className="spt-hint">V/M = hoofd- / tweede positie: is de hoofdpositie bezet, dan speelt de speler op zijn tweede positie. Spelers zonder positie (?) vullen vrije plaatsen in. Stel posities in bij Spelers.</p>
          )}
        </div>

        <div className="spt-lock">
          <label className="spt-field">
            <span className="input-label">Wedstrijd bezig — al gespeeld (vastgezet) t/m</span>
            <select className="input-field" value={locked} onChange={e => setLocked(parseInt(e.target.value))}>
              <option value={0}>Nog niet begonnen</option>
              {plan.blocks.map((b, i) => (
                <option key={i} value={i + 1}>{multiBlock ? `Periode ${b.period}.${b.block + 1}` : `Periode ${b.period}`}</option>
              ))}
            </select>
          </label>
          <p className="spt-hint">
            Zet de gespeelde blokken vast: valt er daarna iemand weg (of komt iemand later), dan wordt enkel de rest van het schema herrekend en blijft de gespeelde tijd meetellen.
          </p>
        </div>
      </div>

      {/* ── Status + acties ── */}
      <div className="spt-status-row">
        <div className="spt-status">
          <span><strong>{present.length}</strong> aanwezig</span>
          <span><strong>{plan.onField}</strong> op het veld</span>
          <span><strong>{fmtMin(plan.matchMinutes)}</strong> wedstrijd</span>
          <span>ideaal <strong>{fmtMin(plan.idealMinutes)}</strong> p.p.</span>
          <span>spreiding <strong>{fmtMin(plan.minMinutes)}–{fmtMin(plan.maxMinutes)}</strong></span>
        </div>
        <div className="spt-actions">
          <button className="btn btn-outline btn-sm" onClick={() => mutate(prev => ({ ...prev, seed: prev.seed + 1 }))}
            title="Ander, maar even eerlijk schema">🔀 Andere verdeling</button>
          <button className="btn btn-primary btn-sm" onClick={copySchema} disabled={present.length === 0}>
            {copied ? '✓ Gekopieerd' : '📋 Kopieer schema'}
          </button>
        </div>
      </div>

      {plan.warnings.length > 0 && (
        <div className="spt-warnings">
          {plan.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      )}

      {present.length > 0 && (<>
        {/* ── Tabel per speler ── */}
        <div className="card spt-table-wrap">
          <table className="data-table spt-table">
            <thead>
              <tr>
                <th>Speler</th>
                {plan.blocks.map(b => (
                  <th key={`${b.period}-${b.block}`} className={`spt-col ${b.block === 0 ? 'spt-period-start' : ''} ${b.fixed ? 'spt-fixed' : ''}`}
                    title={b.fixed ? 'Gespeeld — vastgezet' : undefined}>
                    {b.fixed && '🔒 '}{blockLabel(b.period, b.block)}
                  </th>
                ))}
                <th>Totaal</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(p => (
                <tr key={p.id}>
                  <td className="spt-name">
                    <span className={`spt-tag spt-l-${p.linie ?? 'none'}`}>{posLabel(p)}</span>
                    {p.name}
                    {p.priority && <span className="spt-star" title="Voorrang: moet het meeste spelen">★</span>}
                    {p.central && <span className="spt-star" title="Centrale as: staat op 3, 6 of 9">◆</span>}
                  </td>
                  {p.cells.map((c, i) => (
                    <td key={i} className={`spt-col ${plan.blocks[i].block === 0 ? 'spt-period-start' : ''} ${plan.blocks[i].fixed ? 'spt-fixed' : ''}`}>
                      {c === 'absent' ? <span className="spt-cell-absent" title="Afwezig">afw</span>
                        : c ? <span className={`spt-cell spt-l-${c}`}>{LINIE_SHORT[c]}</span>
                        : <span className="spt-cell-bench">–</span>}
                    </td>
                  ))}
                  <td className="spt-total">
                    <span>{fmtMin(p.minutes)}</span>
                    <span className="spt-bar">
                      <span style={{ width: `${plan.matchMinutes ? (p.minutes / plan.matchMinutes) * 100 : 0}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {absentPlayers.length > 0 && (
            <div className="spt-absent-note">Afwezig: {absentPlayers.map(p => p.name).join(', ')}</div>
          )}
        </div>

        {/* ── Kaart per blok ── */}
        <div className="spt-blocks">
          {plan.blocks.map(b => (
            <div key={`${b.period}-${b.block}`} className={`card spt-block ${b.fixed ? 'spt-block-fixed' : ''}`}>
              <div className="spt-block-head">
                <span className="spt-block-title" title={b.edited ? 'Handmatig aangepast in Match live' : undefined}>{b.fixed && '🔒 '}{b.edited && '✎ '}{multiBlock ? `Periode ${b.period}.${b.block + 1}` : `Periode ${b.period}`}</span>
                <span className="spt-block-time">{fmtMin(b.startMin)}–{fmtMin(b.endMin)}</span>
              </div>
              {b.gk && <div className="spt-block-line"><span className="spt-tag spt-l-gk">DM</span>{names([b.gk])}</div>}
              {FIELD_LINIES.filter(l => b.lines[l].length > 0).map(l => (
                <div key={l} className="spt-block-line" title={LINIE_FULL[l]}>
                  <span className={`spt-tag spt-l-${l}`}>{LINIE_SHORT[l]}</span>{names(b.lines[l])}
                </div>
              ))}
              {b.bench.length > 0 && <div className="spt-block-line spt-block-bench"><span className="spt-tag">Bank</span>{names(b.bench)}</div>}
              {b.in.length > 0 && (
                <div className="spt-block-subs">
                  <div><span className="spt-in">▲ In</span> {names(b.in)}</div>
                  <div><span className="spt-out">▼ Uit</span> {names(b.out)}</div>
                </div>
              )}
              {b === firstFree && (
                <button className="btn btn-outline btn-sm spt-block-lock" onClick={() => setLocked(plan.blocks.indexOf(b) + 1)}
                  title="Dit blok is gespeeld — vastzetten, zodat latere wijzigingen het niet meer veranderen">
                  🔒 Gespeeld — vastzetten
                </button>
              )}
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}
