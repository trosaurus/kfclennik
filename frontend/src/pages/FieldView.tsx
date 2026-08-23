import { useState } from 'react';
import {
  PlayTimeSession, Attendance, Player,
  getPositionSeconds, updateSessionFieldPosition,
  startPlayTimeSession, stopPlayTimeSession,
  formatDuration,
} from '../lib/api';
import {
  FieldPos, getPositionsForCategory, getFormatForCategory,
  TeamFormat,
} from '../lib/teamConfig';
import './FieldView.css';

// ── SVG field dimensions ──────────────────────────────────────────────────────
const W = 370;
const H = 480;

interface FieldState {
  [posKey: string]: {
    session: PlayTimeSession;
    player: { id: string; name: string; number: number | null };
  } | null;
}

interface Props {
  matchId: string;
  period: number;
  periodStatus: string;
  sessions: PlayTimeSession[];
  attendances: Attendance[];
  allPlayers: Player[];
  tick: number;
  category: string;           // e.g. 'U10', 'U13' — determines format + positions
  onRefresh: () => Promise<void>;
  onSessionStop?: (sessionId: string) => void;   // optimistic UI update callback
  preAssignment?: Record<string, string>;
  onPreAssign?: (posKey: string, playerId: string | null) => void;
  /** Toont het veld puur ter info, zonder klik/sleep-interactie — voor het
   * bekijken van een collega-trainer's voorkeursopstelling in VoorkeurOpstellingModal. */
  readOnly?: boolean;
}

type DragState = { playerId: string; playerName: string; fromPos: string | null } | null;

export default function FieldView({
  matchId, period, periodStatus, sessions, attendances, allPlayers,
  tick, category, onRefresh, onSessionStop, preAssignment, onPreAssign, readOnly,
}: Props) {
  const [dragState, setDragState] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busyPos, setBusyPos] = useState<string | null>(null);
  const [showPlayerPicker, setShowPlayerPicker] = useState<string | null>(null);

  const isLive     = periodStatus === 'playing';
  const isPaused   = periodStatus === 'paused';
  const isEditable = !readOnly && (isLive || isPaused || periodStatus === 'idle');
  const isPreMatch = periodStatus === 'idle' && preAssignment !== undefined;

  // Positions for this team's format
  const positions: FieldPos[] = getPositionsForCategory(category);
  const format: TeamFormat    = getFormatForCategory(category);
  const posKeys = positions.map(p => p.key);

  // ── Build live field state ────────────────────────────────────────────────
  const fieldState: FieldState = {};
  posKeys.forEach(k => { fieldState[k] = null; });
  sessions
    .filter(s => s.period === period && s.active === 'true' && s.fieldPosition && posKeys.includes(s.fieldPosition))
    .forEach(s => {
      const att = attendances.find(a => a.id === s.attendance.id);
      if (att && s.fieldPosition) fieldState[s.fieldPosition] = { session: s, player: att.player };
    });

  function getPreSlot(posKey: string) {
    if (!preAssignment) return null;
    const pid = preAssignment[posKey];
    if (!pid) return null;
    const p = allPlayers.find(pl => pl.id === pid);
    return p ? { player: p } : null;
  }

  // ── Bench = players not on field ─────────────────────────────────────────
  const onFieldIds = new Set<string>();
  if (isPreMatch && preAssignment) {
    Object.values(preAssignment).forEach(id => onFieldIds.add(id));
  } else {
    Object.values(fieldState).forEach(s => s && onFieldIds.add(s.player.id));
  }
  const bench = allPlayers.filter(p => !onFieldIds.has(p.id));

  // ── Assign player to position live ───────────────────────────────────────
  // Rule: a player's timer only runs when he is ON a field position.
  // Moving to bench = stop timer. Moving onto field = start new timer.
  async function assignLive(posKey: string, playerId: string) {
    if (!isEditable || busyPos) return;
    setBusyPos(posKey);
    try {
      // 1. Stop the player currently AT this position (they go to bench)
      const existing = fieldState[posKey];
      if (existing) {
        onSessionStop?.(existing.session.id);  // optimistic: timer stops immediately in UI
        await stopPlayTimeSession(existing.session.id, existing.session.startTime);
      }

      if (!playerId) { await onRefresh(); return; }

      const att = attendances.find(a => a.player.id === playerId);
      if (!att) return;

      // 2. Stop any active session the incoming player has (from another position or resuming)
      //    We always start a fresh session per position slot — no position-update shortcut.
      const existingActive = sessions.find(
        s => s.attendance.id === att.id && s.period === period && s.active === 'true'
      );
      if (existingActive) {
        onSessionStop?.(existingActive.id);  // optimistic stop
        await stopPlayTimeSession(existingActive.id, existingActive.startTime);
      }

      // 3. Start a new session at the new position
      await startPlayTimeSession(att.id, period, posKey);
      await onRefresh();
    } finally { setBusyPos(null); }
  }

  // Remove player from position → goes to bench → timer stops
  async function removeFromPosition(posKey: string) {
    if (!isEditable || busyPos) return;
    const slot = fieldState[posKey];
    if (!slot) return;
    setBusyPos(posKey);
    onSessionStop?.(slot.session.id);  // optimistic: timer stops immediately
    try {
      await stopPlayTimeSession(slot.session.id, slot.session.startTime);
      await onRefresh();
    } finally { setBusyPos(null); }
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function onDragStartBench(player: Player) {
    setDragState({ playerId: player.id, playerName: player.name, fromPos: null });
  }
  function onDragStartField(posKey: string) {
    const slot = isPreMatch ? getPreSlot(posKey) : fieldState[posKey];
    if (!slot) return;
    setDragState({ playerId: slot.player.id, playerName: slot.player.name, fromPos: posKey });
  }
  async function onDropOnPosition(posKey: string) {
    setDropTarget(null);
    if (!dragState) return;
    const { playerId, fromPos } = dragState;
    setDragState(null);
    if (isPreMatch && onPreAssign) {
      if (fromPos) onPreAssign(fromPos, null);
      onPreAssign(posKey, playerId);
    } else {
      // If player was dragged FROM another position, clear that slot first
      // (assignLive will stop the incoming player's existing session anyway,
      //  but the fromPos slot still shows the player until refresh — clear it visually)
      if (fromPos && fromPos !== posKey) {
        // The fromPos slot will become empty; assignLive stops the active session
        // of the incoming player (which was at fromPos) before starting at posKey.
        // Nothing extra needed — assignLive handles it.
      }
      await assignLive(posKey, playerId);
    }
  }
  function onDropOnBench() {
    setDropTarget(null);
    if (!dragState?.fromPos) { setDragState(null); return; }
    const { fromPos } = dragState;
    setDragState(null);
    if (isPreMatch && onPreAssign) onPreAssign(fromPos, null);
    else removeFromPosition(fromPos);
  }

  // ── Live timers ───────────────────────────────────────────────────────────
  function posLiveSeconds(posKey: string): number {
    void tick;
    const slot = fieldState[posKey];
    if (!slot) return 0;
    return getPositionSeconds(sessions, slot.session.attendance.id, posKey, true);
  }

  // ── SVG field lines by format ─────────────────────────────────────────────
  // All formats: our goal at bottom, opponent at top
  function renderFieldLines() {
    const sw = 2;       // stroke width
    const sw2 = 1.5;
    const wh = 'rgba(255,255,255,0.85)';
    const wl = 'rgba(255,255,255,0.65)';
    const wf = 'rgba(255,255,255,0.45)';

    // Common: outer boundary + goals
    const common = <>
      {/* outer */}
      <rect x="14" y="14" width={W-28} height={H-28} fill="none" stroke={wh} strokeWidth={sw} />
      {/* opponent goal (top) */}
      <rect x={W/2-38} y="4" width="76" height="14" fill="none" stroke={wh} strokeWidth={sw} />
      {/* our goal (bottom) */}
      <rect x={W/2-38} y={H-18} width="76" height="14" fill="none" stroke={wh} strokeWidth={sw} />
    </>;

    if (format === '2v2' || format === '3v3') {
      return <>{common}
        {/* center line */}
        <line x1="14" y1={H/2} x2={W-14} y2={H/2} stroke={wl} strokeWidth={sw2} />
        {/* small penalty areas */}
        <rect x={W/2-55} y="14" width="110" height="54" fill="none" stroke={wl} strokeWidth={sw2} />
        <rect x={W/2-55} y={H-68} width="110" height="54" fill="none" stroke={wl} strokeWidth={sw2} />
      </>;
    }

    if (format === '5v5') {
      return <>{common}
        {/* center line */}
        <line x1="14" y1={H/2} x2={W-14} y2={H/2} stroke={wl} strokeWidth={sw2} />
        {/* center circle */}
        <circle cx={W/2} cy={H/2} r="40" fill="none" stroke={wl} strokeWidth={sw2} />
        <circle cx={W/2} cy={H/2} r="3" fill={wl} />
        {/* top penalty area */}
        <rect x={W/2-80} y="14" width="160" height="80" fill="none" stroke={wl} strokeWidth={sw2} />
        <rect x={W/2-45} y="14" width="90" height="35" fill="none" stroke={wf} strokeWidth="1" />
        <circle cx={W/2} cy="62" r="3" fill={wf} />
        {/* bottom penalty area */}
        <rect x={W/2-80} y={H-94} width="160" height="80" fill="none" stroke={wl} strokeWidth={sw2} />
        <rect x={W/2-45} y={H-49} width="90" height="35" fill="none" stroke={wf} strokeWidth="1" />
        <circle cx={W/2} cy={H-62} r="3" fill={wf} />
      </>;
    }

    if (format === '8v8') {
      return <>{common}
        {/* center line */}
        <line x1="14" y1={H/2} x2={W-14} y2={H/2} stroke={wl} strokeWidth={sw2} />
        {/* center circle */}
        <circle cx={W/2} cy={H/2} r="46" fill="none" stroke={wl} strokeWidth={sw2} />
        <circle cx={W/2} cy={H/2} r="3" fill={wl} />
        {/* top penalty area */}
        <rect x={W/2-95} y="14" width="190" height="90" fill="none" stroke={wl} strokeWidth={sw2} />
        <rect x={W/2-55} y="14" width="110" height="40" fill="none" stroke={wf} strokeWidth="1" />
        <circle cx={W/2} cy="70" r="3" fill={wf} />
        {/* bottom penalty area */}
        <rect x={W/2-95} y={H-104} width="190" height="90" fill="none" stroke={wl} strokeWidth={sw2} />
        <rect x={W/2-55} y={H-54} width="110" height="40" fill="none" stroke={wf} strokeWidth="1" />
        <circle cx={W/2} cy={H-70} r="3" fill={wf} />
      </>;
    }

    // 11v11 — full-size markings
    return <>{common}
      {/* center line */}
      <line x1="14" y1={H/2} x2={W-14} y2={H/2} stroke={wl} strokeWidth={sw2} />
      {/* center circle */}
      <circle cx={W/2} cy={H/2} r="52" fill="none" stroke={wl} strokeWidth={sw2} />
      <circle cx={W/2} cy={H/2} r="3" fill={wl} />
      {/* top penalty area */}
      <rect x={W/2-110} y="14" width="220" height="100" fill="none" stroke={wl} strokeWidth={sw2} />
      <rect x={W/2-60} y="14" width="120" height="45" fill="none" stroke={wf} strokeWidth="1" />
      <circle cx={W/2} cy="76" r="3" fill={wf} />
      {/* top penalty arc */}
      <path d={`M ${W/2-46} 114 A 52 52 0 0 1 ${W/2+46} 114`} fill="none" stroke={wl} strokeWidth={sw2} />
      {/* bottom penalty area */}
      <rect x={W/2-110} y={H-114} width="220" height="100" fill="none" stroke={wl} strokeWidth={sw2} />
      <rect x={W/2-60} y={H-59} width="120" height="45" fill="none" stroke={wf} strokeWidth="1" />
      <circle cx={W/2} cy={H-76} r="3" fill={wf} />
      {/* bottom penalty arc */}
      <path d={`M ${W/2-46} ${H-114} A 52 52 0 0 0 ${W/2+46} ${H-114}`} fill="none" stroke={wl} strokeWidth={sw2} />
    </>;
  }

  // ── Render position slot ──────────────────────────────────────────────────
  function renderSlot(pos: FieldPos) {
    const cx = (pos.x / 100) * W;
    const cy = (pos.y / 100) * H;
    const posKey = pos.key;
    const slot = isPreMatch ? getPreSlot(posKey) : fieldState[posKey];
    const player = slot?.player ?? null;
    const isOccupied = !!player;
    const isDragTarget = dropTarget === posKey;
    const isBusy = busyPos === posKey;
    const liveSec = isOccupied && isLive ? posLiveSeconds(posKey) : 0;

    const roleColor: Record<string, string> = {
      keeper:     'rgba(20,20,20,0.92)',
      defender:   'rgba(30,90,200,0.9)',
      midfielder: 'rgba(180,20,20,0.92)',
      forward:    'rgba(180,20,20,0.92)',
    };
    const emptyColor = isDragTarget ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.38)';
    const discFill = isOccupied
      ? (isBusy ? 'rgba(100,100,100,0.8)' : roleColor[pos.role])
      : emptyColor;
    const radius = isOccupied ? 26 : 20;

    return (
      <g key={posKey}
        style={{ cursor: isEditable ? 'pointer' : 'default' }}
        onDragOver={e => { e.preventDefault(); setDropTarget(posKey); }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={e => { e.preventDefault(); onDropOnPosition(posKey); }}
        onDragStart={isOccupied && isEditable ? () => onDragStartField(posKey) : undefined}
        onClick={() => {
          if (!isEditable) return;
          if (isOccupied) {
            if (isPreMatch && onPreAssign) onPreAssign(posKey, null);
            else if (!isLive && !isPaused) {/* nothing */}
          } else {
            setShowPlayerPicker(posKey);
          }
        }}
      >
        {/* Drop highlight ring */}
        {isDragTarget && <circle cx={cx} cy={cy} r={radius + 8} fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />}

        {/* Shirt shape — oval + collar */}
        {isOccupied ? (
          <ShirtSVG cx={cx} cy={cy} fill={discFill} role={pos.role} />
        ) : (
          <circle cx={cx} cy={cy} r={radius}
            fill="rgba(0,0,0,0.25)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {/* Position key label on empty slot */}
        {!isOccupied && (
          <text x={cx} y={cy + 5} textAnchor="middle"
            fill="rgba(255,255,255,0.75)" fontSize="14" fontFamily="var(--font-display)" letterSpacing="0.5">
            {posKey}
          </text>
        )}

        {/* Player number */}
        {isOccupied && player && (
          <>
            <text x={cx} y={cy - 6} textAnchor="middle"
              fill="white" fontSize="15" fontFamily="var(--font-display)"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              {player.number !== null ? player.number : posKey}
            </text>
            <text x={cx} y={cy + 9} textAnchor="middle"
              fill="rgba(255,255,255,0.95)" fontSize="8" fontFamily="var(--font-heading)" fontWeight="700">
              {player.name.length > 10 ? player.name.split(' ').slice(-1)[0].substring(0, 9).toUpperCase() : player.name.toUpperCase()}
            </text>
            {liveSec > 0 && (
              <text x={cx} y={cy + 21} textAnchor="middle"
                fill="rgba(255,220,0,0.95)" fontSize="8" fontFamily="var(--font-display)">
                {formatDuration(liveSec)}
              </text>
            )}
          </>
        )}

        {/* "klik" hint on empty editable slot */}
        {!isOccupied && isEditable && (
          <text x={cx} y={cy + 35} textAnchor="middle"
            fill="rgba(255,255,255,0.35)" fontSize="8" fontFamily="var(--font-heading)">
            klik / sleep
          </text>
        )}
      </g>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fv-wrap">
      <div className="fv-layout">

        {/* SVG field */}
        <div className="fv-field-container"
          onDragOver={e => e.preventDefault()}
          onDrop={e => e.preventDefault()}
        >
          <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" className="fv-field-svg">

            {/* Grass background */}
            <rect x="0" y="0" width={W} height={H} fill="#3a8a3a" rx="4" />

            {/* Alternating grass stripes */}
            {[0,1,2,3,4,5,6].map(i => (
              <rect key={i} x={i*(W/6)} y="0" width={W/6} height={H}
                fill={i%2===0 ? "rgba(0,0,0,0.07)" : "transparent"} />
            ))}

            {/* Field lines per format */}
            {renderFieldLines()}

            {/* Position slots */}
            {positions.map(pos => renderSlot(pos))}
          </svg>
        </div>

        {/* Bench */}
        <div className="fv-bench"
          onDragOver={e => { e.preventDefault(); setDropTarget('bench'); }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={e => { e.preventDefault(); onDropOnBench(); }}
        >
          <div className="fv-bench-title">
            {readOnly ? 'Niet opgesteld' : isPreMatch ? 'Sleep naar veld' : 'Bank'}
            <span className="fv-bench-count">{bench.length}</span>
          </div>
          <div className="fv-format-badge">{format.toUpperCase()}</div>

          {bench.length === 0 ? (
            <div className="fv-bench-empty">✓ Iedereen op het veld</div>
          ) : bench.map(p => {
            const isDragging = dragState?.playerId === p.id;
            const att = attendances.find(a => a.player.id === p.id);
            const totalSec = att
              ? sessions.filter(s => s.attendance.id === att.id).reduce((acc, s) => acc + (s.durationSeconds || 0), 0)
              : 0;
            return (
              <div key={p.id}
                className={`fv-bench-player ${isDragging ? 'dragging' : ''}`}
                draggable={isEditable}
                onDragStart={() => onDragStartBench(p)}
                onDragEnd={() => setDragState(null)}
                onClick={() => {
                  if (!isEditable || showPlayerPicker) return;
                  const emptyPos = positions.find(pos => {
                    if (isPreMatch) return !preAssignment?.[pos.key];
                    return !fieldState[pos.key];
                  });
                  if (emptyPos) {
                    if (isPreMatch && onPreAssign) onPreAssign(emptyPos.key, p.id);
                    else assignLive(emptyPos.key, p.id);
                  }
                }}
              >
                <span className="fv-bench-num">{p.number ? `#${p.number}` : '—'}</span>
                <span className="fv-bench-name">{p.name}</span>
                {!isPreMatch && totalSec > 0 && <span className="fv-bench-time">{formatDuration(totalSec)}</span>}
                <span className="fv-bench-drag-hint">⠿</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Player picker modal */}
      {showPlayerPicker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPlayerPicker(null)}>
          <div className="modal">
            <div className="modal-title">
              Positie {showPlayerPicker}
              <span style={{ color: 'var(--red)', marginLeft: 8, fontSize: 16 }}>
                ({positions.find(p => p.key === showPlayerPicker)?.role})
              </span>
            </div>
            <div className="sub-player-list">
              {bench.map(p => (
                <button key={p.id} className="sub-player-btn"
                  onClick={() => {
                    const pk = showPlayerPicker!;
                    setShowPlayerPicker(null);
                    if (isPreMatch && onPreAssign) onPreAssign(pk, p.id);
                    else assignLive(pk, p.id);
                  }}>
                  <span className="sub-num">{p.number ? `#${p.number}` : '—'}</span>
                  <span className="sub-name">{p.name}</span>
                </button>
              ))}
              {bench.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                  Geen spelers beschikbaar
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowPlayerPicker(null)}>Annuleer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shirt SVG shape ───────────────────────────────────────────────────────────
function ShirtSVG({ cx, cy, fill, role }: { cx: number; cy: number; fill: string; role: string }) {
  const isKeeper = role === 'keeper';
  const bodyFill = fill;
  const stripeFill = isKeeper ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.2)';
  return (
    <g transform={`translate(${cx},${cy})`}>
      <path
        d="M -16 -14 L -22 -20 L -26 -10 L -20 -8 L -20 16 L 20 16 L 20 -8 L 26 -10 L 22 -20 L 16 -14 C 14 -18 -14 -18 -16 -14 Z"
        fill={bodyFill}
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.2"
      />
      <rect x="-4" y="-14" width="8" height="30" fill={stripeFill} />
      <ellipse cx="0" cy="-14" rx="5" ry="3" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
    </g>
  );
}

// ── PositionTimeStats (exported for parent use) ───────────────────────────────
export function PositionTimeStats({ sessions, attendances, allPlayers, tick, category }: {
  sessions: PlayTimeSession[];
  attendances: Attendance[];
  allPlayers: Player[];
  tick: number;
  category: string;
}) {
  void tick;
  const positions = getPositionsForCategory(category);
  const posKeys = positions.map(p => p.key);

  const rows = allPlayers.map(player => {
    const att = attendances.find(a => a.player.id === player.id);
    if (!att) return null;
    const posTimes: Record<string, number> = {};
    let hasAny = false;
    for (const k of posKeys) {
      const sec = getPositionSeconds(sessions, att.id, k, true);
      posTimes[k] = sec;
      if (sec > 0) hasAny = true;
    }
    if (!hasAny) return null;
    return { player, posTimes };
  }).filter(Boolean) as Array<{ player: Player; posTimes: Record<string, number> }>;

  if (rows.length === 0) return null;

  return (
    <div className="fv-pos-stats">
      <div className="fv-pos-stats-title">Speeltijd per positie</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Speler</th>
              {posKeys.map(k => <th key={k} style={{ textAlign: 'center' }}>{k}</th>)}
              <th style={{ textAlign: 'right' }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, posTimes }) => {
              const total = Object.values(posTimes).reduce((a, b) => a + b, 0);
              return (
                <tr key={player.id}>
                  <td>
                    <span style={{ color: 'var(--red)', fontFamily: 'var(--font-display)', fontSize: 14, marginRight: 6 }}>
                      {player.number ? `#${player.number}` : '—'}
                    </span>
                    <span style={{ fontWeight: 500 }}>{player.name}</span>
                  </td>
                  {posKeys.map(k => (
                    <td key={k} style={{ textAlign: 'center' }}>
                      {posTimes[k] > 0
                        ? <span className="fv-pos-time-cell">{formatDuration(posTimes[k])}</span>
                        : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                      }
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--white)' }}>
                    {formatDuration(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
