import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { useTeam } from '../lib/TeamContext';
import {
  getMatches, createMatch, updateMatch, deleteMatch,
  getPlayers, getAttendancesForMatch, setAttendance, getRotations, RotationEntry,
  getPlayTimeSessionsForMatch, PlayTimeSession,
  getWeekThemes, createWeekTheme, getEvaluationsForMatch, setEvaluation,
  getTeams, Team,
  exportMatchesCSV, importMatchesCSV,
  Match, Player, Attendance, WeekTheme, Evaluation,
  POSITION_LABELS, POSITION_FULL, THEME_CATEGORY_LABELS,
} from '../lib/api';
import { getJaarplanWeekForDate, formatJaarplanLabel } from '../lib/jaarplan';
import SpeeltijdPlanner from '../components/SpeeltijdPlanner';
import { usePlannerSettings } from '../lib/usePlannerSettings';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import './WedstrijdBeheer.css';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  planned:  { label: 'Gepland',    cls: 'tag-black' },
  active:   { label: '● Live',     cls: 'tag-green' },
  finished: { label: 'Afgelopen',  cls: 'tag-red' },
};

type View = 'list' | 'detail';
type DetailTab = 'selectie' | 'wisselschema' | 'evaluatie';

export default function WedstrijdBeheer() {
  const { teamId } = useTeam();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // List view state
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'active' | 'finished'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ opponent: '', date: '', location: 'home', teamId: '' });
  const [saving, setSaving] = useState(false);

  // Detail view state
  const [view, setView] = useState<View>('list');
  const [detailTab, setDetailTab] = useState<DetailTab>('selectie');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  // Alle beurtrollen van de ploeg (over alle wedstrijden), om eerlijk te kunnen rouleren.
  const [rotations, setRotations] = useState<RotationEntry[]>([]);
  const [showRotationOverview, setShowRotationOverview] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  // Centrale as hoort bij het wisselschema van de wedstrijd; enkel nodig op de Selectie-tab.
  const { settings: plannerSettings, update: updatePlanner } = usePlannerSettings(
    view !== 'list' && detailTab === 'selectie' ? selectedMatch?.id ?? null : null,
    selectedMatch?.team?.category,
  );
  const [editMatchForm, setEditMatchForm] = useState({ opponent: '', date: '', location: 'home', status: 'planned', scoreHome: '0', scoreAway: '0', teamId: '' });
  const [editingMatch, setEditingMatch] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Match | null>(null);
  const [importResult, setImportResult] = useState<{ rows: Match[]; updated: Match[]; errors: string[] } | null>(null);
  const [importing, setImporting]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Evaluatie tab state
  const [sessions, setSessions] = useState<PlayTimeSession[]>([]);
  const [weekThemes, setWeekThemes] = useState<WeekTheme[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [evalLoading, setEvalLoading] = useState(false);
  const [savingEvalPlayerId, setSavingEvalPlayerId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [m, p, th, tms, rot] = await Promise.all([getMatches(teamId ?? undefined), getPlayers(teamId ?? undefined), getWeekThemes(true), getTeams(), getRotations(teamId ?? undefined)]);
      setRotations(rot);
      setMatches(m);
      setPlayers(p.filter(pl => pl.active === 'true'));
      setWeekThemes(th);
      setTeams(tms);
    } finally { setLoading(false); }
  }

  function openCreateModal() {
    setCreateForm({ opponent: '', date: '', location: 'home', teamId: teamId ?? '' });
    setShowCreateModal(true);
  }

  async function openDetail(m: Match) {
    setSelectedMatch(m);
    setDetailTab('selectie');
    setEditMatchForm({
      opponent: m.opponent,
      date: m.date ? new Date(m.date).toISOString().slice(0, 16) : '',
      location: m.location,
      status: m.status,
      scoreHome: String(m.scoreHome),
      scoreAway: String(m.scoreAway),
      teamId: m.team?.id ?? '',
    });
    setView('detail');
    setAttLoading(true);
    try { setAttendances(await getAttendancesForMatch(m.id)); } finally { setAttLoading(false); }
    setEvalLoading(true);
    try {
      const [sess, evals] = await Promise.all([getPlayTimeSessionsForMatch(m.id), getEvaluationsForMatch(m.id)]);
      setSessions(sess);
      setEvaluations(evals);
    } finally { setEvalLoading(false); }
  }

  async function refreshAttendances() {
    if (!selectedMatch) return;
    setAttendances(await getAttendancesForMatch(selectedMatch.id));
  }

  async function refreshEvaluations() {
    if (!selectedMatch) return;
    setEvaluations(await getEvaluationsForMatch(selectedMatch.id));
  }

  async function handleSetMatchTheme(themeId: string) {
    if (!selectedMatch) return;
    await updateMatch(selectedMatch.id, themeId ? { weekTheme: { connect: { id: themeId } } } : { weekTheme: { disconnect: true } });
    const fresh = await getMatches(teamId ?? undefined);
    setMatches(fresh);
    setSelectedMatch(fresh.find(m => m.id === selectedMatch.id) ?? selectedMatch);
  }

  // Stelt het weekthema voor op basis van de datum van DEZE wedstrijd en het jaarplan
  // van de ploeg waar de wedstrijd zelf bij hoort (match.team) — niet de ploeg die de
  // trainer toevallig net geselecteerd heeft, want dat kan afwijken (bv. bij meerdere ploegen).
  async function applyJaarplanTheme() {
    if (!selectedMatch) return;
    const jw = getJaarplanWeekForDate(new Date(selectedMatch.date));
    if (!jw) {
      alert('Geen jaarplan-data gevonden voor de datum van deze wedstrijd (bv. buiten het seizoen of tijdens de kerstvakantie).');
      return;
    }
    if (!jw.teamprincipe) {
      alert(`${formatJaarplanLabel(jw)} is een neutrale week zonder vast teamprincipe — kies zelf een thema.`);
      return;
    }
    const suggestedCategory = jw.fase === 'BALBEZIT' ? 'B+' : jw.fase === 'BALVERLIES' ? 'B-' : 'B+';

    let theme = weekThemes.find(t => t.title.trim().toLowerCase() === jw.teamprincipe.trim().toLowerCase());
    if (!theme) {
      const teamLabel = selectedMatch.team?.category ?? 'deze ploeg';
      const create = confirm(
        `Jaarplan (${formatJaarplanLabel(jw)}, ${teamLabel}):\n` +
        `Teamprincipe: ${jw.teamprincipe}\nSpelprincipe: ${jw.spelprincipe}\n\n` +
        `Er bestaat nog geen weekthema met deze titel. Nieuw weekthema aanmaken en koppelen aan deze wedstrijd?`
      );
      if (!create) return;
      theme = await createWeekTheme({ title: jw.teamprincipe, category: suggestedCategory, description: jw.spelprincipe });
      setWeekThemes(prev => [...prev, theme!]);
    }
    await handleSetMatchTheme(theme.id);
  }

  async function handleSetScore(playerId: string, score: number) {
    if (!selectedMatch?.weekTheme) return;
    setSavingEvalPlayerId(playerId);
    try {
      await setEvaluation(selectedMatch.id, playerId, selectedMatch.weekTheme.id, score);
      await refreshEvaluations();
    } finally { setSavingEvalPlayerId(null); }
  }

  async function handleCreate() {
    if (!createForm.opponent.trim() || !createForm.date) return;
    setSaving(true);
    try {
      await createMatch({ opponent: createForm.opponent.trim(), date: new Date(createForm.date).toISOString(), location: createForm.location, teamId: createForm.teamId || undefined });
      setShowCreateModal(false);
      setCreateForm({ opponent: '', date: '', location: 'home', teamId: '' });
      await loadAll();
    } finally { setSaving(false); }
  }

  async function handleSaveMatch() {
    if (!selectedMatch) return;
    setSaving(true);
    try {
      await updateMatch(selectedMatch.id, {
        opponent: editMatchForm.opponent,
        date: new Date(editMatchForm.date).toISOString(),
        location: editMatchForm.location,
        status: editMatchForm.status,
        scoreHome: parseInt(editMatchForm.scoreHome) || 0,
        scoreAway: parseInt(editMatchForm.scoreAway) || 0,
        team: editMatchForm.teamId ? { connect: { id: editMatchForm.teamId } } : { disconnect: true },
      });
      const fresh = await getMatches();
      setMatches(fresh);
      const updated = fresh.find(m => m.id === selectedMatch.id) ?? selectedMatch;
      setSelectedMatch(updated);
      setEditingMatch(false);
    } finally { setSaving(false); }
  }

  async function handleDeleteMatch(m: Match) {
    await deleteMatch(m.id);
    setConfirmDelete(null);
    if (view === 'detail') { setView('list'); setSelectedMatch(null); }
    await loadAll();
  }

  async function toggleSelected(player: Player) {
    if (!selectedMatch) return;
    const att = attendances.find(a => a.player.id === player.id);
    const isSelected = att?.selected === 'true';
    await setAttendance(selectedMatch.id, player.id, true, !isSelected);
    await refreshAttendances();
    if (att?.rotation === 'true') setRotations(await getRotations(teamId ?? undefined));
  }

  /** Beurtrol aan/uit: niet geselecteerd omwille van een beurtrol (i.p.v. afwezig). */
  async function toggleRotation(player: Player) {
    if (!selectedMatch) return;
    const on = !isRotation(player.id);
    await setAttendance(selectedMatch.id, player.id, true, false, on);
    const [att, rot] = await Promise.all([getAttendancesForMatch(selectedMatch.id), getRotations(teamId ?? undefined)]);
    setAttendances(att);
    setRotations(rot);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function isSelected(playerId: string) {
    return attendances.find(a => a.player.id === playerId)?.selected === 'true';
  }

  function isRotation(playerId: string) {
    return attendances.find(a => a.player.id === playerId)?.rotation === 'true';
  }

  function fmtDate(iso: string) {
    try { return format(new Date(iso), "EEE d MMM yyyy 'om' HH:mm", { locale: nl }); }
    catch { return iso; }
  }

  function fmtShort(iso: string) {
    try { return format(new Date(iso), 'd/MM/yy', { locale: nl }); }
    catch { return iso; }
  }

  const displayed = matches.filter(m => statusFilter === 'all' || m.status === statusFilter);
  const selectedCount = attendances.filter(a => a.selected === 'true').length;
  const toggleCentral = (id: string) => updatePlanner(s => ({
    ...s, central: s.central.includes(id) ? s.central.filter(x => x !== id) : [...s.central, id],
  }));

  // ── Beurtrol ──
  // Teller + laatste beurtrol per speler over alle wedstrijden (rotations is chronologisch).
  const rotationStats = new Map<string, { count: number; last: RotationEntry['match'] }>();
  for (const r of rotations) {
    rotationStats.set(r.playerId, { count: (rotationStats.get(r.playerId)?.count ?? 0) + 1, last: r.match });
  }
  const rotationCount = (id: string) => rotationStats.get(id)?.count ?? 0;
  const rotationAttendances = attendances.filter(a => a.rotation === 'true' && a.selected !== 'true');
  // Volgorde "aan de beurt": minste beurtrollen eerst, bij gelijkstand wie het langst geleden (of nooit) was.
  const lastRotationTime = (id: string) => {
    const last = rotationStats.get(id)?.last;
    return last ? new Date(last.date).getTime() : -Infinity;
  };
  const rotationOrder = [...players].sort((a, b) =>
    rotationCount(a.id) - rotationCount(b.id) || lastRotationTime(a.id) - lastRotationTime(b.id) || a.name.localeCompare(b.name));
  const minRotations = players.length ? Math.min(...players.map(p => rotationCount(p.id))) : 0;
  const filteredPlayers = players.filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase()));

  // Spelers die "speelden": geselecteerd voor de wedstrijd, of hebben speeltijd geregistreerd
  function getEvalAttendances(): Attendance[] {
    const playedIds = new Set(
      sessions.filter(s => (s.durationSeconds || 0) > 0).map(s => s.attendance.id)
    );
    return attendances
      .filter(a => a.selected === 'true' || playedIds.has(a.id))
      .sort((a, b) => (a.player.number ?? 99) - (b.player.number ?? 99));
  }

  function getEvalScore(playerId: string): number | null {
    return evaluations.find(e => e.player.id === playerId)?.score ?? null;
  }

  // Group players by position for the selection panel
  const posOrder = ['keeper', 'defender', 'midfielder', 'forward'];
  const byPos: Record<string, Player[]> = {};
  filteredPlayers.forEach(p => {
    const k = p.position || 'unknown';
    (byPos[k] = byPos[k] || []).push(p);
  });

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importMatchesCSV(file, {
        existing: matches,
        create: m => createMatch({ ...m, teamId: teamId ?? undefined }),
        update: (id, m) => updateMatch(id, m),
      });
      setImportResult(result);
      await loadAll();
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="page">
      <div className="wb-header">
        <div>
          <h1 className="page-title">Wedstrijden</h1>
          <p className="page-subtitle">Beheer & Selectie</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportMatchesCSV(matches)}>⬇ CSV</button>
          <button className="btn btn-ghost btn-sm" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? 'Laden...' : '⬆ CSV'}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
          <button className="btn btn-primary" onClick={openCreateModal}>+ Nieuwe wedstrijd</button>
        </div>
      </div>

      {/* Status filter */}
      <div className="wb-filter-row">
        {(['all','planned','active','finished'] as const).map(s => (
          <button
            key={s}
            className={`sb-toggle ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'Alle' : STATUS_META[s]?.label}
          </button>
        ))}
        <span className="wb-count">{displayed.length} wedstrijd{displayed.length !== 1 ? 'en' : ''}</span>
      </div>

      {loading ? (
        <div className="loading-spinner">Laden...</div>
      ) : displayed.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📋</div>Geen wedstrijden gevonden</div>
      ) : (
        <div className="card wb-table-wrap">
          {/* Desktop table */}
          <table className="data-table wb-desktop-only">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Tegenstander</th>
                <th>Locatie</th>
                <th>Score</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(m => {
                const sm = STATUS_META[m.status] ?? STATUS_META.planned;
                return (
                  <tr key={m.id} className="wb-row" onClick={() => openDetail(m)}>
                    <td className="wb-date">{fmtShort(m.date)}</td>
                    <td className="wb-opponent">{m.opponent}</td>
                    <td><span className={`tag ${m.location === 'home' ? 'tag-red' : 'tag-black'}`}>{m.location === 'home' ? 'Thuis' : 'Uit'}</span></td>
                    <td className="wb-score">{m.status !== 'planned' ? `${m.scoreHome} – ${m.scoreAway}` : '—'}</td>
                    <td><span className={`tag ${sm.cls}`}>{sm.label}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="wb-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openDetail(m)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(m)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="wb-mobile-only" style={{ padding: '8px' }}>
            {displayed.map(m => {
              const sm = STATUS_META[m.status] ?? STATUS_META.planned;
              return (
                <div key={m.id} className="wb-mobile-card" onClick={() => openDetail(m)}>
                  <div className="wb-mobile-card-top">
                    <span className={`tag ${sm.cls}`}>{sm.label}</span>
                    <span className={`tag ${m.location === 'home' ? 'tag-red' : 'tag-black'}`}>{m.location === 'home' ? 'Thuis' : 'Uit'}</span>
                    {m.status !== 'planned' && <span className="wb-score" style={{ fontSize: 16 }}>{m.scoreHome}–{m.scoreAway}</span>}
                  </div>
                  <div className="wb-mobile-opponent">vs. {m.opponent}</div>
                  <div className="wb-mobile-meta">
                    <span>{fmtShort(m.date)}</span>
                  </div>
                  <div className="wb-mobile-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDetail(m)}>✏️ Bewerken</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(m)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CSV import result */}
      {importResult && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setImportResult(null)}>
          <div className="modal">
            <div className="modal-title">CSV import resultaat</div>
            <p style={{ color: 'var(--green)', marginBottom: 8 }}>
              ✓ {importResult.rows.length} nieuwe wedstrijd{importResult.rows.length !== 1 ? 'en' : ''} toegevoegd
              {importResult.updated.length > 0 && <>, {importResult.updated.length} bestaande bijgewerkt</>}
            </p>
            {importResult.errors.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: 'var(--red)', marginBottom: 6, fontFamily: 'var(--font-heading)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {importResult.errors.length} fout{importResult.errors.length !== 1 ? 'en' : ''}:
                </p>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, padding: '10px 12px', maxHeight: 160, overflowY: 'auto' }}>
                  {importResult.errors.map((e, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 4 }}>{e}</div>)}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setImportResult(null)}>Sluiten</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreateModal(false)}>
          <div className="modal">
            <div className="modal-title">Nieuwe wedstrijd</div>
            <div className="form-group">
              <label className="input-label">Tegenstander *</label>
              <input className="input-field" autoFocus value={createForm.opponent}
                onChange={e => setCreateForm({ ...createForm, opponent: e.target.value })}
                placeholder="Naam tegenstander" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Datum & Tijd *</label>
                <input type="datetime-local" className="input-field" value={createForm.date}
                  onChange={e => setCreateForm({ ...createForm, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="input-label">Locatie</label>
                <select className="input-field" value={createForm.location}
                  onChange={e => setCreateForm({ ...createForm, location: e.target.value })}>
                  <option value="home">Thuis</option>
                  <option value="away">Uit</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">Ploeg</label>
              <select className="input-field" value={createForm.teamId}
                onChange={e => setCreateForm({ ...createForm, teamId: e.target.value })}>
                <option value="">— Geen ploeg —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
              </select>
              <p className="wb-team-hint">Bepaalt het veldformaat (aantal spelers) tijdens de wedstrijd.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreateModal(false)}>Annuleer</button>
              <button className="btn btn-primary" onClick={handleCreate}
                disabled={saving || !createForm.opponent.trim() || !createForm.date}>
                {saving ? 'Opslaan...' : 'Aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-title">Wedstrijd verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.6 }}>
              Verwijder <strong style={{ color: 'var(--white)' }}>vs. {confirmDelete.opponent}</strong>?
              Alle speeltijdgegevens gaan verloren.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }}
                onClick={() => handleDeleteMatch(confirmDelete)}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  const m = selectedMatch!;
  const sm = STATUS_META[m.status] ?? STATUS_META.planned;
  // Jaarplan-week op basis van de datum van DEZE wedstrijd (niet "vandaag") — gebruikt
  // in de Evaluatie-tab om een weekthema voor te stellen uit het jaarplan.
  const jaarplanWeek = getJaarplanWeekForDate(new Date(m.date));

  return (
    <div className="page">
      {/* Breadcrumb */}
      <button className="breadcrumb-link" onClick={() => { setView('list'); setSelectedMatch(null); }}>
        ← Wedstrijden
      </button>

      {/* Match hero */}
      <div className="wb-detail-hero">
        <div className="wb-hero-left">
          <div className="wb-hero-title">vs. {m.opponent}</div>
          <div className="wb-hero-meta">
            {fmtDate(m.date)} &nbsp;•&nbsp;
            {m.location === 'home' ? 'Thuis' : 'Uit'}
          </div>
        </div>
        <div className="wb-hero-right">
          <span className={`tag ${sm.cls}`}>{sm.label}</span>
          {m.status !== 'planned' && (
            <span className="wb-score-display">{m.scoreHome} – {m.scoreAway}</span>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => setEditingMatch(true)}>✏️ Bewerken</button>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(m)}>🗑️</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="wb-tabs">
        <button className={`wb-tab ${detailTab === 'selectie' ? 'active' : ''}`} onClick={() => setDetailTab('selectie')}>
          ⚽ Selectie
        </button>
        <button className={`wb-tab ${detailTab === 'wisselschema' ? 'active' : ''}`} onClick={() => setDetailTab('wisselschema')}>
          ⏱ Wisselschema
        </button>
        <button className={`wb-tab ${detailTab === 'evaluatie' ? 'active' : ''}`} onClick={() => setDetailTab('evaluatie')}>
          🎯 Evaluatie{evaluations.length > 0 ? ` (${evaluations.length})` : ''}
        </button>
      </div>

      {/* Two-column layout: selection panel + selected list */}
      {detailTab === 'selectie' && (
      <div className="wb-detail-body">

        {/* ── LEFT: all players ── */}
        <div className="wb-panel">
          <div className="wb-panel-header">
            <span className="wb-panel-title">Spelers</span>
            <span className="wb-panel-hint">Klik om te selecteren</span>
          </div>
          <input
            className="input-field wb-player-search"
            placeholder="Zoek speler..."
            value={playerSearch}
            onChange={e => setPlayerSearch(e.target.value)}
          />
          {attLoading ? (
            <div className="loading-spinner" style={{ padding: 32 }}>Laden...</div>
          ) : (
            <div className="wb-player-groups">
              {posOrder.filter(pos => byPos[pos]?.length > 0).map(pos => (
                <div key={pos}>
                  <div className="wb-pos-header">
                    <span className="wb-pos-tag">{POSITION_LABELS[pos] || '??'}</span>
                    {POSITION_FULL[pos] || 'Onbekend'}
                  </div>
                  {byPos[pos].map(p => {
                    const sel = isSelected(p.id);
                    const rot = isRotation(p.id);
                    const rc = rotationCount(p.id);
                    return (
                      <div key={p.id} className={`wb-player-row ${sel ? 'selected' : ''} ${rot ? 'rotation' : ''}`}>
                        <button className={`wb-player-btn ${sel ? 'selected' : ''}`} onClick={() => toggleSelected(p)}>
                          <span className="wb-player-num">{p.number ? `#${p.number}` : '—'}</span>
                          <span className="wb-player-name">{p.name}</span>
                          {rc > 0 && (
                            <span className="wb-rot-count" title={`${rc}× niet geselecteerd wegens beurtrol`}>🔄 {rc}</span>
                          )}
                          <span className="wb-player-check">{sel ? '✓' : '+'}</span>
                        </button>
                        {!sel && (
                          <button className={`wb-rot-btn ${rot ? 'active' : ''}`} onClick={() => toggleRotation(p)}
                            aria-pressed={rot}
                            title={rot ? 'Beurtrol — klik om op te heffen' : 'Niet geselecteerd wegens beurtrol'}>
                            🔄
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: selected players ── */}
        <div className="wb-panel wb-panel-selected">
          <div className="wb-panel-header">
            <span className="wb-panel-title">Selectie</span>
            <span className="wb-sel-count-badge">{selectedCount}</span>
          </div>
          {selectedCount === 0 ? (
            <div className="wb-sel-empty">
              Nog geen spelers geselecteerd.<br />Klik op spelers om ze toe te voegen.
            </div>
          ) : (
            <div className="wb-sel-list">
              {attendances
                .filter(a => a.selected === 'true')
                .sort((a, b) => (a.player.number ?? 99) - (b.player.number ?? 99))
                .map((a, i) => (
                  <div key={a.id} className="wb-sel-row">
                    <span className="wb-sel-idx">{i + 1}</span>
                    <span className="wb-sel-num">{a.player.number ? `#${a.player.number}` : '—'}</span>
                    <span className="wb-sel-name">{a.player.name}</span>
                    {a.player.position && (
                      <span className="tag tag-black" style={{ fontSize: 10 }}>{POSITION_LABELS[a.player.position]}</span>
                    )}
                    <button type="button" className={`wb-axis-btn ${plannerSettings.central.includes(a.player.id) ? 'active' : ''}`}
                      onClick={() => toggleCentral(a.player.id)}
                      aria-pressed={plannerSettings.central.includes(a.player.id)}
                      title="Centrale as: staat altijd op 3, 6 of 9">
                      ◆ As
                    </button>
                    <button className="wb-sel-remove" onClick={() => toggleSelected(a.player)} title="Verwijder uit selectie">✕</button>
                  </div>
                ))}
            </div>
          )}
          {selectedCount > 0 && (
            <div className="wb-sel-footer">
              {selectedCount} speler{selectedCount !== 1 ? 's' : ''} geselecteerd
            </div>
          )}

          {/* ── Beurtrol voor deze wedstrijd ── */}
          <div className="wb-rot-section">
            <div className="wb-panel-header">
              <span className="wb-panel-title">Beurtrol</span>
              <span className="wb-rot-badge">{rotationAttendances.length}</span>
            </div>
            {rotationAttendances.length === 0 ? (
              <div className="wb-rot-empty">Niemand rust deze wedstrijd. Tik 🔄 naast een speler die niet geselecteerd wordt omwille van een beurtrol.</div>
            ) : (
              <div className="wb-sel-list">
                {rotationAttendances
                  .sort((a, b) => (a.player.number ?? 99) - (b.player.number ?? 99))
                  .map(a => (
                    <div key={a.id} className="wb-sel-row">
                      <span className="wb-rot-icon">🔄</span>
                      <span className="wb-sel-num">{a.player.number ? `#${a.player.number}` : '—'}</span>
                      <span className="wb-sel-name">{a.player.name}</span>
                      <span className="wb-rot-total" title="Totaal aantal beurtrollen dit seizoen">{rotationCount(a.player.id)}×</span>
                      <button className="wb-sel-remove" onClick={() => toggleRotation(a.player)} title="Beurtrol opheffen">✕</button>
                    </div>
                  ))}
              </div>
            )}

            {/* Overzicht: wie is aan de beurt? */}
            <button type="button" className="wb-rot-toggle" onClick={() => setShowRotationOverview(v => !v)} aria-expanded={showRotationOverview}>
              {showRotationOverview ? '▾' : '▸'} Beurtrol-overzicht — wie is aan de beurt?
            </button>
            {showRotationOverview && (
              <div className="wb-rot-overview">
                {rotationOrder.map(p => {
                  const st = rotationStats.get(p.id);
                  const now = isRotation(p.id);
                  const isTurn = rotationCount(p.id) === minRotations && !now;
                  return (
                    <div key={p.id} className={`wb-rot-ov-row ${isTurn ? 'turn' : ''} ${now ? 'now' : ''}`}>
                      <span className="wb-rot-ov-name">{p.name}</span>
                      <span className="wb-rot-ov-last">
                        {st ? `laatst: ${fmtShort(st.last.date)} vs. ${st.last.opponent}` : 'nog nooit'}
                      </span>
                      <span className="wb-rot-ov-count">{rotationCount(p.id)}×</span>
                      {now ? <span className="wb-rot-tag now">deze match</span>
                        : isTurn ? <span className="wb-rot-tag">aan de beurt</span>
                        : <span className="wb-rot-tag empty" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Wisselschema tab — speeltijdplanner op basis van de selectie */}
      {detailTab === 'wisselschema' && (
        <SpeeltijdPlanner
          key={m.id}
          matchId={m.id}
          category={m.team?.category}
          title={`Wisselschema vs. ${m.opponent} (${fmtShort(m.date)})`}
          players={attendances.filter(a => a.selected === 'true').map(a => a.player)}
        />
      )}

      {/* Evaluatie tab */}
      {detailTab === 'evaluatie' && (
        <div className="wb-eval-panel card">
          <div className="wb-eval-header">
            <div>
              <div className="wb-eval-title">Weekthema</div>
              <div className="wb-eval-hint">Kies het thema waarop spelers voor deze wedstrijd gequoteerd worden.</div>
              {jaarplanWeek && (
                <div className="wb-eval-jaarplan-hint">
                  📅 Jaarplan ({formatJaarplanLabel(jaarplanWeek)}
                  {m.team?.category ? ` · ${m.team.category}` : ''}){jaarplanWeek.teamprincipe && <>: <strong>{jaarplanWeek.teamprincipe}</strong></>}
                </div>
              )}
            </div>
            <div className="wb-eval-theme-controls">
              <select
                className="input-field wb-eval-theme-select"
                value={m.weekTheme?.id ?? ''}
                onChange={e => handleSetMatchTheme(e.target.value)}
              >
                <option value="">— Geen thema gekozen —</option>
                {/* Toon ook een reeds gekoppeld thema dat intussen inactief is gezet */}
                {m.weekTheme && !weekThemes.some(t => t.id === m.weekTheme!.id) && (
                  <option value={m.weekTheme.id}>
                    [{THEME_CATEGORY_LABELS[m.weekTheme.category] ?? m.weekTheme.category}] {m.weekTheme.title} (inactief)
                  </option>
                )}
                {weekThemes.map(t => (
                  <option key={t.id} value={t.id}>
                    [{THEME_CATEGORY_LABELS[t.category] ?? t.category}] {t.title}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-outline btn-sm"
                onClick={applyJaarplanTheme}
                disabled={!jaarplanWeek || !jaarplanWeek.teamprincipe}
                title="Stel het weekthema voor op basis van het jaarplan van de ploeg van deze wedstrijd, voor de datum van deze wedstrijd"
              >
                📅 Uit jaarplan
              </button>
            </div>
          </div>

          {evalLoading ? (
            <div className="loading-spinner" style={{ padding: 32 }}>Laden...</div>
          ) : !m.weekTheme ? (
            <div className="empty-state" style={{ padding: '32px 16px' }}>
              <div className="empty-icon">🎯</div>
              Kies eerst een weekthema om spelers te kunnen quoteren.
            </div>
          ) : getEvalAttendances().length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 16px' }}>
              <div className="empty-icon">👥</div>
              Nog geen spelers geselecteerd of met speeltijd voor deze wedstrijd.
            </div>
          ) : (
            <div className="wb-eval-list">
              {getEvalAttendances().map(a => {
                const score = getEvalScore(a.player.id);
                const saving = savingEvalPlayerId === a.player.id;
                return (
                  <div key={a.id} className="wb-eval-row">
                    <span className="wb-eval-num">{a.player.number ? `#${a.player.number}` : '—'}</span>
                    <span className="wb-eval-name">{a.player.name}</span>
                    <div className="wb-eval-scores">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          className={`wb-eval-score-btn ${score === n ? 'active' : ''}`}
                          disabled={saving}
                          onClick={() => handleSetScore(a.player.id, n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit match modal */}
      {editingMatch && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingMatch(false)}>
          <div className="modal">
            <div className="modal-title">Wedstrijd bewerken</div>
            <div className="form-group">
              <label className="input-label">Tegenstander *</label>
              <input className="input-field" autoFocus value={editMatchForm.opponent}
                onChange={e => setEditMatchForm({ ...editMatchForm, opponent: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Datum & Tijd</label>
                <input type="datetime-local" className="input-field" value={editMatchForm.date}
                  onChange={e => setEditMatchForm({ ...editMatchForm, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="input-label">Locatie</label>
                <select className="input-field" value={editMatchForm.location}
                  onChange={e => setEditMatchForm({ ...editMatchForm, location: e.target.value })}>
                  <option value="home">Thuis</option>
                  <option value="away">Uit</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">Ploeg</label>
              <select className="input-field" value={editMatchForm.teamId}
                onChange={e => setEditMatchForm({ ...editMatchForm, teamId: e.target.value })}>
                <option value="">— Geen ploeg —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
              </select>
              <p className="wb-team-hint">Bepaalt het veldformaat (aantal spelers) tijdens de wedstrijd.</p>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Status</label>
                <select className="input-field" value={editMatchForm.status}
                  onChange={e => setEditMatchForm({ ...editMatchForm, status: e.target.value })}>
                  <option value="planned">Gepland</option>
                  <option value="active">Bezig</option>
                  <option value="finished">Afgelopen</option>
                </select>
              </div>
              {editMatchForm.status !== 'planned' && (
                <div className="form-group">
                  <label className="input-label">Score (thuis – uit)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" min={0} className="input-field" style={{ width: 60, textAlign: 'center' }}
                      value={editMatchForm.scoreHome}
                      onChange={e => setEditMatchForm({ ...editMatchForm, scoreHome: e.target.value })} />
                    <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)', fontSize: 20 }}>–</span>
                    <input type="number" min={0} className="input-field" style={{ width: 60, textAlign: 'center' }}
                      value={editMatchForm.scoreAway}
                      onChange={e => setEditMatchForm({ ...editMatchForm, scoreAway: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setEditingMatch(false)}>Annuleer</button>
              <button className="btn btn-primary" onClick={handleSaveMatch} disabled={saving}>
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-title">Wedstrijd verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.6 }}>
              Verwijder <strong style={{ color: 'var(--white)' }}>vs. {confirmDelete.opponent}</strong>?
              Alle speeltijdgegevens gaan verloren.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }}
                onClick={() => handleDeleteMatch(confirmDelete)}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
