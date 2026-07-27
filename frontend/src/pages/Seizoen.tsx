import { useEffect, useState } from 'react';
import { useTeam } from '../lib/TeamContext';
import { getSeasonStats, SeasonPlayerStats, formatDuration, POSITION_LABELS, THEME_CATEGORY_LABELS } from '../lib/api';
import './Seizoen.css';

const ROLE_ORDER = ['keeper', 'defender', 'midfielder', 'forward'] as const;
const ROLE_LABELS: Record<string, string> = {
  keeper: 'Doelman', defender: 'Verdediger', midfielder: 'Middenvelder', forward: 'Aanvaller',
};

export default function Seizoen() {
  const [stats, setStats]       = useState<SeasonPlayerStats[]>([]);
  const { teamId }              = useTeam();
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView]         = useState<'players' | 'matrix' | 'grafieken'>('players');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setStats(await getSeasonStats(teamId ?? undefined)); } finally { setLoading(false); }
  }

  // All unique matches across all players (ordered by date)
  const allMatches = (() => {
    const seen = new Map<string, { matchId: string; opponent: string; date: string }>();
    stats.forEach(s => s.matchBreakdown.forEach(m => {
      if (!seen.has(m.matchId)) seen.set(m.matchId, m);
    }));
    return Array.from(seen.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  })();

  const totalMatchSec = stats.reduce((acc, s) => acc + s.totalSeconds, 0);
  const maxSec = stats[0]?.totalSeconds ?? 1;

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }); }
    catch { return ''; }
  }

  if (loading) return <div className="page"><div className="loading-spinner">Seizoen laden...</div></div>;

  return (
    <div className="page">
      <div className="sz-header">
        <div>
          <h1 className="page-title">Seizoensoverzicht</h1>
          <p className="page-subtitle">Speeltijden — alle wedstrijden</p>
        </div>
        <div className="sz-view-toggle">
          <button className={`sb-toggle ${view === 'players' ? 'active' : ''}`} onClick={() => setView('players')}>
            👤 Per speler
          </button>
          <button className={`sb-toggle ${view === 'matrix' ? 'active' : ''}`} onClick={() => setView('matrix')}>
            📊 Matrix
          </button>
          <button className={`sb-toggle ${view === 'grafieken' ? 'active' : ''}`} onClick={() => setView('grafieken')}>
            📈 Grafieken
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="sz-stats">
        {[
          { label: 'Wedstrijden', value: allMatches.length },
          { label: 'Spelers',     value: stats.length },
          { label: 'Doelpunten',  value: stats.reduce((a,s) => a + s.totalGoals, 0) },
          { label: 'Totale tijd', value: formatDuration(totalMatchSec), wide: true },
        ].map(s => (
          <div key={s.label} className={`sz-stat ${s.wide ? 'wide' : ''}`}>
            <span className="sz-stat-val">{s.value}</span>
            <span className="sz-stat-lbl">{s.label}</span>
          </div>
        ))}
      </div>

      {stats.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          Nog geen afgelopen wedstrijden met speeltijddata
        </div>
      ) : view === 'players' ? (

        // ── PER PLAYER VIEW ──────────────────────────────────────────────────
        <div className="sz-player-list">
          {stats.map((s, i) => {
            const isOpen = expanded === s.player.id;
            const pct = (s.totalSeconds / maxSec) * 100;
            return (
              <div key={s.player.id} className="sz-player-card card">
                {/* Header row */}
                <button className="sz-player-header" onClick={() => setExpanded(isOpen ? null : s.player.id)}>
                  <span className="sz-rank">#{i + 1}</span>
                  <span className="sz-pnum">{s.player.number ? `#${s.player.number}` : '—'}</span>
                  <div className="sz-player-name-block">
                    <span className="sz-player-name">{s.player.name}</span>
                    {s.player.position && (
                      <span className={`sz-pos-pill sz-pos-${s.player.position}`}>{POSITION_LABELS[s.player.position]}</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="sz-bar-wrap">
                    <div className="sz-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="sz-total-time">{formatDuration(s.totalSeconds)}</span>
                  <span className="sz-match-count">{s.matchCount} wedstr.</span>
                  {s.totalGoals > 0 && (
                    <span className="sz-goal-badge">{'⚽'.repeat(Math.min(s.totalGoals,5))}{s.totalGoals > 5 ? ` ×${s.totalGoals}` : ''}</span>
                  )}
                  {s.evaluations.length > 0 && (
                    <span className="sz-eval-badge" title="Gemiddelde quotering">
                      🎯 {(s.evaluations.reduce((a, e) => a + e.score, 0) / s.evaluations.length).toFixed(1)}
                    </span>
                  )}
                  <span className="sz-chevron">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Period breakdown */}
                <div className="sz-period-strip">
                  {[1,2,3,4].map(n => (
                    <div key={n} className="sz-period-chip">
                      <span className="sz-period-chip-label">K{n}</span>
                      <span className="sz-period-chip-val">{formatDuration(s.periodBreakdown[n] || 0)}</span>
                    </div>
                  ))}
                </div>

                {/* Expanded: per-match breakdown */}
                {isOpen && (
                  <div className="sz-match-breakdown">
                    <div className="sz-breakdown-title">Speeltijd per wedstrijd</div>
                    {s.matchBreakdown.map(mb => (
                      <div key={mb.matchId} className="sz-match-row">
                        <span className="sz-match-date">{fmtDate(mb.date)}</span>
                        <span className="sz-match-opp">vs. {mb.opponent}</span>
                        <div className="sz-match-periods">
                          {[1,2,3,4].map(n => (
                            <span key={n} className={`sz-match-period ${(mb.periods[n] || 0) > 0 ? 'played' : ''}`}>
                              K{n}: {(mb.periods[n] || 0) > 0 ? formatDuration(mb.periods[n]) : '—'}
                            </span>
                          ))}
                        </div>
                        {mb.goals > 0 && <span className="sz-match-goals">{'⚽'.repeat(Math.min(mb.goals,4))}{mb.goals > 4 ? ` ×${mb.goals}` : ''}</span>}
                        <span className="sz-match-total">{formatDuration(mb.totalSeconds)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expanded: evaluaties per weekthema */}
                {isOpen && s.evaluations.length > 0 && (
                  <div className="sz-eval-breakdown">
                    <div className="sz-breakdown-title">Quoteringen per weekthema</div>
                    {s.evaluations.map((e, idx) => (
                      <div key={`${e.matchId}-${idx}`} className="sz-eval-row">
                        <span className="sz-match-date">{fmtDate(e.date)}</span>
                        <span className={`tag ${e.themeCategory === 'B+' ? 'tag-green' : 'tag-black'}`} style={{ fontSize: 10 }}>
                          {THEME_CATEGORY_LABELS[e.themeCategory] ?? e.themeCategory}
                        </span>
                        <span className="sz-eval-theme-title">{e.themeTitle}</span>
                        <span className="sz-match-opp">vs. {e.opponent}</span>
                        <span className="sz-eval-score-pill">{e.score}/5</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      ) : view === 'matrix' ? (

        // ── MATRIX VIEW ─────────────────────────────────────────────────────
        <div className="sz-matrix-wrap card">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table sz-matrix-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Speler</th>
                  {allMatches.map(m => (
                    <th key={m.matchId} style={{ textAlign: 'center', minWidth: 72 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11, color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>{fmtDate(m.date)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 72 }}>{m.opponent}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'right', minWidth: 80 }}>Totaal</th>
                  <th style={{ textAlign: 'center', minWidth: 52 }}>⚽</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.player.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--red)', width: 30, textAlign: 'right', flexShrink: 0 }}>
                          {s.player.number ? `#${s.player.number}` : '—'}
                        </span>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{s.player.name}</span>
                      </div>
                    </td>
                    {allMatches.map(m => {
                      const mb = s.matchBreakdown.find(b => b.matchId === m.matchId);
                      const sec = mb?.totalSeconds ?? 0;
                      const intensity = sec > 0 ? Math.min(1, sec / (60 * 60)) : 0; // cap at 60min
                      return (
                        <td key={m.matchId} style={{ textAlign: 'center', padding: '8px 6px' }}>
                          <div className="sz-matrix-cell" style={{ '--intensity': intensity } as React.CSSProperties}>
                            {sec > 0 ? (
                              <span className="sz-matrix-time">{formatDuration(sec)}</span>
                            ) : (
                              <span className="sz-matrix-absent">—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--white)' }}>
                        {formatDuration(s.totalSeconds)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {s.totalGoals > 0
                        ? <span className="sz-goal-badge-sm">{'⚽'.repeat(Math.min(s.totalGoals,4))}{s.totalGoals > 4 ? ` ×${s.totalGoals}` : ''}</span>
                        : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      ) : (

        // ── GRAFIEKEN VIEW ──────────────────────────────────────────────────
        <div className="sz-charts">
          <div className="sz-charts-grid">
            <RankedBarChart
              title="Doelpunten per speler"
              icon="⚽"
              emptyMessage="Nog geen doelpunten geregistreerd"
              rows={stats
                .filter(s => s.totalGoals > 0)
                .sort((a, b) => b.totalGoals - a.totalGoals)
                .map(s => ({ id: s.player.id, number: s.player.number, name: s.player.name, value: s.totalGoals }))}
              formatValue={v => String(v)}
            />
            <RankedBarChart
              title="Totale speeltijd per speler"
              icon="⏱"
              emptyMessage="Nog geen speeltijd geregistreerd"
              rows={stats
                .filter(s => s.totalSeconds > 0)
                .map(s => ({ id: s.player.id, number: s.player.number, name: s.player.name, value: s.totalSeconds }))}
              formatValue={formatDuration}
            />
          </div>
          <PositionRoleChart stats={stats} />
        </div>

      )}
    </div>
  );
}

// ── RankedBarChart: enkele-reeks ranglijst (doelpunten / speeltijd) ──────────

interface RankedBarRow { id: string; number: number | null; name: string; value: number }

function RankedBarChart({ title, icon, rows, formatValue, emptyMessage }: {
  title: string; icon: string; rows: RankedBarRow[];
  formatValue: (v: number) => string; emptyMessage: string;
}) {
  const max = rows.length > 0 ? Math.max(...rows.map(r => r.value)) : 1;
  return (
    <div className="card sz-chart-card">
      <div className="sz-breakdown-title">{icon} {title}</div>
      {rows.length === 0 ? (
        <div className="sz-chart-empty">{emptyMessage}</div>
      ) : (
        <div className="sz-chart-rows">
          {rows.map((r, i) => (
            <div key={r.id} className="sz-chart-row">
              <span className="sz-rank">#{i + 1}</span>
              <span className="sz-chart-label" title={r.name}>{r.number ? `#${r.number} ` : ''}{r.name}</span>
              <div className="sz-bar-wrap sz-chart-bar-wrap">
                <div className="sz-bar-fill" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }} />
              </div>
              <span className="sz-chart-value">{formatValue(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PositionRoleChart: gestapelde balk per speler, verdeeld over de 4 rollen ──

function PositionRoleChart({ stats }: { stats: SeasonPlayerStats[] }) {
  // roleBreakdown wordt per wedstrijd al correct vertaald (elke match kan een ander
  // teamformaat/categorie hebben — zie getSeasonStats), dus hier enkel uitlezen.
  const rows = stats
    .map(s => {
      const roleTotals = { keeper: 0, defender: 0, midfielder: 0, forward: 0, ...s.roleBreakdown };
      const total = ROLE_ORDER.reduce((acc, role) => acc + (roleTotals[role] || 0), 0);
      return { player: s.player, roleTotals, total };
    })
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="card sz-chart-card">
      <div className="sz-chart-card-header">
        <div className="sz-breakdown-title" style={{ marginBottom: 0 }}>📍 Speeltijd per positie</div>
        <div className="sz-chart-legend">
          {ROLE_ORDER.map(role => (
            <span key={role} className="sz-chart-legend-item">
              <span className="sz-chart-legend-dot" style={{ background: `var(--chart-role-${role})` }} />
              {ROLE_LABELS[role]}
            </span>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="sz-chart-empty">Geen positiedata beschikbaar — speeltijd zonder toegewezen veldpositie telt hier niet mee.</div>
      ) : (
        <div className="sz-chart-rows">
          {rows.map(r => (
            <div key={r.player.id} className="sz-chart-row sz-chart-row-stacked">
              <span className="sz-chart-label" title={r.player.name}>{r.player.number ? `#${r.player.number} ` : ''}{r.player.name}</span>
              <div className="sz-stack-bar-wrap">
                {ROLE_ORDER.filter(role => r.roleTotals[role] > 0).map(role => {
                  const pct = (r.roleTotals[role] / r.total) * 100;
                  return (
                    <div
                      key={role}
                      className="sz-stack-seg"
                      style={{ width: `${pct}%`, background: `var(--chart-role-${role})` }}
                      title={`${ROLE_LABELS[role]}: ${formatDuration(r.roleTotals[role])} (${pct.toFixed(0)}%)`}
                    >
                      {pct >= 12 && <span className="sz-stack-seg-label">{pct.toFixed(0)}%</span>}
                    </div>
                  );
                })}
              </div>
              <span className="sz-chart-value">{formatDuration(r.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
