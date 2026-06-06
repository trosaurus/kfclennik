import { useEffect, useState } from 'react';
import {
  getTeams, createTeam, updateTeam, deleteTeam, Team,
  getTrainers, createTrainer, updateTrainer, deleteTrainer, TrainerRecord,
  getAllPlayersWithTeam, assignPlayerToTeam, bulkAssignPlayersToTeam, PlayerWithTeam,
  createPlayer, deletePlayer,
  POSITION_LABELS, POSITION_FULL, POSITIONS,
} from '../lib/api';
import { useTeam } from '../lib/TeamContext';
import './Admin.css';

const CATEGORIES = ['U6','U7','U8','U9','U10','U11','U12','U13','U15','U17'];
const FORMAT_MAP: Record<string,string> = {
  U6:'2v2', U7:'3v3', U8:'5v5', U9:'5v5',
  U10:'8v8', U11:'8v8', U12:'8v8',
  U13:'11v11', U15:'11v11', U17:'11v11',
};

type Tab = 'teams' | 'trainers' | 'players';

export default function Admin() {
  const { trainer: currentTrainer } = useTeam();
  const [teams, setTeams]       = useState<Team[]>([]);
  const [trainers, setTrainers] = useState<TrainerRecord[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerWithTeam[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>('teams');

  // ── Team form state ───────────────────────────────────────────────────────
  const [teamModal, setTeamModal] = useState(false);
  const [editTeam, setEditTeam]   = useState<Team | null>(null);
  const [teamForm, setTeamForm]   = useState({ name: '', category: 'U8', club: '' });
  const [saving, setSaving]       = useState(false);

  // ── Trainer form state ────────────────────────────────────────────────────
  const [trainerModal, setTrainerModal]   = useState(false);
  const [editTrainer, setEditTrainer]     = useState<TrainerRecord | null>(null);
  const [trainerForm, setTrainerForm]     = useState({ name: '', email: '', password: '', role: 'trainer', teamId: '' });
  const [trainerSaving, setTrainerSaving] = useState(false);
  const [error, setError]                 = useState('');
  const [confirmDelete, setConfirmDelete] = useState<TrainerRecord | null>(null);

  // ── Player tab state ──────────────────────────────────────────────────────
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [bulkTeamId, setBulkTeamId]    = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [playerModal, setPlayerModal]  = useState(false);
  const [playerForm, setPlayerForm]    = useState({ name: '', number: '', position: '', teamId: '' });
  const [playerSaving, setPlayerSaving] = useState(false);
  const [assigningPlayer, setAssigningPlayer] = useState<string | null>(null);
  const [playerConfirmDelete, setPlayerConfirmDelete] = useState<PlayerWithTeam | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [t, tr, p] = await Promise.all([getTeams(), getTrainers(), getAllPlayersWithTeam()]);
      setTeams(t); setTrainers(tr); setAllPlayers(p);
    } finally { setLoading(false); }
  }

  // ── Team CRUD ──────────────────────────────────────────────────────────────

  function openTeamCreate() {
    setEditTeam(null); setTeamForm({ name: '', category: 'U8', club: '' }); setError(''); setTeamModal(true);
  }
  function openTeamEdit(t: Team) {
    setEditTeam(t); setTeamForm({ name: t.name, category: t.category, club: t.club }); setError(''); setTeamModal(true);
  }
  async function handleSaveTeam() {
    if (!teamForm.name) return;
    setSaving(true); setError('');
    try {
      if (editTeam) await updateTeam(editTeam.id, { name: teamForm.name, category: teamForm.category, club: teamForm.club });
      else await createTeam({ name: teamForm.name, category: teamForm.category, club: teamForm.club });
      setTeamModal(false); await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'Fout'); } finally { setSaving(false); }
  }
  async function handleDeleteTeam(t: Team) {
    if (!confirm(`Ploeg "${t.name}" verwijderen?`)) return;
    await deleteTeam(t.id); await load();
  }

  // ── Trainer CRUD ───────────────────────────────────────────────────────────

  function openTrainerCreate() {
    setEditTrainer(null); setTrainerForm({ name: '', email: '', password: '', role: 'trainer', teamId: '' }); setError(''); setTrainerModal(true);
  }
  function openTrainerEdit(tr: TrainerRecord) {
    setEditTrainer(tr); setTrainerForm({ name: tr.name, email: tr.email, password: '', role: tr.role, teamId: tr.team?.id ?? '' }); setError(''); setTrainerModal(true);
  }
  async function handleSaveTrainer() {
    if (!trainerForm.name || !trainerForm.email) return;
    if (!editTrainer && !trainerForm.password) return;
    setTrainerSaving(true); setError('');
    try {
      if (editTrainer) {
        const d: Record<string, unknown> = { name: trainerForm.name, email: trainerForm.email, role: trainerForm.role };
        if (trainerForm.password) d.password = trainerForm.password;
        d.team = trainerForm.teamId ? { connect: { id: trainerForm.teamId } } : { disconnect: true };
        await updateTrainer(editTrainer.id, d);
      } else {
        await createTrainer({ name: trainerForm.name, email: trainerForm.email, password: trainerForm.password, role: trainerForm.role, teamId: trainerForm.teamId || undefined });
      }
      setTrainerModal(false); await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'Fout'); } finally { setTrainerSaving(false); }
  }
  async function handleDeleteTrainer(tr: TrainerRecord) {
    if (tr.id === currentTrainer?.id) { alert('Je kunt je eigen account niet verwijderen.'); return; }
    setConfirmDelete(null); await deleteTrainer(tr.id); await load();
  }
  async function handleAssignTrainerTeam(trainerId: string, teamId: string) {
    try {
      const d: Record<string, unknown> = teamId ? { team: { connect: { id: teamId } } } : { team: { disconnect: true } };
      await updateTrainer(trainerId, d); await load();
    } catch (e) { alert('Fout: ' + (e instanceof Error ? e.message : '')); }
  }

  // ── Player management ─────────────────────────────────────────────────────

  async function handleAssignPlayer(playerId: string, teamId: string) {
    setAssigningPlayer(playerId);
    try {
      await assignPlayerToTeam(playerId, teamId || null);
      await load();
    } catch (e) { alert('Fout: ' + (e instanceof Error ? e.message : '')); }
    finally { setAssigningPlayer(null); }
  }

  async function handleBulkAssign() {
    if (!bulkTeamId || selectedPlayers.size === 0) return;
    setBulkAssigning(true);
    try {
      await bulkAssignPlayersToTeam(Array.from(selectedPlayers), bulkTeamId);
      setSelectedPlayers(new Set()); setBulkTeamId('');
      await load();
    } catch (e) { alert('Fout: ' + (e instanceof Error ? e.message : '')); }
    finally { setBulkAssigning(false); }
  }

  function togglePlayerSelect(pid: string) {
    setSelectedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  function selectAllInTeam(teamId: string | null) {
    const ids = allPlayers
      .filter(p => (teamId ? p.team?.id === teamId : !p.team))
      .filter(p => matchSearch(p))
      .map(p => p.id);
    setSelectedPlayers(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
  }

  async function handleCreatePlayer() {
    if (!playerForm.name) return;
    setPlayerSaving(true); setError('');
    try {
      const input: Record<string, unknown> = { name: playerForm.name, active: 'true' };
      if (playerForm.number) input.number = parseInt(playerForm.number);
      if (playerForm.position) input.position = playerForm.position;
      if (playerForm.teamId) input.teamId = playerForm.teamId;
      await createPlayer(input as any);
      setPlayerModal(false); await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'Fout'); } finally { setPlayerSaving(false); }
  }

  async function handleDeletePlayer(p: PlayerWithTeam) {
    setPlayerConfirmDelete(null);
    await deletePlayer(p.id); await load();
  }

  function matchSearch(p: PlayerWithTeam) {
    if (!playerSearch) return true;
    const q = playerSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.number?.toString() ?? '').includes(q);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getTrainersForTeam(teamId: string) { return trainers.filter(tr => tr.team?.id === teamId); }
  function getUnassignedTrainers() { return trainers.filter(tr => !tr.team); }
  function getPlayersForTeam(teamId: string) { return allPlayers.filter(p => p.team?.id === teamId && matchSearch(p)); }
  function getUnassignedPlayers() { return allPlayers.filter(p => !p.team && matchSearch(p)); }

  if (loading) return <div className="page"><div className="loading-spinner">Laden...</div></div>;

  return (
    <div className="page">
      <div className="adm-header">
        <div>
          <h1 className="page-title">Beheer</h1>
          <p className="page-subtitle">Ploegen, Trainers & Spelers</p>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="adm-tabs">
        {([
          { key: 'teams' as Tab,    icon: '🏆', label: 'Ploegen',   count: teams.length },
          { key: 'trainers' as Tab, icon: '👤', label: 'Trainers',  count: trainers.length },
          { key: 'players' as Tab,  icon: '👥', label: 'Spelers',   count: allPlayers.length },
        ]).map(t => (
          <button key={t.key} className={`adm-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label} <span className="adm-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── PLOEGEN TAB ────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'teams' && (
        <div>
          <div className="adm-toolbar">
            <button className="btn btn-primary" onClick={openTeamCreate}>+ Nieuwe ploeg</button>
          </div>
          {teams.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🏆</div>Nog geen ploegen</div>
          ) : (
            <div className="adm-team-grid">
              {teams.map(t => {
                const teamTrainers = getTrainersForTeam(t.id);
                const teamPlayers = allPlayers.filter(p => p.team?.id === t.id);
                return (
                  <div key={t.id} className="adm-team-card card">
                    <div className="adm-tc-header">
                      <span className="adm-tc-cat">{t.category}</span>
                      <span className="adm-tc-format">{FORMAT_MAP[t.category]}</span>
                      <span className="adm-tc-player-count">{teamPlayers.length} spelers</span>
                      <div className="adm-tc-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openTeamEdit(t)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteTeam(t)}>🗑️</button>
                      </div>
                    </div>
                    <div className="adm-tc-body">
                      <div className="adm-tc-name">{t.name}</div>
                      {t.club && <div className="adm-tc-club">{t.club}</div>}
                    </div>
                    <div className="adm-tc-trainers">
                      <div className="adm-tc-trainers-label">Trainers <span className="adm-tc-trainers-count">{teamTrainers.length}</span></div>
                      {teamTrainers.length === 0 ? (
                        <div className="adm-tc-no-trainer">Geen trainer gekoppeld</div>
                      ) : teamTrainers.map(tr => (
                        <div key={tr.id} className="adm-tc-trainer-row">
                          <span className="adm-tc-trainer-icon">👤</span>
                          <span className="adm-tc-trainer-name">{tr.name}</span>
                          <span className={`tag ${tr.role === 'admin' ? 'tag-red' : 'tag-black'}`}>{tr.role}</span>
                          <button className="adm-tc-unlink" title="Ontkoppel" onClick={() => handleAssignTrainerTeam(tr.id, '')}>✕</button>
                        </div>
                      ))}
                      {getUnassignedTrainers().length > 0 && (
                        <select className="input-field adm-tc-add-select" value=""
                          onChange={e => e.target.value && handleAssignTrainerTeam(e.target.value, t.id)}>
                          <option value="">+ Trainer koppelen...</option>
                          {getUnassignedTrainers().map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── TRAINERS TAB ───────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'trainers' && (
        <div>
          <div className="adm-toolbar">
            <button className="btn btn-primary" onClick={openTrainerCreate}>+ Nieuwe trainer</button>
          </div>
          {trainers.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">👤</div>Nog geen trainers</div>
          ) : (
            <div className="adm-trainer-grid">
              {trainers.map(tr => {
                const isSelf = tr.id === currentTrainer?.id;
                return (
                  <div key={tr.id} className={`adm-trainer-card card ${isSelf ? 'self' : ''}`}>
                    <div className="adm-trc-top">
                      <div className="adm-trc-avatar">{tr.name.charAt(0).toUpperCase()}</div>
                      <div className="adm-trc-info">
                        <div className="adm-trc-name">{tr.name}{isSelf && <span className="adm-trc-self-badge">JIJ</span>}</div>
                        <div className="adm-trc-email">{tr.email}</div>
                      </div>
                      <span className={`tag ${tr.role === 'admin' ? 'tag-red' : 'tag-black'}`}>{tr.role}</span>
                    </div>
                    <div className="adm-trc-team-section">
                      <div className="adm-trc-team-label">Ploeg</div>
                      <select className="input-field adm-trc-team-select" value={tr.team?.id ?? ''}
                        onChange={e => handleAssignTrainerTeam(tr.id, e.target.value)}>
                        <option value="">— Geen ploeg —</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
                      </select>
                      {tr.team && (
                        <div className="adm-trc-team-info">
                          <span className="adm-trc-team-cat">{tr.team.category}</span>
                          <span className="adm-trc-team-name">{tr.team.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="adm-trc-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openTrainerEdit(tr)}>✏️ Bewerken</button>
                      {!isSelf && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete(tr)}>🗑️ Verwijderen</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── SPELERS TAB ────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'players' && (
        <div>
          {/* Toolbar */}
          <div className="adm-toolbar adm-players-toolbar">
            <input className="input-field adm-player-search" placeholder="Zoek speler..."
              value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} />
            <button className="btn btn-primary" onClick={() => {
              setPlayerForm({ name: '', number: '', position: '', teamId: '' });
              setError(''); setPlayerModal(true);
            }}>+ Nieuwe speler</button>
          </div>

          {/* Bulk actions bar */}
          {selectedPlayers.size > 0 && (
            <div className="adm-bulk-bar">
              <span className="adm-bulk-count">{selectedPlayers.size} geselecteerd</span>
              <select className="input-field adm-bulk-select" value={bulkTeamId}
                onChange={e => setBulkTeamId(e.target.value)}>
                <option value="">Verplaats naar ploeg...</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
              </select>
              <button className="btn btn-primary btn-sm" disabled={!bulkTeamId || bulkAssigning}
                onClick={handleBulkAssign}>{bulkAssigning ? 'Bezig...' : 'Verplaats'}</button>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedPlayers(new Set())}>Deselecteer</button>
            </div>
          )}

          {/* Team columns — board-style view */}
          <div className="adm-player-board">
            {/* One column per team */}
            {teams.map(t => {
              const teamPlayers = getPlayersForTeam(t.id);
              return (
                <div key={t.id} className="adm-pb-column card">
                  <div className="adm-pb-col-header">
                    <span className="adm-pb-col-cat">{t.category}</span>
                    <span className="adm-pb-col-name">{t.name}</span>
                    <span className="adm-pb-col-count">{teamPlayers.length}</span>
                    <button className="adm-pb-select-all" onClick={() => selectAllInTeam(t.id)} title="Selecteer alle">☑</button>
                  </div>
                  <div className="adm-pb-col-body">
                    {teamPlayers.length === 0 ? (
                      <div className="adm-pb-empty">Geen spelers</div>
                    ) : teamPlayers.map(p => (
                      <PlayerRow key={p.id} player={p} teams={teams} selected={selectedPlayers.has(p.id)}
                        assigning={assigningPlayer === p.id}
                        onToggleSelect={() => togglePlayerSelect(p.id)}
                        onAssign={(tid) => handleAssignPlayer(p.id, tid)}
                        onDelete={() => setPlayerConfirmDelete(p)} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Unassigned column */}
            {(() => {
              const unassigned = getUnassignedPlayers();
              return (
                <div className="adm-pb-column adm-pb-unassigned card">
                  <div className="adm-pb-col-header">
                    <span className="adm-pb-col-cat" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>?</span>
                    <span className="adm-pb-col-name">Niet gekoppeld</span>
                    <span className="adm-pb-col-count">{unassigned.length}</span>
                    {unassigned.length > 0 && (
                      <button className="adm-pb-select-all" onClick={() => selectAllInTeam(null)}>☑</button>
                    )}
                  </div>
                  <div className="adm-pb-col-body">
                    {unassigned.length === 0 ? (
                      <div className="adm-pb-empty">Alle spelers zijn gekoppeld ✓</div>
                    ) : unassigned.map(p => (
                      <PlayerRow key={p.id} player={p} teams={teams} selected={selectedPlayers.has(p.id)}
                        assigning={assigningPlayer === p.id}
                        onToggleSelect={() => togglePlayerSelect(p.id)}
                        onAssign={(tid) => handleAssignPlayer(p.id, tid)}
                        onDelete={() => setPlayerConfirmDelete(p)} />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* Team modal */}
      {teamModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTeamModal(false)}>
          <div className="modal">
            <div className="modal-title">{editTeam ? 'Ploeg bewerken' : 'Nieuwe ploeg'}</div>
            <div className="form-group">
              <label className="input-label">Ploegnaam *</label>
              <input className="input-field" autoFocus value={teamForm.name}
                onChange={e => setTeamForm({...teamForm, name: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && handleSaveTeam()} placeholder="bv. KFC Lennik U10A" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Categorie *</label>
                <select className="input-field" value={teamForm.category}
                  onChange={e => setTeamForm({...teamForm, category: e.target.value})}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c} ({FORMAT_MAP[c]})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="input-label">Club</label>
                <input className="input-field" value={teamForm.club}
                  onChange={e => setTeamForm({...teamForm, club: e.target.value})} placeholder="KFC Lennik" />
              </div>
            </div>
            {error && <div className="adm-error">⚠ {error}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setTeamModal(false)}>Annuleer</button>
              <button className="btn btn-primary" disabled={saving || !teamForm.name} onClick={handleSaveTeam}>
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trainer modal */}
      {trainerModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTrainerModal(false)}>
          <div className="modal">
            <div className="modal-title">{editTrainer ? 'Trainer bewerken' : 'Nieuwe trainer'}</div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Naam *</label>
                <input className="input-field" autoFocus value={trainerForm.name}
                  onChange={e => setTrainerForm({...trainerForm, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="input-label">E-mail *</label>
                <input type="email" className="input-field" value={trainerForm.email}
                  onChange={e => setTrainerForm({...trainerForm, email: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">{editTrainer ? 'Nieuw wachtwoord (optioneel)' : 'Wachtwoord *'}</label>
                <input type="password" className="input-field" value={trainerForm.password}
                  onChange={e => setTrainerForm({...trainerForm, password: e.target.value})}
                  placeholder={editTrainer ? '••••••••' : ''} />
              </div>
              <div className="form-group">
                <label className="input-label">Rol</label>
                <select className="input-field" value={trainerForm.role}
                  onChange={e => setTrainerForm({...trainerForm, role: e.target.value})}>
                  <option value="trainer">Trainer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">Ploeg</label>
              <select className="input-field" value={trainerForm.teamId}
                onChange={e => setTrainerForm({...trainerForm, teamId: e.target.value})}>
                <option value="">— Geen ploeg —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
              </select>
            </div>
            {error && <div className="adm-error">⚠ {error}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setTrainerModal(false)}>Annuleer</button>
              <button className="btn btn-primary"
                disabled={trainerSaving || !trainerForm.name || !trainerForm.email || (!editTrainer && !trainerForm.password)}
                onClick={handleSaveTrainer}>{trainerSaving ? 'Opslaan...' : editTrainer ? 'Opslaan' : 'Aanmaken'}</button>
            </div>
          </div>
        </div>
      )}

      {/* New player modal */}
      {playerModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPlayerModal(false)}>
          <div className="modal">
            <div className="modal-title">Nieuwe speler</div>
            <div className="form-group">
              <label className="input-label">Naam *</label>
              <input className="input-field" autoFocus value={playerForm.name}
                onChange={e => setPlayerForm({...playerForm, name: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && handleCreatePlayer()} placeholder="Voornaam Achternaam" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Rugnummer</label>
                <input type="number" className="input-field" value={playerForm.number}
                  onChange={e => setPlayerForm({...playerForm, number: e.target.value})} min={1} max={99} />
              </div>
              <div className="form-group">
                <label className="input-label">Positie</label>
                <select className="input-field" value={playerForm.position}
                  onChange={e => setPlayerForm({...playerForm, position: e.target.value})}>
                  <option value="">Kies...</option>
                  {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">Koppel aan ploeg</label>
              <select className="input-field" value={playerForm.teamId}
                onChange={e => setPlayerForm({...playerForm, teamId: e.target.value})}>
                <option value="">— Geen ploeg —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
              </select>
            </div>
            {error && <div className="adm-error">⚠ {error}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setPlayerModal(false)}>Annuleer</button>
              <button className="btn btn-primary" disabled={playerSaving || !playerForm.name}
                onClick={handleCreatePlayer}>{playerSaving ? 'Aanmaken...' : 'Aanmaken'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirms */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-title">Trainer verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--white)' }}>{confirmDelete.name}</strong> ({confirmDelete.email}) verwijderen?
              {confirmDelete.team && <><br/>Gekoppeld aan <strong style={{ color: 'var(--red)' }}>{confirmDelete.team.name}</strong>.</>}
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }}
                onClick={() => handleDeleteTrainer(confirmDelete)}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}

      {playerConfirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPlayerConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-title">Speler verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--white)' }}>{playerConfirmDelete.name}</strong> verwijderen?
              Alle speeltijden en doelpunten gaan verloren.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setPlayerConfirmDelete(null)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }}
                onClick={() => handleDeletePlayer(playerConfirmDelete)}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Player row component for the board ──────────────────────────────────────

function PlayerRow({ player, teams, selected, assigning, onToggleSelect, onAssign, onDelete }: {
  player: PlayerWithTeam; teams: Team[];
  selected: boolean; assigning: boolean;
  onToggleSelect: () => void;
  onAssign: (teamId: string) => void;
  onDelete: () => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className={`adm-pb-player ${selected ? 'selected' : ''} ${assigning ? 'assigning' : ''}`}>
      {/* Checkbox */}
      <button className={`adm-pb-check ${selected ? 'on' : ''}`} onClick={onToggleSelect}>
        {selected ? '✓' : ''}
      </button>

      {/* Number */}
      <span className="adm-pb-num">{player.number ? `#${player.number}` : '—'}</span>

      {/* Name + position */}
      <div className="adm-pb-info">
        <span className="adm-pb-name">{player.name}</span>
        {player.position && <span className="adm-pb-pos">{POSITION_LABELS[player.position]}</span>}
      </div>

      {/* Team assign dropdown */}
      <div className="adm-pb-assign">
        {showDropdown ? (
          <select className="input-field adm-pb-assign-select" autoFocus
            value={player.team?.id ?? ''}
            onChange={e => { setShowDropdown(false); onAssign(e.target.value); }}
            onBlur={() => setShowDropdown(false)}>
            <option value="">— Geen ploeg —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
          </select>
        ) : (
          <button className="adm-pb-assign-btn" onClick={() => setShowDropdown(true)} title="Verplaats naar andere ploeg">
            ↔
          </button>
        )}
      </div>

      {/* Delete */}
      <button className="adm-pb-delete" onClick={onDelete} title="Verwijderen">🗑️</button>
    </div>
  );
}
