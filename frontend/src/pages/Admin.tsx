import { useEffect, useState } from 'react';
import {
  getTeams, createTeam, updateTeam, deleteTeam, Team,
  getTrainers, createTrainer, deleteTrainer, TrainerRecord,
} from '../lib/api';
import './Admin.css';

const CATEGORIES = ['U6','U7','U8','U9','U10','U11','U12','U13','U15','U17'];
const FORMAT_MAP: Record<string,string> = {
  U6:'2v2', U7:'3v3', U8:'5v5', U9:'5v5',
  U10:'8v8', U11:'8v8', U12:'8v8',
  U13:'11v11', U15:'11v11', U17:'11v11',
};

export default function Admin() {
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
  const [trainerForm, setTrainerForm]     = useState({ name: '', email: '', password: '', role: 'trainer', teamId: '' });
  const [trainerSaving, setTrainerSaving] = useState(false);
  const [error, setError]                 = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [t, tr] = await Promise.all([getTeams(), getTrainers()]);
      setTeams(t); setTrainers(tr);
    } finally { setLoading(false); }
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
      setTeamModal(false); await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'Fout'); }
    finally { setSaving(false); }
  }

  async function handleSaveTrainer() {
    if (!trainerForm.name || !trainerForm.email || !trainerForm.password) return;
    setTrainerSaving(true); setError('');
    try {
      await createTrainer({
        name: trainerForm.name, email: trainerForm.email,
        password: trainerForm.password, role: trainerForm.role,
        teamId: trainerForm.teamId || undefined,
      });
      setTrainerModal(false); await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'Fout'); }
    finally { setTrainerSaving(false); }
  }

  if (loading) return <div className="page"><div className="loading-spinner">Laden...</div></div>;

  return (
    <div className="page">
      <div className="adm-header">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">Ploegen & Trainers beheer</p>
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

      {/* ── TEAMS ── */}
      {tab === 'teams' && (
        <div>
          <div className="adm-toolbar">
            <button className="btn btn-primary" onClick={() => { setEditTeam(null); setTeamForm({ name:'', category:'U8', club:'' }); setTeamModal(true); }}>
              + Nieuwe ploeg
            </button>
          </div>
          <div className="adm-grid">
            {teams.map(t => {
              const trainer = trainers.find(tr => tr.team?.id === t.id);
              return (
                <div key={t.id} className="adm-team-card card">
                  <div className="adm-team-top">
                    <span className="adm-category-badge">{t.category}</span>
                    <span className="adm-format-tag">{FORMAT_MAP[t.category] ?? '?'}</span>
                    <div className="adm-team-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditTeam(t); setTeamForm({ name:t.name, category:t.category, club:t.club }); setTeamModal(true); }}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { if(confirm(`Ploeg "${t.name}" verwijderen?`)) { await deleteTeam(t.id); await load(); } }}>🗑️</button>
                    </div>
                  </div>
                  <div className="adm-team-name">{t.name}</div>
                  {t.club && <div className="adm-team-club">{t.club}</div>}
                  <div className="adm-team-trainer">
                    {trainer
                      ? <><span className="adm-trainer-icon">👤</span> {trainer.name}</>
                      : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Geen trainer gekoppeld</span>
                    }
                  </div>
                </div>
              );
            })}
            {teams.length === 0 && <div className="empty-state"><div className="empty-icon">🏆</div>Nog geen ploegen aangemaakt</div>}
          </div>
        </div>
      )}

      {/* ── TRAINERS ── */}
      {tab === 'trainers' && (
        <div>
          <div className="adm-toolbar">
            <button className="btn btn-primary" onClick={() => { setTrainerForm({ name:'', email:'', password:'', role:'trainer', teamId:'' }); setTrainerModal(true); }}>
              + Nieuwe trainer
            </button>
          </div>
          <div className="card">
            <table className="data-table">
              <thead>
                <tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Ploeg</th><th></th></tr>
              </thead>
              <tbody>
                {trainers.map(tr => (
                  <tr key={tr.id}>
                    <td style={{ fontWeight: 500 }}>{tr.name}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{tr.email}</td>
                    <td><span className={`tag ${tr.role === 'admin' ? 'tag-red' : 'tag-black'}`}>{tr.role === 'admin' ? 'Admin' : 'Trainer'}</span></td>
                    <td>
                      {tr.team
                        ? <span style={{ fontFamily: 'var(--font-heading)', fontSize: 12 }}>{tr.team.name} <span style={{ color: 'var(--red)' }}>({tr.team.category})</span></span>
                        : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { if(confirm(`Trainer "${tr.name}" verwijderen?`)) { await deleteTrainer(tr.id); await load(); } }}>🗑️</button>
                    </td>
                  </tr>
                ))}
                {trainers.length === 0 && <tr><td colSpan={5} style={{ textAlign:'center', padding: 32, color: 'var(--text-dim)' }}>Nog geen trainers</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team modal */}
      {teamModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTeamModal(false)}>
          <div className="modal">
            <div className="modal-title">{editTeam ? 'Ploeg bewerken' : 'Nieuwe ploeg'}</div>
            <div className="form-group">
              <label className="input-label">Ploegnaam *</label>
              <input className="input-field" autoFocus value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} placeholder="bv. KFC Lennik U10A" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Categorie *</label>
                <select className="input-field" value={teamForm.category} onChange={e => setTeamForm({...teamForm, category: e.target.value})}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c} ({FORMAT_MAP[c]})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="input-label">Club</label>
                <input className="input-field" value={teamForm.club} onChange={e => setTeamForm({...teamForm, club: e.target.value})} placeholder="KFC Lennik" />
              </div>
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>⚠ {error}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setTeamModal(false)}>Annuleer</button>
              <button className="btn btn-primary" disabled={saving || !teamForm.name} onClick={handleSaveTeam}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Trainer modal */}
      {trainerModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTrainerModal(false)}>
          <div className="modal">
            <div className="modal-title">Nieuwe trainer</div>
            <div className="form-group">
              <label className="input-label">Naam *</label>
              <input className="input-field" autoFocus value={trainerForm.name} onChange={e => setTrainerForm({...trainerForm, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="input-label">E-mailadres *</label>
              <input type="email" className="input-field" value={trainerForm.email} onChange={e => setTrainerForm({...trainerForm, email: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="input-label">Wachtwoord *</label>
              <input type="password" className="input-field" value={trainerForm.password} onChange={e => setTrainerForm({...trainerForm, password: e.target.value})} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Rol</label>
                <select className="input-field" value={trainerForm.role} onChange={e => setTrainerForm({...trainerForm, role: e.target.value})}>
                  <option value="trainer">Trainer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label className="input-label">Koppel aan ploeg</label>
                <select className="input-field" value={trainerForm.teamId} onChange={e => setTrainerForm({...trainerForm, teamId: e.target.value})}>
                  <option value="">— geen ploeg —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
                </select>
              </div>
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>⚠ {error}</div>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setTrainerModal(false)}>Annuleer</button>
              <button className="btn btn-primary" disabled={trainerSaving || !trainerForm.name || !trainerForm.email || !trainerForm.password} onClick={handleSaveTrainer}>
                {trainerSaving ? 'Aanmaken...' : 'Aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
