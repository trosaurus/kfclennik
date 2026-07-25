import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeam } from '../lib/TeamContext';
import {
  getTrainings, createTraining, updateTraining, deleteTraining, createExercise, Training,
  wedstrijdvormPercentage,
} from '../lib/api';
import { parseTrainingPdf } from '../lib/pdfImport';
import { getJaarplanWeekForDate, formatJaarplanLabel } from '../lib/jaarplan';
import './Trainingen.css';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  concept:   { label: 'Concept',   cls: 'tag-black' },
  klaar:     { label: 'Klaar',     cls: 'tag-green' },
  afgewerkt: { label: 'Afgewerkt', cls: 'tag-red' },
};

export default function Trainingen() {
  const { teamId, trainer } = useTeam();
  const navigate = useNavigate();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Training | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setTrainings(await getTrainings(teamId ?? undefined)); } finally { setLoading(false); }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const today = new Date();
      const jw = getJaarplanWeekForDate(today);
      const t = await createTraining({
        date: today.toISOString(),
        trainerId: trainer?.id,
        teamId: teamId ?? undefined,
        titel: jw ? jw.teamprincipe || jw.spelprincipe : '',
      });
      navigate(`/trainingen/${t.id}`);
    } finally { setCreating(false); }
  }

  async function handleImportPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const parsed = await parseTrainingPdf(file);
      const today = new Date();
      const jw = getJaarplanWeekForDate(today);
      const t = await createTraining({
        date: today.toISOString(),
        trainerId: trainer?.id,
        teamId: teamId ?? undefined,
        titel: parsed.titel || (jw ? jw.teamprincipe || jw.spelprincipe : ''),
      });

      const fieldUpdate: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed.fields)) { if (v) fieldUpdate[k] = v; }
      if (Object.keys(fieldUpdate).length > 0) await updateTraining(t.id, fieldUpdate);

      for (let i = 0; i < parsed.exercises.length; i++) {
        const { drawingImage, ...ex } = parsed.exercises[i];
        const drawingData = drawingImage ? JSON.stringify({ background: 'grid', elements: [], backgroundImage: drawingImage }) : undefined;
        await createExercise(t.id, { ...ex, order: i, drawingData });
      }

      if (parsed.exercises.length === 0 && Object.keys(fieldUpdate).length === 0) {
        setImportError('Geen herkenbare trainingsvelden gevonden in dit PDF-bestand. Controleer of het de KFC-trainingstemplate volgt.');
      }
      navigate(`/trainingen/${t.id}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'PDF-import mislukt');
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(t: Training) {
    setConfirmDelete(null);
    await deleteTraining(t.id);
    await load();
  }

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' }); }
    catch { return ''; }
  }

  if (loading) return <div className="page"><div className="loading-spinner">Trainingen laden...</div></div>;

  return (
    <div className="page">
      <div className="tr-header">
        <div>
          <h1 className="page-title">Trainingen</h1>
          <p className="page-subtitle">Voorbereiding volgens de combinatiemethode</p>
        </div>
        <div className="tr-header-actions">
          <input
            ref={fileInputRef} type="file" accept="application/pdf"
            style={{ display: 'none' }} onChange={handleImportPdf}
          />
          <button className="btn btn-outline" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? 'Bezig met importeren...' : '📄 Importeer PDF'}
          </button>
          <button className="btn btn-primary" disabled={creating} onClick={handleCreate}>
            {creating ? 'Aanmaken...' : '+ Nieuwe training'}
          </button>
        </div>
      </div>

      {importError && (
        <div className="tr-import-error">
          {importError}
          <button className="btn btn-ghost btn-sm" onClick={() => setImportError(null)}>✕</button>
        </div>
      )}

      {trainings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          Nog geen trainingen voorbereid
        </div>
      ) : (
        <div className="tr-list">
          {trainings.map(t => {
            const pct = wedstrijdvormPercentage(t.exercises);
            const status = STATUS_META[t.status] ?? STATUS_META.concept;
            const jw = getJaarplanWeekForDate(new Date(t.date));
            return (
              <div key={t.id} className="tr-card card">
                <div className="tr-card-main" onClick={() => navigate(`/trainingen/${t.id}`)}>
                  <div className="tr-card-date">
                    <span className="tr-date-day">{fmtDate(t.date)}</span>
                    {t.jaarplanLabel && <span className="tr-date-jaarplan">{t.jaarplanLabel}</span>}
                    {!t.jaarplanLabel && jw && <span className="tr-date-jaarplan">{formatJaarplanLabel(jw)}</span>}
                  </div>
                  <div className="tr-card-body">
                    <div className="tr-card-title">{t.titel || t.teamprincipe || 'Naamloze training'}</div>
                    <div className="tr-card-meta">
                      {t.exercises.length} oefening{t.exercises.length === 1 ? '' : 'en'} · {t.duurMinuten}min
                      {t.trainer && <> · door {t.trainer.name}</>}
                    </div>
                  </div>
                  <div className="tr-card-side">
                    <span className={`tag ${status.cls}`}>{status.label}</span>
                    {t.exercises.length > 0 && (
                      <span className={`tr-pct-badge ${pct >= 50 ? 'ok' : 'warn'}`} title="Aandeel wedstrijdvorm">
                        {pct.toFixed(0)}% wedstrijdvorm
                      </span>
                    )}
                  </div>
                </div>
                <div className="tr-card-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/trainingen/${t.id}/modus`)}>▶ Trainingsmodus</button>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate(`/trainingen/${t.id}`)}>✏️ Bewerken</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(t)}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-title">Training verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--white)' }}>{confirmDelete.titel || 'Deze training'}</strong> en alle oefeningen worden verwijderd.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }}
                onClick={() => handleDelete(confirmDelete)}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
