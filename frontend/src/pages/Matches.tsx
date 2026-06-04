import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMatches, createMatch, deleteMatch, Match } from '../lib/api';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import './Matches.css';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  planned: { label: 'Gepland', cls: 'tag-black' },
  active: { label: 'Bezig', cls: 'tag-green' },
  finished: { label: 'Afgelopen', cls: 'tag-red' },
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ opponent: '', date: '', location: 'home' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setMatches(await getMatches()); } finally { setLoading(false); }
  }

  async function handleSave() {
    if (!form.opponent.trim() || !form.date) return;
    setSaving(true);
    try {
      await createMatch({
        opponent: form.opponent.trim(),
        date: new Date(form.date).toISOString(),
        location: form.location,
      });
      setShowModal(false);
      setForm({ opponent: '', date: '', location: 'home' });
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(m: Match, e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm(`Match tegen "${m.opponent}" verwijderen?`)) return;
    await deleteMatch(m.id);
    await load();
  }

  const upcoming = matches.filter(m => m.status !== 'finished');
  const past = matches.filter(m => m.status === 'finished');

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <div className="page-title">Matchen</div>
          <div className="page-subtitle">Kalender & Beheer</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <span>+</span> Nieuwe match
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner">Laden...</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="matches-section">
              <div className="section-label">
                <span className="accent-line" />
                Komende & Lopende Matchen
              </div>
              <div className="matches-grid">
                {upcoming.map(m => (
                  <MatchCard key={m.id} match={m} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div className="matches-section">
              <div className="section-label">
                <span className="accent-line" />
                Gespeelde Matchen
              </div>
              <div className="matches-grid">
                {past.map(m => (
                  <MatchCard key={m.id} match={m} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {matches.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              Nog geen matchen. Voeg de eerste toe!
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">Nieuwe match</div>

            <div className="form-group">
              <label className="input-label">Tegenstander *</label>
              <input
                className="input-field"
                value={form.opponent}
                onChange={e => setForm({ ...form, opponent: e.target.value })}
                placeholder="Naam tegenstander"
                autoFocus
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Datum & Tijd *</label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="input-label">Locatie</label>
                <select
                  className="input-field"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                >
                  <option value="home">Thuis</option>
                  <option value="away">Uit</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Annuleer</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.opponent.trim() || !form.date}>
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, onDelete }: { match: Match; onDelete: (m: Match, e: React.MouseEvent) => void }) {
  const s = STATUS_LABELS[match.status] || STATUS_LABELS.planned;
  const dateStr = (() => {
    try { return format(new Date(match.date), "EEE d MMM yyyy 'om' HH:mm", { locale: nl }); }
    catch { return match.date; }
  })();

  return (
    <Link to={`/matches/${match.id}`} className="match-card">
      <div className="match-card-top">
        <span className={`tag ${s.cls}`}>{s.label}</span>
        <span className={`tag ${match.location === 'home' ? 'tag-red' : 'tag-black'}`}>
          {match.location === 'home' ? 'Thuis' : 'Uit'}
        </span>
        <button className="btn btn-ghost btn-sm btn-icon match-delete" onClick={e => onDelete(match, e)} title="Verwijderen">
          🗑️
        </button>
      </div>
      <div className="match-opponent">vs. {match.opponent}</div>
      <div className="match-date">{dateStr}</div>
      {match.status === 'finished' && (
        <div className="match-score">
          {match.scoreHome} – {match.scoreAway}
        </div>
      )}
      <div className="match-card-arrow">→</div>
    </Link>
  );
}
