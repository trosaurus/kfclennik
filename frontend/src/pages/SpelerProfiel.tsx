import { useEffect, useMemo, useState } from 'react';
import { useTeam } from '../lib/TeamContext';
import { getSeasonStats, SeasonPlayerStats, formatDuration, POSITION_FULL, THEME_CATEGORY_LABELS } from '../lib/api';
import { getPositionsForCategory } from '../lib/teamConfig';
import './SpelerProfiel.css';

const ROLE_LABELS: Record<string, string> = {
  keeper: 'Doelman', defender: 'Verdediger', midfielder: 'Middenvelder', forward: 'Aanvaller',
};

export default function SpelerProfiel() {
  const [stats, setStats]           = useState<SeasonPlayerStats[]>([]);
  const [loading, setLoading]       = useState(true);
  const [playerId, setPlayerId]     = useState<string>('');
  const { teamId, category } = useTeam();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getSeasonStats(teamId ?? undefined);
      setStats(data);
      if (data.length > 0) setPlayerId(prev => (prev && data.some(s => s.player.id === prev)) ? prev : data[0].player.id);
    } finally { setLoading(false); }
  }

  const sortedPlayers = useMemo(
    () => [...stats].sort((a, b) => a.player.name.localeCompare(b.player.name)),
    [stats]
  );

  const s = stats.find(x => x.player.id === playerId) ?? null;

  const posDefs = getPositionsForCategory(category ?? '');
  const posRole = useMemo(() => {
    const map: Record<string, string> = {};
    posDefs.forEach(p => { map[p.key] = p.role; });
    return map;
  }, [posDefs]);

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }); }
    catch { return ''; }
  }

  const positionEntries = s
    ? Object.entries(s.positionBreakdown).sort((a, b) => b[1] - a[1])
    : [];
  const positionTotal = positionEntries.reduce((acc, [, sec]) => acc + sec, 0);

  // roleBreakdown komt uit getSeasonStats, waar elke wedstrijd al vertaald is via haar
  // eigen team-formaat (posRole hierboven gebruikt enkel de huidige ploeg-categorie en
  // klopt dus niet als iemand ooit in een ander formaat speelde — roleBreakdown wel).
  const roleTotals = useMemo(() => {
    if (!s) return [];
    return Object.entries(s.roleBreakdown).sort((a, b) => b[1] - a[1]);
  }, [s]);

  const avgScore = s && s.evaluations.length > 0
    ? s.evaluations.reduce((a, e) => a + e.score, 0) / s.evaluations.length
    : null;

  const themeGroups = useMemo(() => {
    if (!s) return [];
    const groups = new Map<string, { category: string; scores: number[] }>();
    s.evaluations.forEach(e => {
      const g = groups.get(e.themeTitle) ?? { category: e.themeCategory, scores: [] };
      g.scores.push(e.score);
      groups.set(e.themeTitle, g);
    });
    return Array.from(groups.entries()).map(([title, g]) => ({
      title, category: g.category,
      avg: g.scores.reduce((a, b) => a + b, 0) / g.scores.length,
      count: g.scores.length,
    }));
  }, [s]);

  if (loading) return <div className="loading-spinner">Spelerprofiel laden...</div>;

  return (
    <div className="sp-embedded">
      {sortedPlayers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👤</div>
          Nog geen speler-data beschikbaar
        </div>
      ) : (
        <>
          <div className="sp-select-wrap">
            <label className="input-label" htmlFor="sp-player-select">Speler</label>
            <select
              id="sp-player-select"
              className="input-field sp-select"
              value={playerId}
              onChange={e => setPlayerId(e.target.value)}
            >
              {sortedPlayers.map(p => (
                <option key={p.player.id} value={p.player.id}>
                  {p.player.number ? `#${p.player.number} — ` : ''}{p.player.name}
                </option>
              ))}
            </select>
          </div>

          {!s ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              Geen data voor deze speler
            </div>
          ) : (
            <>
              {/* ── Player header ── */}
              <div className="sp-player-card card card-red-top">
                <div className="sp-player-top">
                  <span className="sp-pnum">{s.player.number ? `#${s.player.number}` : '—'}</span>
                  <div>
                    <div className="sp-name">{s.player.name}</div>
                    {s.player.position && (
                      <span className={`sz-pos-pill sz-pos-${s.player.position}`}>{POSITION_FULL[s.player.position]}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Stats strip ── */}
              <div className="sz-stats">
                {[
                  { label: 'Speeltijd',    value: formatDuration(s.totalSeconds), wide: true },
                  { label: 'Wedstrijden',  value: s.matchCount },
                  { label: 'Doelpunten',   value: s.totalGoals },
                  { label: 'Gem. score',   value: avgScore !== null ? avgScore.toFixed(1) : '—' },
                ].map(st => (
                  <div key={st.label} className={`sz-stat ${st.wide ? 'wide' : ''}`}>
                    <span className="sz-stat-val">{st.value}</span>
                    <span className="sz-stat-lbl">{st.label}</span>
                  </div>
                ))}
              </div>

              <div className="sp-grid">
                {/* ── Period breakdown ── */}
                <div className="card sp-block">
                  <div className="sz-breakdown-title">Speeltijd per periode</div>
                  <div className="sz-period-strip">
                    {[1,2,3,4].map(n => (
                      <div key={n} className="sz-period-chip">
                        <span className="sz-period-chip-label">K{n}</span>
                        <span className="sz-period-chip-val">{formatDuration(s.periodBreakdown[n] || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Position breakdown ── */}
                <div className="card sp-block">
                  <div className="sz-breakdown-title">Percentage per plaats</div>
                  {positionEntries.length === 0 ? (
                    <div className="sp-empty-sm">Geen plaatsdata beschikbaar</div>
                  ) : (
                    <div className="sp-pos-list">
                      {positionEntries.map(([key, sec]) => {
                        const pct = positionTotal > 0 ? (sec / positionTotal) * 100 : 0;
                        return (
                          <div key={key} className="sp-pos-row">
                            <span className="sp-pos-key">{key}</span>
                            <span className="sp-pos-role">{ROLE_LABELS[posRole[key]] ?? ''}</span>
                            <div className="sz-bar-wrap sp-pos-bar">
                              <div className="sz-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="sp-pos-pct">{pct.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {roleTotals.length > 0 && (
                    <div className="sp-role-summary">
                      {roleTotals.map(([role, sec]) => (
                        <span key={role} className="tag tag-black sp-role-tag">
                          {ROLE_LABELS[role] ?? role}: {positionTotal > 0 ? ((sec / positionTotal) * 100).toFixed(0) : 0}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Match breakdown ── */}
              <div className="card sp-block-full">
                <div className="sz-breakdown-title">Speeltijd per wedstrijd</div>
                {s.matchBreakdown.length === 0 ? (
                  <div className="sp-empty-sm">Nog geen wedstrijden gespeeld</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Tegenstander</th>
                          <th className="hide-mobile">K1</th>
                          <th className="hide-mobile">K2</th>
                          <th className="hide-mobile">K3</th>
                          <th className="hide-mobile">K4</th>
                          <th>Speeltijd</th>
                          <th>Goals</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.matchBreakdown.map(mb => (
                          <tr key={mb.matchId}>
                            <td>{fmtDate(mb.date)}</td>
                            <td>{mb.opponent}</td>
                            {[1,2,3,4].map(n => (
                              <td key={n} className="hide-mobile">{(mb.periods[n] || 0) > 0 ? formatDuration(mb.periods[n]) : '—'}</td>
                            ))}
                            <td>{formatDuration(mb.totalSeconds)}</td>
                            <td>{mb.goals > 0 ? `⚽ ${mb.goals}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Evaluations per theme ── */}
              <div className="card sp-block-full">
                <div className="sz-breakdown-title">Evaluatiescores per thema</div>
                {themeGroups.length === 0 ? (
                  <div className="sp-empty-sm">Nog geen evaluaties beschikbaar</div>
                ) : (
                  <div className="sp-theme-list">
                    {themeGroups.map(g => (
                      <div key={g.title} className="sp-theme-row">
                        <span className={`tag ${g.category === 'B+' ? 'tag-green' : 'tag-black'}`}>
                          {THEME_CATEGORY_LABELS[g.category] ?? g.category}
                        </span>
                        <span className="sp-theme-title">{g.title}</span>
                        <span className="sp-theme-count">{g.count}×</span>
                        <span className="sz-eval-score-pill">{g.avg.toFixed(1)}/5</span>
                      </div>
                    ))}
                  </div>
                )}

                {s.evaluations.length > 0 && (
                  <>
                    <div className="sz-breakdown-title" style={{ marginTop: 20 }}>Alle quoteringen</div>
                    <div className="sz-eval-breakdown" style={{ border: 'none', padding: 0, background: 'none' }}>
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
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
