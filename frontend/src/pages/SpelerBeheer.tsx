import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { useTeam } from '../lib/TeamContext';
import {
  getPlayers, createPlayer, updatePlayer, deletePlayer,
  getTeams, Team,
  exportPlayersCSV, importPlayersCSV,
  Player, POSITIONS, POSITION_LABELS, POSITION_FULL,
} from '../lib/api';
import SpelerProfiel from './SpelerProfiel';
import './SpelerBeheer.css';

type SortKey = 'name' | 'number' | 'position';
type SbTab = 'lijst' | 'profiel';

export default function SpelerBeheer() {
  const { teamId, isAdmin } = useTeam();
  const [tab, setTab] = useState<SbTab>('lijst');
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState({ name: '', number: '', position: '', position2: '', active: 'true', teamId: '' });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [confirmDelete, setConfirmDelete] = useState<Player | null>(null);
  const [importResult, setImportResult] = useState<{ rows: Player[]; updated: Player[]; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        getPlayers(teamId ?? undefined),
        isAdmin ? getTeams() : Promise.resolve([]),
      ]);
      setPlayers(p);
      setTeams(t);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditPlayer(null);
    setForm({ name: '', number: '', position: '', position2: '', active: 'true', teamId: teamId ?? '' });
    setShowModal(true);
  }

  function openEdit(p: Player) {
    setEditPlayer(p);
    setForm({ name: p.name, number: p.number?.toString() ?? '', position: p.position ?? '', position2: p.position2 ?? '', active: p.active, teamId: '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      // Build clean input — never send empty strings to Keystone select fields
      const input: Record<string, unknown> = { name: form.name.trim() };
      if (form.position) input.position = form.position;
      // Tweede positie: bij bewerken expliciet null om ze te kunnen wissen.
      const pos2 = form.position2 && form.position2 !== form.position ? form.position2 : '';
      if (pos2) input.position2 = pos2;
      else if (editPlayer) input.position2 = null;
      if (form.number && form.number !== '') input.number = parseInt(form.number);
      if (editPlayer) {
        input.active = form.active;
        await updatePlayer(editPlayer.id, input);
      } else {
        input.active = 'true';
        // Admins can pick any team; trainers use their own team from context
        const assignTeamId = isAdmin ? (form.teamId || undefined) : (teamId || undefined);
        if (assignTeamId) input.teamId = assignTeamId;
        await createPlayer(input as { name: string; number?: number; position?: string; teamId?: string });
      }
      setShowModal(false);
      await load();
    } catch (err) {
      alert('Fout bij opslaan: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(p: Player) {
    await updatePlayer(p.id, { active: p.active === 'true' ? 'false' : 'true' });
    await load();
  }

  // Filtered + sorted list
  const displayed = players
    .filter(p => {
      if (activeFilter === 'active' && p.active !== 'true') return false;
      if (activeFilter === 'inactive' && p.active === 'true') return false;
      if (posFilter && p.position !== posFilter && p.position2 !== posFilter) return false;
      if (filter && !p.name.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'number') return (a.number ?? 99) - (b.number ?? 99);
      if (sortKey === 'position') {
        const po = ['keeper','defender','midfielder','forward'];
        return po.indexOf(a.position ?? '') - po.indexOf(b.position ?? '');
      }
      return a.name.localeCompare(b.name);
    });

  const total   = players.length;
  const active  = players.filter(p => p.active === 'true').length;

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importPlayersCSV(file, {
        existing: players,
        create: p => createPlayer({ ...p, teamId: teamId ?? undefined }),
        update: (id, p) => updatePlayer(id, p),
      });
      setImportResult(result);
      await load();
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="sb-header">
        <div>
          <h1 className="page-title">Spelerbeheer</h1>
          <p className="page-subtitle">KFC Lennik — Kern & Selectie</p>
        </div>
        {tab === 'lijst' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => exportPlayersCSV(players)} title="Exporteer als CSV">⬇ CSV</button>
            <button className="btn btn-ghost btn-sm" disabled={importing} onClick={() => fileInputRef.current?.click()}>
              {importing ? 'Laden...' : '⬆ CSV'}
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
            <button className="btn btn-primary" onClick={openCreate}>+ Nieuwe speler</button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="sb-toggles" style={{ display: 'inline-flex', marginBottom: 20 }}>
        <button className={`sb-toggle ${tab === 'lijst' ? 'active' : ''}`} onClick={() => setTab('lijst')}>👥 Spelerslijst</button>
        <button className={`sb-toggle ${tab === 'profiel' ? 'active' : ''}`} onClick={() => setTab('profiel')}>👤 Profiel</button>
      </div>

      {tab === 'profiel' ? <SpelerProfiel /> : <>

      {/* ── Stats strip ── */}
      <div className="sb-stats">
        {[
          { label: 'Totaal',       value: total },
          { label: 'Actief',       value: active },
          { label: 'Doelmannen',   value: players.filter(p => p.position === 'keeper').length },
          { label: 'Verdedigers',  value: players.filter(p => p.position === 'defender').length },
          { label: 'Middenvelders',value: players.filter(p => p.position === 'midfielder').length },
          { label: 'Aanvallers',   value: players.filter(p => p.position === 'forward').length },
        ].map(s => (
          <div key={s.label} className="sb-stat">
            <span className="sb-stat-val">{s.value}</span>
            <span className="sb-stat-lbl">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="sb-toolbar">
        <input
          className="input-field sb-search"
          placeholder="Zoek op naam..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <select className="input-field sb-select" value={posFilter} onChange={e => setPosFilter(e.target.value)}>
          <option value="">Alle posities</option>
          {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <div className="sb-toggles">
          {(['all','active','inactive'] as const).map(v => (
            <button
              key={v}
              className={`sb-toggle ${activeFilter === v ? 'active' : ''}`}
              onClick={() => setActiveFilter(v)}
            >
              {v === 'all' ? 'Alle' : v === 'active' ? 'Actief' : 'Inactief'}
            </button>
          ))}
        </div>
        <div className="sb-sort-label">Sorteer:</div>
        {(['number','name','position'] as SortKey[]).map(k => (
          <button
            key={k}
            className={`sb-toggle ${sortKey === k ? 'active' : ''}`}
            onClick={() => setSortKey(k)}
          >
            {k === 'number' ? '#' : k === 'name' ? 'Naam' : 'Positie'}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="loading-spinner">Laden...</div>
      ) : displayed.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">👥</div>Geen spelers gevonden</div>
      ) : (
        <div className="card sb-table-wrap">
          {/* Desktop table */}
          <table className="data-table sb-table sb-desktop-only">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Naam</th>
                <th>Positie</th>
                <th style={{ width: 80 }}>Status</th>
                <th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(p => (
                <tr key={p.id} className={p.active !== 'true' ? 'sb-row-inactive' : ''}>
                  <td className="sb-num">{p.number ? `#${p.number}` : '—'}</td>
                  <td className="sb-name">{p.name}</td>
                  <td>
                    {p.position
                      ? <>
                          <span className={`sb-pos-badge sb-pos-${p.position}`}>{POSITION_FULL[p.position]}</span>
                          {p.position2 && <span className={`sb-pos-badge sb-pos-second sb-pos-${p.position2}`} title="Tweede positie">{POSITION_FULL[p.position2]}</span>}
                        </>
                      : <span className="sb-pos-none">—</span>}
                  </td>
                  <td><span className={`tag ${p.active === 'true' ? 'tag-green' : 'tag-black'}`}>{p.active === 'true' ? 'Actief' : 'Inactief'}</span></td>
                  <td>
                    <div className="sb-row-actions">
                      <button className="btn btn-ghost btn-sm" title="Bewerken" onClick={() => openEdit(p)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" title={p.active === 'true' ? 'Deactiveren' : 'Activeren'} onClick={() => handleToggleActive(p)}>{p.active === 'true' ? '🔴' : '🟢'}</button>
                      <button className="btn btn-ghost btn-sm" title="Verwijderen" onClick={() => setConfirmDelete(p)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="sb-mobile-list sb-mobile-only">
            {displayed.map(p => (
              <div key={p.id} className={`sb-mobile-card ${p.active !== 'true' ? 'sb-row-inactive' : ''}`}>
                <div className="sb-mobile-num">{p.number ? `#${p.number}` : '—'}</div>
                <div className="sb-mobile-info">
                  <div className="sb-mobile-name">{p.name}</div>
                  <div className="sb-mobile-meta">
                    {p.position && <span className={`sb-pos-badge sb-pos-${p.position}`}>{POSITION_FULL[p.position]}</span>}
                    {p.position2 && <span className={`sb-pos-badge sb-pos-second sb-pos-${p.position2}`} title="Tweede positie">{POSITION_FULL[p.position2]}</span>}
                    <span className={`tag ${p.active === 'true' ? 'tag-green' : 'tag-black'}`} style={{ fontSize: 10 }}>{p.active === 'true' ? 'Actief' : 'Inactief'}</span>
                  </div>
                </div>
                <div className="sb-row-actions" style={{ opacity: 1 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✏️</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(p)}>{p.active === 'true' ? '🔴' : '🟢'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(p)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Edit / Create modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">{editPlayer ? 'Speler bewerken' : 'Nieuwe speler'}</div>
            <div className="form-group">
              <label className="input-label">Naam *</label>
              <input
                className="input-field"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Voornaam Achternaam"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Rugnummer</label>
                <input
                  className="input-field"
                  type="number"
                  min={1} max={99}
                  value={form.number}
                  onChange={e => setForm({ ...form, number: e.target.value })}
                  placeholder="1 – 99"
                />
              </div>
              <div className="form-group">
                <label className="input-label">Positie</label>
                <select className="input-field" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                  <option value="">Kies positie...</option>
                  {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="input-label">Tweede positie</label>
                <select className="input-field" value={form.position2} onChange={e => setForm({ ...form, position2: e.target.value })}>
                  <option value="">Geen</option>
                  {POSITIONS.filter(p => p.value !== form.position).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            {editPlayer && (
              <div className="form-group">
                <label className="input-label">Status</label>
                <select className="input-field" value={form.active} onChange={e => setForm({ ...form, active: e.target.value })}>
                  <option value="true">Actief</option>
                  <option value="false">Inactief</option>
                </select>
              </div>
            )}
            {/* Admins can assign to any team; trainers auto-assign to their own team */}
            {isAdmin && !editPlayer && teams.length > 0 && (
              <div className="form-group">
                <label className="input-label">Ploeg</label>
                <select className="input-field" value={form.teamId} onChange={e => setForm({ ...form, teamId: e.target.value })}>
                  <option value="">— Geen ploeg —</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                  ))}
                </select>
              </div>
            )}
            {!isAdmin && !editPlayer && teamId && (
              <div className="adm-auto-team-hint">
                ↳ Wordt toegevoegd aan jouw ploeg
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Annuleer</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV import result ── */}
      {importResult && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setImportResult(null)}>
          <div className="modal">
            <div className="modal-title">CSV import resultaat</div>
            <p style={{ color: 'var(--green)', marginBottom: 8 }}>
              ✓ {importResult.rows.length} nieuwe speler{importResult.rows.length !== 1 ? 's' : ''} toegevoegd
              {importResult.updated.length > 0 && <>, {importResult.updated.length} bestaande bijgewerkt</>}
            </p>
            {importResult.errors.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: 'var(--red)', marginBottom: 6, fontFamily: 'var(--font-heading)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {importResult.errors.length} fout{importResult.errors.length !== 1 ? 'en' : ''}:
                </p>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, padding: '10px 12px', maxHeight: 200, overflowY: 'auto' }}>
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

      {/* ── Confirm delete modal ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-title">Speler verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.6 }}>
              Ben je zeker dat je <strong style={{ color: 'var(--white)' }}>{confirmDelete.name}</strong> wil verwijderen?
              Dit verwijdert ook alle gerelateerde aanwezigheids- en speeltijdgegevens.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }} onClick={async () => {
                await deletePlayer(confirmDelete.id);
                setConfirmDelete(null);
                await load();
              }}>
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
