import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { useTeam } from '../lib/TeamContext';
import {
  getMatches, createMatch, updateMatch, deleteMatch,
  getPlayers, getAttendancesForMatch, setAttendance,
  exportMatchesCSV, importMatchesCSV,
  Match, Player, Attendance,
  POSITION_LABELS, POSITION_FULL,
} from '../lib/api';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import './WedstrijdBeheer.css';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  planned:  { label: 'Gepland',    cls: 'tag-black' },
  active:   { label: '● Live',     cls: 'tag-green' },
  finished: { label: 'Afgelopen',  cls: 'tag-red' },
};

type View = 'list' | 'detail';

export default function WedstrijdBeheer() {
  const { teamId } = useTeam();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // List view state
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'active' | 'finished'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ opponent: '', date: '', location: 'home' });
  const [saving, setSaving] = useState(false);

  // Detail view state
  const [view, setView] = useState<View>('list');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [editMatchForm, setEditMatchForm] = useState({ opponent: '', date: '', location: 'home', status: 'planned', scoreHome: '0', scoreAway: '0' });
  const [editingMatch, setEditingMatch] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Match | null>(null);
  const [importResult, setImportResult] = useState<{ rows: Match[]; errors: string[] } | null>(null);
  const [importing, setImporting]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([getMatches(teamId ?? undefined), getPlayers(teamId ?? undefined)]);
      setMatches(m);
      setPlayers(p.filter(pl => pl.active === 'true'));
    } finally { setLoading(false); }
  }

  async function openDetail(m: Match) {
    setSelectedMatch(m);
    setEditMatchForm({
      opponent: m.opponent,
      date: m.date ? new Date(m.date).toISOString().slice(0, 16) : '',
      location: m.location,
      status: m.status,
      scoreHome: String(m.scoreHome),
      scoreAway: String(m.scoreAway),
    });
    setView('detail');
    setAttLoading(true);
    try { setAttendances(await getAttendancesForMatch(m.id)); } finally { setAttLoading(false); }
  }

  async function refreshAttendances() {
    if (!selectedMatch) return;
    setAttendances(await getAttendancesForMatch(selectedMatch.id));
  }

  async function handleCreate() {
    if (!createForm.opponent.trim() || !createForm.date) return;
    setSaving(true);
    try {
      await createMatch({ opponent: createForm.opponent.trim(), date: new Date(createForm.date).toISOString(), location: createForm.location, teamId: teamId ?? undefined });
      setShowCreateModal(false);
      setCreateForm({ opponent: '', date: '', location: 'home' });
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
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function isSelected(playerId: string) {
    return attendances.find(a => a.player.id === playerId)?.selected === 'true';
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
  const filteredPlayers = players.filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase()));

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
      const result = await importMatchesCSV(file, (m) => createMatch({ ...m, teamId: teamId ?? undefined }));
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
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>+ Nieuwe wedstrijd</button>
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
            <p style={{ color: 'var(--green)', marginBottom: 8 }}>✓ {importResult.rows.length} wedstrijd{importResult.rows.length !== 1 ? 'en' : ''} geïmporteerd</p>
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
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24, lineHeight: 1.6 }}>
              Verwijder <strong style={{ color: 'white' }}>vs. {confirmDelete.opponent}</strong>?
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

      {/* Two-column layout: selection panel + selected list */}
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
                    return (
                      <button
                        key={p.id}
                        className={`wb-player-btn ${sel ? 'selected' : ''}`}
                        onClick={() => toggleSelected(p)}
                      >
                        <span className="wb-player-num">{p.number ? `#${p.number}` : '—'}</span>
                        <span className="wb-player-name">{p.name}</span>
                        <span className="wb-player-check">{sel ? '✓' : '+'}</span>
                      </button>
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
        </div>
      </div>

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
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-display)', fontSize: 20 }}>–</span>
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
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24, lineHeight: 1.6 }}>
              Verwijder <strong style={{ color: 'white' }}>vs. {confirmDelete.opponent}</strong>?
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
