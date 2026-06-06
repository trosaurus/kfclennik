import { useEffect, useState } from 'react';
import {
  getTeams, createTeam, updateTeam, deleteTeam, Team,
  getTrainers, createTrainer, updateTrainer, deleteTrainer, TrainerRecord,
} from '../lib/api';
import { useTeam } from '../lib/TeamContext';
import './Admin.css';

const CATEGORIES = ['U6','U7','U8','U9','U10','U11','U12','U13','U15','U17'];
const FORMAT_MAP: Record<string,string> = {
  U6:'2v2', U7:'3v3', U8:'5v5', U9:'5v5',
  U10:'8v8', U11:'8v8', U12:'8v8',
  U13:'11v11', U15:'11v11', U17:'11v11',
};

export default function Admin() {
  const { trainer: currentTrainer } = useTeam();
  const [teams, setTeams]       = useState<Team[]>([]);
  const [trainers, setTrainers] = useState<TrainerRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'teams'|'trainers'>('teams');

  // Team form
  const [teamModal, setTeamModal] = useState(false);
  const [editTeam, setEditTeam]   = useState<Team | null>(null);
  const [teamForm, setTeamForm]   = useState({ name: '', category: 'U8', club: '' });
  const [saving, setSaving]       = useState(false);

  // Trainer form
  const [trainerModal, setTrainerModal]   = useState(false);
  const [editTrainer, setEditTrainer]     = useState<TrainerRecord | null>(null);
  const [trainerForm, setTrainerForm]     = useState({ name: '', email: '', password: '', role: 'trainer', teamId: '' });
  const [trainerSaving, setTrainerSaving] = useState(false);
  const [error, setError]                 = useState('');
  const [confirmDelete, setConfirmDelete] = useState<TrainerRecord | null>(null);

  // Inline team assignment
  const [assigningTrainer, setAssigningTrainer] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [t, tr] = await Promise.all([getTeams(), getTrainers()]);
      setTeams(t); setTrainers(tr);
    } finally { setLoading(false); }
  }

  // ── Team CRUD ──────────────────────────────────────────────────────────────

  function openTeamCreate() {
    setEditTeam(null);
    setTeamForm({ name: '', category: 'U8', club: '' });
    setError('');
    setTeamModal(true);
  }

  function openTeamEdit(t: Team) {
    setEditTeam(t);
    setTeamForm({ name: t.name, category: t.category, club: t.club });
    setError('');
    setTeamModal(true);
  }

  async function handleSaveTeam() {
    if (!teamForm.name) return;
    setSaving(true); setError('');
    try {
      if (editTeam) {
        await updateTeam(editTeam.id, { name: teamForm.name, category: teamForm.category, club: teamForm.club });
      } else {
        await createTeam({ name: teamForm.name, category: teamForm.category, club: teamForm.club });
      }
      setTeamModal(false);
      await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'Fout'); }
    finally { setSaving(false); }
  }

  async function handleDeleteTeam(t: Team) {
    if (!confirm(`Ploeg "${t.name}" verwijderen? Alle gekoppelde spelers en wedstrijden worden ontkoppeld.`)) return;
    await deleteTeam(t.id);
    await load();
  }

  // ── Trainer CRUD ───────────────────────────────────────────────────────────

  function openTrainerCreate() {
    setEditTrainer(null);
    setTrainerForm({ name: '', email: '', password: '', role: 'trainer', teamId: '' });
    setError('');
    setTrainerModal(true);
  }

  function openTrainerEdit(tr: TrainerRecord) {
    setEditTrainer(tr);
    setTrainerForm({
      name: tr.name,
      email: tr.email,
      password: '',  // leave empty = don't change
      role: tr.role,
      teamId: tr.team?.id ?? '',
    });
    setError('');
    setTrainerModal(true);
  }

  async function handleSaveTrainer() {
    if (!trainerForm.name || !trainerForm.email) return;
    if (!editTrainer && !trainerForm.password) return; // password required for new trainers
    setTrainerSaving(true); setError('');
    try {
      if (editTrainer) {
        // Update existing trainer
        const updateData: Record<string, unknown> = {
          name: trainerForm.name,
          email: trainerForm.email,
          role: trainerForm.role,
        };
        if (trainerForm.password) updateData.password = trainerForm.password;
        if (trainerForm.teamId) {
          updateData.team = { connect: { id: trainerForm.teamId } };
        } else {
          updateData.team = { disconnect: true };
        }
        await updateTrainer(editTrainer.id, updateData);
      } else {
        // Create new
        await createTrainer({
          name: trainerForm.name,
          email: trainerForm.email,
          password: trainerForm.password,
          role: trainerForm.role,
          teamId: trainerForm.teamId || undefined,
        });
      }
      setTrainerModal(false);
      await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'Fout'); }
    finally { setTrainerSaving(false); }
  }

  async function handleDeleteTrainer(tr: TrainerRecord) {
    if (tr.id === currentTrainer?.id) {
      alert('Je kunt je eigen account niet verwijderen.');
      return;
    }
    setConfirmDelete(null);
    await deleteTrainer(tr.id);
    await load();
  }

  // ── Inline team assignment ─────────────────────────────────────────────────

  async function handleAssignTeam(trainerId: string, teamId: string) {
    setAssigningTrainer(trainerId);
    try {
      if (teamId) {
        await updateTrainer(trainerId, { team: { connect: { id: teamId } } });
      } else {
        await updateTrainer(trainerId, { team: { disconnect: true } });
      }
      await load();
    } catch (e) {
      alert('Fout bij koppelen: ' + (e instanceof Error ? e.message : 'onbekend'));
    } finally { setAssigningTrainer(null); }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getTrainersForTeam(teamId: string) {
    return trainers.filter(tr => tr.team?.id === teamId);
  }

  function getUnassignedTrainers() {
    return trainers.filter(tr => !tr.team);
  }

  if (loading) return <div className="page"><div className="loading-spinner">Laden...</div></div>;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="adm-header">
        <div>
          <h1 className="page-title">Beheer</h1>
          <p className="page-subtitle">Ploegen, Trainers & Koppelingen</p>
        </div>
      </div>

      <div className="adm-tabs">
        <button className={`adm-tab ${tab==='teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>
          🏆 Ploegen <span className="adm-tab-count">{teams.length}</span>
        </button>
        <button className={`adm-tab ${tab==='trainers' ? 'active' : ''}`} onClick={() => setTab('trainers')}>
          👤 Trainers <span className="adm-tab-count">{trainers.length}</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── PLOEGEN TAB ─────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'teams' && (
        <div>
          <div className="adm-toolbar">
            <button className="btn btn-primary" onClick={openTeamCreate}>+ Nieuwe ploeg</button>
          </div>

          {teams.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🏆</div>Nog geen ploegen aangemaakt</div>
          ) : (
            <div className="adm-team-grid">
              {teams.map(t => {
                const teamTrainers = getTrainersForTeam(t.id);
                return (
                  <div key={t.id} className="adm-team-card card">
                    {/* Header bar */}
                    <div className="adm-tc-header">
                      <span className="adm-tc-cat">{t.category}</span>
                      <span className="adm-tc-format">{FORMAT_MAP[t.category]}</span>
                      <div className="adm-tc-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openTeamEdit(t)} title="Bewerken">✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteTeam(t)} title="Verwijderen">🗑️</button>
                      </div>
                    </div>

                    {/* Team info */}
                    <div className="adm-tc-body">
                      <div className="adm-tc-name">{t.name}</div>
                      {t.club && <div className="adm-tc-club">{t.club}</div>}
                    </div>

                    {/* Gekoppelde trainers */}
                    <div className="adm-tc-trainers">
                      <div className="adm-tc-trainers-label">
                        Trainers
                        <span className="adm-tc-trainers-count">{teamTrainers.length}</span>
                      </div>
                      {teamTrainers.length === 0 ? (
                        <div className="adm-tc-no-trainer">Geen trainer gekoppeld</div>
                      ) : (
                        teamTrainers.map(tr => (
                          <div key={tr.id} className="adm-tc-trainer-row">
                            <span className="adm-tc-trainer-icon">👤</span>
                            <span className="adm-tc-trainer-name">{tr.name}</span>
                            <span className="adm-tc-trainer-email">{tr.email}</span>
                            <span className={`tag ${tr.role === 'admin' ? 'tag-red' : 'tag-black'}`}>{tr.role === 'admin' ? 'Admin' : 'Trainer'}</span>
                            <button
                              className="adm-tc-unlink"
                              title="Ontkoppel van ploeg"
                              onClick={() => handleAssignTeam(tr.id, '')}
                            >✕</button>
                          </div>
                        ))
                      )}

                      {/* Quick-add trainer dropdown */}
                      {getUnassignedTrainers().length > 0 && (
                        <div className="adm-tc-add-trainer">
                          <select
                            className="input-field adm-tc-add-select"
                            value=""
                            onChange={e => {
                              if (e.target.value) handleAssignTeam(e.target.value, t.id);
                            }}
                            disabled={assigningTrainer !== null}
                          >
                            <option value="">+ Trainer koppelen...</option>
                            {getUnassignedTrainers().map(tr => (
                              <option key={tr.id} value={tr.id}>{tr.name} ({tr.email})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Unassigned trainers warning */}
          {getUnassignedTrainers().length > 0 && (
            <div className="adm-unassigned-banner">
              <span className="adm-unassigned-icon">⚠</span>
              <span>{getUnassignedTrainers().length} trainer{getUnassignedTrainers().length !== 1 ? 's' : ''} zonder ploeg: </span>
              {getUnassignedTrainers().map((tr, i) => (
                <span key={tr.id}>
                  {i > 0 && ', '}
                  <strong>{tr.name}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── TRAINERS TAB ────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'trainers' && (
        <div>
          <div className="adm-toolbar">
            <button className="btn btn-primary" onClick={openTrainerCreate}>+ Nieuwe trainer</button>
          </div>

          {trainers.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">👤</div>Nog geen trainers aangemaakt</div>
          ) : (
            <div className="adm-trainer-grid">
              {trainers.map(tr => {
                const isSelf = tr.id === currentTrainer?.id;
                return (
                  <div key={tr.id} className={`adm-trainer-card card ${isSelf ? 'self' : ''}`}>
                    {/* Top */}
                    <div className="adm-trc-top">
                      <div className="adm-trc-avatar">{tr.name.charAt(0).toUpperCase()}</div>
                      <div className="adm-trc-info">
                        <div className="adm-trc-name">
                          {tr.name}
                          {isSelf && <span className="adm-trc-self-badge">JIJ</span>}
                        </div>
                        <div className="adm-trc-email">{tr.email}</div>
                      </div>
                      <span className={`tag ${tr.role === 'admin' ? 'tag-red' : 'tag-black'}`}>
                        {tr.role === 'admin' ? 'Admin' : 'Trainer'}
                      </span>
                    </div>

                    {/* Team assignment */}
                    <div className="adm-trc-team-section">
                      <div className="adm-trc-team-label">Ploeg</div>
                      <select
                        className="input-field adm-trc-team-select"
                        value={tr.team?.id ?? ''}
                        onChange={e => handleAssignTeam(tr.id, e.target.value)}
                        disabled={assigningTrainer === tr.id}
                      >
                        <option value="">— Geen ploeg —</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.category} · {FORMAT_MAP[t.category]})</option>
                        ))}
                      </select>
                      {tr.team && (
                        <div className="adm-trc-team-info">
                          <span className="adm-trc-team-cat">{tr.team.category}</span>
                          <span className="adm-trc-team-name">{tr.team.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="adm-trc-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openTrainerEdit(tr)}>✏️ Bewerken</button>
                      {!isSelf && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete(tr)}>🗑️ Verwijderen</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Team modal ── */}
      {teamModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTeamModal(false)}>
          <div className="modal">
            <div className="modal-title">{editTeam ? 'Ploeg bewerken' : 'Nieuwe ploeg'}</div>
            <div className="form-group">
              <label className="input-label">Ploegnaam *</label>
              <input className="input-field" autoFocus value={teamForm.name}
                onChange={e => setTeamForm({...teamForm, name: e.target.value})}
                placeholder="bv. KFC Lennik U10A"
                onKeyDown={e => e.key === 'Enter' && handleSaveTeam()} />
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
                  onChange={e => setTeamForm({...teamForm, club: e.target.value})}
                  placeholder="KFC Lennik" />
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

      {/* ── Trainer create/edit modal ── */}
      {trainerModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTrainerModal(false)}>
          <div className="modal">
            <div className="modal-title">{editTrainer ? 'Trainer bewerken' : 'Nieuwe trainer'}</div>

            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Naam *</label>
                <input className="input-field" autoFocus value={trainerForm.name}
                  onChange={e => setTrainerForm({...trainerForm, name: e.target.value})} placeholder="Voornaam Achternaam" />
              </div>
              <div className="form-group">
                <label className="input-label">E-mailadres *</label>
                <input type="email" className="input-field" value={trainerForm.email}
                  onChange={e => setTrainerForm({...trainerForm, email: e.target.value})} placeholder="trainer@email.be" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="input-label">
                  {editTrainer ? 'Nieuw wachtwoord (laat leeg om te behouden)' : 'Wachtwoord *'}
                </label>
                <input type="password" className="input-field" value={trainerForm.password}
                  onChange={e => setTrainerForm({...trainerForm, password: e.target.value})}
                  placeholder={editTrainer ? '••••••••' : 'Min. 8 tekens'} />
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
              <label className="input-label">Koppel aan ploeg</label>
              <select className="input-field" value={trainerForm.teamId}
                onChange={e => setTrainerForm({...trainerForm, teamId: e.target.value})}>
                <option value="">— Geen ploeg —</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.category} · {FORMAT_MAP[t.category]})</option>
                ))}
              </select>
            </div>

            {error && <div className="adm-error">⚠ {error}</div>}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setTrainerModal(false)}>Annuleer</button>
              <button className="btn btn-primary"
                disabled={trainerSaving || !trainerForm.name || !trainerForm.email || (!editTrainer && !trainerForm.password)}
                onClick={handleSaveTrainer}>
                {trainerSaving ? 'Opslaan...' : editTrainer ? 'Opslaan' : 'Aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete trainer ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-title">Trainer verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.7 }}>
              Weet je zeker dat je <strong style={{ color: 'var(--white)' }}>{confirmDelete.name}</strong> ({confirmDelete.email}) wil verwijderen?
              {confirmDelete.team && (
                <><br/>Deze trainer is momenteel gekoppeld aan <strong style={{ color: 'var(--red)' }}>{confirmDelete.team.name}</strong>.</>
              )}
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }}
                onClick={() => handleDeleteTrainer(confirmDelete)}>
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
