import { useEffect, useMemo, useRef, useState } from 'react';
import { useTeam } from '../lib/TeamContext';
import {
  getPlayers, createPlayer, updatePlayer, deletePlayer,
  getTeams, Team, Player,
  exportPlayersCSV, importPlayersCSV,
  POSITION_FULL,
} from '../lib/api';
import './Spelers.css';

// Eenvoudige spelerslijst: naam, rugnummer, positie (+ tweede positie) en
// actief/inactief. Meer is niet nodig — de spelers dienen voor de selectie en
// de speeltijdberekening in de wedstrijdflow.

const POSITIONS = Object.entries(POSITION_FULL);

interface Form { name: string; number: string; position: string; position2: string; active: string; teamId: string }
const emptyForm = (teamId: string | null): Form =>
  ({ name: '', number: '', position: '', position2: '', active: 'true', teamId: teamId ?? '' });

export default function Spelers() {
  const { teamId, isAdmin } = useTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const [quick, setQuick] = useState({ number: '', name: '', position: '' });
  const [adding, setAdding] = useState(false);
  const quickNameRef = useRef<HTMLInputElement>(null);

  const [edit, setEdit] = useState<Player | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(teamId));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => { load(); }, [teamId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, t] = await Promise.all([
        getPlayers(teamId ?? undefined),
        isAdmin ? getTeams() : Promise.resolve([] as Team[]),
      ]);
      setPlayers(p);
      setTeams(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  const sorted = useMemo(() => {
    const list = players.filter(p => showInactive || p.active === 'true');
    return [...list].sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name));
  }, [players, showInactive]);
  const inactiveCount = players.filter(p => p.active !== 'true').length;

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quick.name.trim()) return;
    setAdding(true);
    try {
      await createPlayer({
        name: quick.name.trim(),
        number: quick.number ? parseInt(quick.number) : undefined,
        position: quick.position || undefined,
        teamId: teamId ?? undefined,
      });
      setQuick({ number: '', name: '', position: quick.position });
      await load();
      quickNameRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setAdding(false); }
  }

  function openEdit(p: Player) {
    setEdit(p);
    setConfirmDelete(false);
    setForm({
      name: p.name, number: p.number?.toString() ?? '', position: p.position ?? '',
      position2: p.position2 ?? '', active: p.active, teamId: p.team?.id ?? '',
    });
  }

  async function saveEdit() {
    if (!edit || !form.name.trim()) return;
    setSaving(true);
    try {
      const input: Record<string, unknown> = {
        name: form.name.trim(),
        number: form.number ? parseInt(form.number) : null,
        position: form.position || null,
        position2: form.position2 || null,
        active: form.active,
      };
      if (isAdmin && form.teamId) input.team = { connect: { id: form.teamId } };
      await updatePlayer(edit.id, input);
      setEdit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  }

  async function doDelete() {
    if (!edit) return;
    setSaving(true);
    try {
      await deletePlayer(edit.id);
      setEdit(null);
      await load();
    } finally { setSaving(false); }
  }

  async function handleImport(file: File) {
    try {
      const r = await importPlayersCSV(file, {
        existing: players,
        create: p => createPlayer({ ...p, teamId: teamId ?? undefined }),
        update: (id, p) => updatePlayer(id, p),
      });
      setImportMsg(`${r.rows.length} toegevoegd, ${r.updated.length} bijgewerkt` +
        (r.errors.length ? ` · ${r.errors.length} fout(en): ${r.errors.slice(0, 3).join('; ')}` : ''));
      await load();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page spelers-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Spelers</h1>
          <p className="page-subtitle">
            {players.filter(p => p.active === 'true').length} actieve spelers — basis voor selectie en speeltijd.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>CSV importeren</button>
          <button className="btn btn-outline btn-sm" onClick={() => exportPlayersCSV(players)} disabled={!players.length}>CSV exporteren</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
        </div>
      </div>

      {importMsg && <div className="sp-notice" onClick={() => setImportMsg(null)}>{importMsg}</div>}
      {error && <div className="sp-notice sp-notice-error" onClick={() => setError(null)}>{error}</div>}

      <form className="sp-quick card" onSubmit={quickAdd}>
        <input className="input-field sp-quick-num" inputMode="numeric" placeholder="Nr"
          value={quick.number} onChange={e => setQuick({ ...quick, number: e.target.value.replace(/\D/g, '') })} />
        <input ref={quickNameRef} className="input-field" placeholder="Naam nieuwe speler"
          value={quick.name} onChange={e => setQuick({ ...quick, name: e.target.value })} />
        <select className="input-field sp-quick-pos" value={quick.position}
          onChange={e => setQuick({ ...quick, position: e.target.value })}>
          <option value="">Positie</option>
          {POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn btn-primary" type="submit" disabled={adding || !quick.name.trim()}>
          {adding ? 'Toevoegen…' : '+ Toevoegen'}
        </button>
      </form>

      {inactiveCount > 0 && (
        <label className="sp-toggle">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Toon ook {inactiveCount} inactieve speler{inactiveCount !== 1 ? 's' : ''}
        </label>
      )}

      {loading ? (
        <div className="loading-spinner">Laden...</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state"><span className="empty-icon">👟</span>Nog geen spelers — voeg hierboven je eerste speler toe.</div>
      ) : (
        <div className="sp-grid">
          {sorted.map(p => (
            <button key={p.id} className={`sp-card ${p.active !== 'true' ? 'inactive' : ''}`} onClick={() => openEdit(p)}>
              <span className={`sp-shirt pos-${p.position ?? 'none'}`}>{p.number ?? '–'}</span>
              <span className="sp-info">
                <span className="sp-name">{p.name}</span>
                <span className="sp-pos">
                  {p.position ? POSITION_FULL[p.position] ?? p.position : 'Geen positie'}
                  {p.position2 && ` · ${POSITION_FULL[p.position2] ?? p.position2}`}
                  {p.active !== 'true' && ' · inactief'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {edit && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEdit(null)}>
          <div className="modal">
            <div className="modal-title">{confirmDelete ? 'Speler verwijderen?' : 'Speler bewerken'}</div>
            {confirmDelete ? (
              <>
                <p style={{ color: 'var(--text-mid)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--white)' }}>{edit.name}</strong> en alle speeltijdgegevens van deze speler worden verwijderd.
                  Tip: zet de speler liever op <em>inactief</em> om de historiek te bewaren.
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={() => setConfirmDelete(false)}>Annuleer</button>
                  <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={doDelete} disabled={saving}>Verwijderen</button>
                </div>
              </>
            ) : (
              <>
                <div className="form-row" style={{ gridTemplateColumns: '90px 1fr' }}>
                  <div className="form-group">
                    <label className="input-label">Nr</label>
                    <input className="input-field" inputMode="numeric" value={form.number}
                      onChange={e => setForm({ ...form, number: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Naam</label>
                    <input className="input-field" value={form.name} autoFocus
                      onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="input-label">Positie</label>
                    <select className="input-field" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                      <option value="">—</option>
                      {POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="input-label">Tweede positie</label>
                    <select className="input-field" value={form.position2} onChange={e => setForm({ ...form, position2: e.target.value })}>
                      <option value="">—</option>
                      {POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                {isAdmin && teams.length > 0 && (
                  <div className="form-group">
                    <label className="input-label">Ploeg</label>
                    <select className="input-field" value={form.teamId} onChange={e => setForm({ ...form, teamId: e.target.value })}>
                      <option value="">—</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
                    </select>
                  </div>
                )}
                <label className="sp-toggle" style={{ margin: '4px 0 0' }}>
                  <input type="checkbox" checked={form.active === 'true'}
                    onChange={e => setForm({ ...form, active: e.target.checked ? 'true' : 'false' })} />
                  Actief (komt in aanmerking voor selectie)
                </label>
                <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                  <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Verwijderen</button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-outline" onClick={() => setEdit(null)}>Annuleer</button>
                    <button className="btn btn-primary" onClick={saveEdit} disabled={saving || !form.name.trim()}>
                      {saving ? 'Opslaan…' : 'Opslaan'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
