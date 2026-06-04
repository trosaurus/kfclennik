import { useEffect, useState } from 'react';
import { getPlayers, createPlayer, updatePlayer, deletePlayer, Player, POSITION_LABELS } from '../lib/api';
import './Players.css';

const POSITIONS = [
  { value: 'keeper', label: 'Doelman' },
  { value: 'defender', label: 'Verdediger' },
  { value: 'midfielder', label: 'Middenvelder' },
  { value: 'forward', label: 'Aanvaller' },
];

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState({ name: '', number: '', position: '' });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setPlayers(await getPlayers()); } finally { setLoading(false); }
  }

  function openCreate() {
    setEditPlayer(null);
    setForm({ name: '', number: '', position: '' });
    setShowModal(true);
  }

  function openEdit(p: Player) {
    setEditPlayer(p);
    setForm({ name: p.name, number: p.number?.toString() || '', position: p.position || '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const input: Record<string, unknown> = {
        name: form.name.trim(),
        position: form.position || null,
      };
      if (form.number) input.number = parseInt(form.number);
      if (editPlayer) {
        await updatePlayer(editPlayer.id, input as Partial<Player>);
      } else {
        await createPlayer(input as { name: string; number?: number; position?: string });
      }
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Player) {
    if (!confirm(`Speler "${p.name}" verwijderen?`)) return;
    await deletePlayer(p.id);
    await load();
  }

  async function toggleActive(p: Player) {
    await updatePlayer(p.id, { active: p.active === 'true' ? 'false' : 'true' });
    await load();
  }

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  const byPosition: Record<string, Player[]> = {};
  filtered.forEach(p => {
    const pos = p.position || 'unknown';
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(p);
  });

  const posOrder = ['keeper', 'defender', 'midfielder', 'forward', 'unknown'];

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <div className="page-title">Spelerslijst</div>
          <div className="page-subtitle">KFC Lennik — Kern</div>
        </div>
        <div className="header-actions">
          <input
            type="text"
            placeholder="Zoek speler..."
            className="input-field search-field"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button className="btn btn-primary" onClick={openCreate}>
            <span>+</span> Nieuwe speler
          </button>
        </div>
      </div>

      <div className="players-stats">
        <div className="stat-chip">
          <span className="stat-num">{players.filter(p => p.active === 'true').length}</span>
          <span className="stat-label">Actief</span>
        </div>
        <div className="stat-chip">
          <span className="stat-num">{players.filter(p => p.position === 'keeper').length}</span>
          <span className="stat-label">DM</span>
        </div>
        <div className="stat-chip">
          <span className="stat-num">{players.filter(p => p.position === 'defender').length}</span>
          <span className="stat-label">VD</span>
        </div>
        <div className="stat-chip">
          <span className="stat-num">{players.filter(p => p.position === 'midfielder').length}</span>
          <span className="stat-label">MV</span>
        </div>
        <div className="stat-chip">
          <span className="stat-num">{players.filter(p => p.position === 'forward').length}</span>
          <span className="stat-label">AV</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner">Laden...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⚽</div>
          Geen spelers gevonden
        </div>
      ) : (
        <div className="positions-grid">
          {posOrder.filter(pos => byPosition[pos]?.length > 0).map(pos => (
            <div key={pos} className="position-group">
              <div className="position-header">
                <span className="position-tag">{POSITION_LABELS[pos] || '??'}</span>
                <span className="position-name">{POSITIONS.find(p => p.value === pos)?.label || 'Onbekend'}</span>
                <span className="position-count">{byPosition[pos].length}</span>
              </div>
              <div className="players-list">
                {byPosition[pos].map(p => (
                  <div key={p.id} className={`player-row ${p.active !== 'true' ? 'inactive' : ''}`}>
                    <div className="player-number">
                      {p.number ? `#${p.number}` : '—'}
                    </div>
                    <div className="player-name">{p.name}</div>
                    {p.active !== 'true' && <span className="tag tag-black">Inactief</span>}
                    <div className="player-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)} title={p.active === 'true' ? 'Deactiveren' : 'Activeren'}>
                        {p.active === 'true' ? '🟢' : '🔴'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(p)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Rugnummer</label>
                <input
                  className="input-field"
                  type="number"
                  value={form.number}
                  onChange={e => setForm({ ...form, number: e.target.value })}
                  placeholder="1–99"
                />
              </div>
              <div className="form-group">
                <label className="input-label">Positie</label>
                <select
                  className="input-field"
                  value={form.position}
                  onChange={e => setForm({ ...form, position: e.target.value })}
                >
                  <option value="">Kies positie...</option>
                  {POSITIONS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Annuleer</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
