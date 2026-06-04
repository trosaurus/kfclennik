import { useState, useCallback } from 'react';
import {
  PlayTimeSession, Attendance, Player,
  FIELD_POSITIONS, FIELD_POSITION_KEYS, FieldPositionKey,
  buildFieldState, getPositionSeconds, updateSessionFieldPosition,
  startPlayTimeSession, stopPlayTimeSession,
  formatDuration,
} from '../lib/api';
import './FieldView.css';

interface Props {
  matchId: string;
  period: number;
  periodStatus: string;          // 'playing' | 'paused' | 'idle' | 'finished'
  sessions: PlayTimeSession[];
  attendances: Attendance[];
  allPlayers: Player[];
  tick: number;                  // increment to force live timer re-render
  onRefresh: () => Promise<void>;
  // Pre-match assignment mode
  preAssignment?: Record<string, string>;  // posKey → playerId
  onPreAssign?: (posKey: string, playerId: string | null) => void;
}

type DragState = { playerId: string; playerName: string; fromPos: string | null } | null;

export default function FieldView({
  matchId, period, periodStatus, sessions, attendances, allPlayers,
  tick, onRefresh, preAssignment, onPreAssign,
}: Props) {
  const [dragState, setDragState] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busyPos, setBusyPos] = useState<string | null>(null);
  const [showPlayerPicker, setShowPlayerPicker] = useState<string | null>(null); // posKey

  const isLive     = periodStatus === 'playing';
  const isPaused   = periodStatus === 'paused';
  const isEditable = isLive || isPaused || periodStatus === 'idle';
  const isPreMatch = periodStatus === 'idle' && !!onPreAssign;

  // ── Build field state from live sessions ─────────────────────────────────
  const fieldState = buildFieldState(
    sessions,
    attendances.map(a => ({ id: a.id, player: a.player })),
    period
  );

  // In pre-match mode use preAssignment to show player names
  function getPreSlot(posKey: string): { player: Player } | null {
    if (!preAssignment) return null;
    const pid = preAssignment[posKey];
    if (!pid) return null;
    const p = allPlayers.find(pl => pl.id === pid);
    return p ? { player: p } : null;
  }

  // ── Players not yet on field (for bench / drag source) ────────────────────
  const onFieldIds = new Set<string>();
  if (isPreMatch && preAssignment) {
    Object.values(preAssignment).forEach(id => onFieldIds.add(id));
  } else {
    Object.values(fieldState).forEach(s => s && onFieldIds.add(s.player.id));
  }
  const bench = allPlayers.filter(p => !onFieldIds.has(p.id));

  // ── Assign player to position (live) ─────────────────────────────────────
  async function assignLive(posKey: string, playerId: string) {
    if (!isEditable || busyPos) return;
    setBusyPos(posKey);
    try {
      // Stop existing session at this position
      const existing = fieldState[posKey];
      if (existing) {
        await stopPlayTimeSession(existing.session.id, existing.session.startTime);
      }
      if (!playerId) { await onRefresh(); return; }

      // Find or get attendance
      const att = attendances.find(a => a.player.id === playerId);
      if (!att) return;

      // Stop any active session this player has in this period (different position)
      const activeSession = sessions.find(s =>
        s.attendance.id === att.id && s.period === period && s.active === 'true'
      );
      if (activeSession) {
        // Update position on existing session instead of creating new one
        await updateSessionFieldPosition(activeSession.id, posKey);
      } else if (isLive) {
        await startPlayTimeSession(att.id, period, posKey);
      } else {
        // Paused: just start session with position (will be active but match is paused — that's fine for tracking)
        await startPlayTimeSession(att.id, period, posKey);
      }
      await onRefresh();
    } finally { setBusyPos(null); }
  }

  // ── Remove player from position ───────────────────────────────────────────
  async function removeFromPosition(posKey: string) {
    if (!isEditable || busyPos) return;
    const slot = fieldState[posKey];
    if (!slot) return;
    setBusyPos(posKey);
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
    const player = isPreMatch ? (slot as { player: Player }).player : (slot as ReturnType<typeof buildFieldState>[string])!.player;
    setDragState({ playerId: player.id, playerName: player.name, fromPos: posKey });
  }

  async function onDropOnPosition(posKey: string) {
    setDropTarget(null);
    if (!dragState) return;
    const { playerId, fromPos } = dragState;
    setDragState(null);

    if (isPreMatch && onPreAssign) {
      if (fromPos) onPreAssign(fromPos, null);  // remove from old
      onPreAssign(posKey, playerId);
    } else {
      await assignLive(posKey, playerId);
    }
  }

  function onDropOnBench() {
    setDropTarget(null);
    if (!dragState?.fromPos) { setDragState(null); return; }
    const { fromPos } = dragState;
    setDragState(null);
    if (isPreMatch && onPreAssign) {
      onPreAssign(fromPos, null);
    } else {
      removeFromPosition(fromPos);
    }
  }

  // ── Live timer for a position ─────────────────────────────────────────────
  function posLiveSeconds(posKey: string): number {
    void tick;
    const slot = fieldState[posKey];
    if (!slot) return 0;
    return getPositionSeconds(sessions, slot.session.attendance.id, posKey, true);
  }

  // ── Total position time for a player across all periods ───────────────────
  function playerPosTotal(playerId: string, posKey: string): number {
    const att = attendances.find(a => a.player.id === playerId);
    if (!att) return 0;
    return getPositionSeconds(sessions, att.id, posKey, false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fv-wrap">
      <div className="fv-layout">

        {/* ── SVG FIELD ── */}
        <div className="fv-field-container"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); }}
        >
          <svg
            viewBox="0 0 370 440"
            xmlns="http://www.w3.org/2000/svg"
            className="fv-field-svg"
          >
            {/* Field background */}
            <rect x="0" y="0" width="370" height="440" fill="#2d7a2d" rx="4" />

            {/* Alternating grass stripes */}
            {[0,1,2,3,4,5].map(i => (
              <rect key={i} x={i*62} y="0" width="62" height="440"
                fill={i%2===0 ? "rgba(0,0,0,0.06)" : "transparent"} />
            ))}

            {/* Field lines */}
            {/* Outer boundary */}
            <rect x="12" y="12" width="346" height="416" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
            {/* Center line */}
            <line x1="12" y1="220" x2="358" y2="220" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
            {/* Center circle */}
            <circle cx="185" cy="220" r="42" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
            <circle cx="185" cy="220" r="3" fill="rgba(255,255,255,0.8)" />
            {/* Top penalty area */}
            <rect x="72" y="12" width="226" height="72" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
            {/* Top goal area */}
            <rect x="120" y="12" width="130" height="30" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
            {/* Top goal */}
            <rect x="147" y="5" width="76" height="12" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
            {/* Bottom penalty area */}
            <rect x="72" y="356" width="226" height="72" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
            {/* Bottom goal area */}
            <rect x="120" y="398" width="130" height="30" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
            {/* Bottom goal */}
            <rect x="147" y="423" width="76" height="12" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
            {/* Penalty spots */}
            <circle cx="185" cy="52" r="3" fill="rgba(255,255,255,0.7)" />
            <circle cx="185" cy="388" r="3" fill="rgba(255,255,255,0.7)" />

            {/* ── Position slots ── */}
            {FIELD_POSITION_KEYS.map(posKey => {
              const pos = FIELD_POSITIONS[posKey];
              const cx = (pos.x / 100) * 370;
              const cy = (pos.y / 100) * 440;
              const slot = isPreMatch ? getPreSlot(posKey) : fieldState[posKey];
              const player = slot ? (isPreMatch ? (slot as { player: Player }).player : (slot as any).player) : null;
              const isOccupied = !!player;
              const isDragTarget = dropTarget === posKey;
              const isBusy = busyPos === posKey;
              const liveSec = isOccupied && isLive ? posLiveSeconds(posKey) : 0;

              return (
                <g key={posKey}
                  style={{ cursor: isEditable ? 'pointer' : 'default' }}
                  onDragOver={e => { e.preventDefault(); setDropTarget(posKey); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => { e.preventDefault(); onDropOnPosition(posKey); }}
                  onDragStart={isOccupied && isEditable ? () => onDragStartField(posKey) : undefined}
                  onClick={() => {
                    if (!isEditable) return;
                    if (isOccupied && !isLive && !isPaused) {
                      if (isPreMatch && onPreAssign) onPreAssign(posKey, null);
                    } else if (!isOccupied) {
                      setShowPlayerPicker(posKey);
                    }
                  }}
                >
                  {/* Drop zone highlight */}
                  {isDragTarget && (
                    <circle cx={cx} cy={cy} r="30" fill="rgba(255,255,255,0.15)" />
                  )}

                  {/* Position disc */}
                  <circle
                    cx={cx} cy={cy} r={isOccupied ? 24 : 18}
                    fill={isOccupied
                      ? (isBusy ? 'rgba(100,100,100,0.8)' : (isDragTarget ? 'rgba(255,255,255,0.3)' : 'rgba(180,20,20,0.92)'))
                      : (isDragTarget ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)')}
                    stroke={isOccupied ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'}
                    strokeWidth={isOccupied ? 2 : 1.5}
                    
                    onDragStart={() => onDragStartField(posKey)}
                  />

                  {/* Position label (shirt number) */}
                  {!isOccupied && (
                    <text x={cx} y={cy + 5} textAnchor="middle"
                      fill="rgba(255,255,255,0.7)" fontSize="13" fontFamily="'Bebas Neue',sans-serif" letterSpacing="0.5">
                      {posKey}
                    </text>
                  )}

                  {/* Player shirt number */}
                  {isOccupied && player && (
                    <>
                      <text x={cx} y={cy - 5} textAnchor="middle"
                        fill="white" fontSize="14" fontFamily="'Bebas Neue',sans-serif" fontWeight="bold">
                        {player.number ?? posKey}
                      </text>
                      {/* Player name (clipped) */}
                      <text x={cx} y={cy + 8} textAnchor="middle"
                        fill="rgba(255,255,255,0.92)" fontSize="8.5" fontFamily="'Barlow Condensed',sans-serif" fontWeight="700"
                        style={{ letterSpacing: '0.2px' }}>
                        {player.name.split(' ').slice(-1)[0].substring(0, 9)}
                      </text>
                      {/* Live timer */}
                      {liveSec > 0 && (
                        <text x={cx} y={cy + 20} textAnchor="middle"
                          fill="rgba(255,220,0,0.9)" fontSize="8" fontFamily="'Bebas Neue',sans-serif">
                          {formatDuration(liveSec)}
                        </text>
                      )}
                    </>
                  )}

                  {/* Empty slot + icon */}
                  {!isOccupied && isEditable && (
                    <text x={cx} y={cy + 32} textAnchor="middle"
                      fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="'Barlow Condensed',sans-serif" fontWeight="600">
                      klik/sleep
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* ── BENCH / PLAYER LIST ── */}
        <div className="fv-bench"
          onDragOver={e => { e.preventDefault(); setDropTarget('bench'); }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={e => { e.preventDefault(); onDropOnBench(); }}
        >
          <div className="fv-bench-title">
            {isPreMatch ? 'Spelers — sleep naar veld' : 'Wisselbank'}
            <span className="fv-bench-count">{bench.length}</span>
          </div>

          {bench.length === 0 ? (
            <div className="fv-bench-empty">Alle spelers staan op het veld</div>
          ) : (
            bench.map(p => {
              const isDragging = dragState?.playerId === p.id;
              return (
                <div
                  key={p.id}
                  className={`fv-bench-player ${isDragging ? 'dragging' : ''}`}
                  draggable={isEditable}
                  onDragStart={() => onDragStartBench(p)}
                  onDragEnd={() => setDragState(null)}
                  onClick={() => {
                    if (!isEditable || showPlayerPicker) return;
                    // Auto-assign to first empty position
                    const emptyPos = FIELD_POSITION_KEYS.find(k => {
                      if (isPreMatch) return !preAssignment?.[k];
                      return !fieldState[k];
                    });
                    if (emptyPos) {
                      if (isPreMatch && onPreAssign) onPreAssign(emptyPos, p.id);
                      else assignLive(emptyPos, p.id);
                    }
                  }}
                >
                  <span className="fv-bench-num">{p.number ? `#${p.number}` : '—'}</span>
                  <span className="fv-bench-name">{p.name}</span>
                  {!isPreMatch && (() => {
                    const att = attendances.find(a => a.player.id === p.id);
                    const totalSec = att
                      ? sessions.filter(s => s.attendance.id === att.id)
                          .reduce((acc, s) => acc + (s.durationSeconds || 0), 0)
                      : 0;
                    return totalSec > 0
                      ? <span className="fv-bench-time">{formatDuration(totalSec)}</span>
                      : null;
                  })()}
                  <span className="fv-bench-drag-hint">⠿</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Position time stats moved outside — rendered by parent */}

      {/* ── Player picker modal ── */}
      {showPlayerPicker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPlayerPicker(null)}>
          <div className="modal">
            <div className="modal-title">Positie {showPlayerPicker}</div>
            <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-heading)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              {FIELD_POSITIONS[showPlayerPicker]?.role} — kies speler
            </p>
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
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Geen spelers beschikbaar</div>
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

// ── PositionTimeStats (exported so parent can place it anywhere) ───────────────

export function PositionTimeStats({ sessions, attendances, allPlayers, tick }: {
  sessions: PlayTimeSession[];
  attendances: Attendance[];
  allPlayers: Player[];
  tick: number;
}) {
  void tick;

  // Build: player × position → total seconds
  const rows = allPlayers
    .map(player => {
      const att = attendances.find(a => a.player.id === player.id);
      if (!att) return null;
      const posTimes: Record<string, number> = {};
      let hasAny = false;
      for (const posKey of FIELD_POSITION_KEYS) {
        const sec = getPositionSeconds(sessions, att.id, posKey, true);
        posTimes[posKey] = sec;
        if (sec > 0) hasAny = true;
      }
      if (!hasAny) return null;
      return { player, posTimes };
    })
    .filter(Boolean) as Array<{ player: Player; posTimes: Record<string, number> }>;

  if (rows.length === 0) return null;

  return (
    <div className="fv-pos-stats">
      <div className="fv-pos-stats-title">Speeltijd per positie</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Speler</th>
              {FIELD_POSITION_KEYS.map(k => <th key={k} style={{ textAlign: 'center' }}>{k}</th>)}
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
                  {FIELD_POSITION_KEYS.map(k => (
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
