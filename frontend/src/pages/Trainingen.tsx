import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeam } from '../lib/TeamContext';
import {
  getTrainings, createTraining, updateTraining, deleteTraining, createExercise, Training,
  wedstrijdvormPercentage, getSharedTrainings, duplicateTraining,
} from '../lib/api';
import { parseTrainingPdf } from '../lib/pdfImport';
import { getJaarplanWeekForDate, formatJaarplanLabel } from '../lib/jaarplan';
import { getTrainingsschema, TRAININGSSCHEMA_GROEP_LABELS } from '../lib/trainingsschema';
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
  const [sharedTrainings, setSharedTrainings] = useState<Training[]>([]);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Training | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'concept' | 'klaar' | 'afgewerkt'>('');
  const [monthFilter, setMonthFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [own, shared] = await Promise.all([
        getTrainings(teamId ?? undefined),
        trainer ? getSharedTrainings(trainer.id) : Promise.resolve([]),
      ]);
      setTrainings(own);
      setSharedTrainings(shared);
    } finally { setLoading(false); }
  }

  async function handleCopyShared(t: Training) {
    if (!trainer) return;
    setCopyingId(t.id);
    try {
      const copy = await duplicateTraining(t, trainer.id, teamId ?? undefined);
      navigate(`/trainingen/${copy.id}`);
    } finally { setCopyingId(null); }
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
  function fmtMonth(iso: string) {
    try {
      const label = new Date(iso).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    } catch { return ''; }
  }
  function monthKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  if (loading) return <div className="page"><div className="loading-spinner">Trainingen laden...</div></div>;

  const statusCounts = {
    concept:   trainings.filter(t => t.status === 'concept').length,
    klaar:     trainings.filter(t => t.status === 'klaar').length,
    afgewerkt: trainings.filter(t => t.status === 'afgewerkt').length,
  };
  const monthOptions = Array.from(new Set(trainings.map(t => monthKey(t.date))))
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({ key, label: fmtMonth(trainings.find(t => monthKey(t.date) === key)!.date) }));
  const q = searchQuery.trim().toLowerCase();
  const filtered = trainings.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (monthFilter && monthKey(t.date) !== monthFilter) return false;
    if (!q) return true;
    return [t.titel, t.teamprincipe, t.spelprincipe, t.trainer?.name, t.leeftijdscategorie]
      .some(v => (v || '').toLowerCase().includes(q));
  });
  // Trainingen komen al gesorteerd op datum (desc) uit getTrainings — groepeer opeenvolgende
  // items met dezelfde maand zodat lange lijsten overzichtelijker scrollen.
  const groups: { label: string; items: Training[] }[] = [];
  for (const t of filtered) {
    const label = fmtMonth(t.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }

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

      {sharedTrainings.length > 0 && (
        <div className="tr-group tr-shared-group">
          <div className="tr-group-label">🔗 Gedeeld met mij</div>
          <div className="tr-list">
            {sharedTrainings.map(t => (
              <div key={t.id} className="tr-card card">
                <div className="tr-card-main" style={{ cursor: 'default' }}>
                  <div className="tr-card-date">
                    <span className="tr-date-day">{fmtDate(t.date)}</span>
                  </div>
                  <div className="tr-card-body">
                    <div className="tr-card-title">{t.titel || t.teamprincipe || 'Naamloze training'}</div>
                    <div className="tr-card-meta">
                      {t.exercises.length} oefening{t.exercises.length === 1 ? '' : 'en'} · {t.duurMinuten}min
                      {t.trainer && <> · door {t.trainer.name}</>}
                    </div>
                  </div>
                </div>
                <div className="tr-card-actions">
                  <button className="btn btn-primary btn-sm" disabled={copyingId === t.id} onClick={() => handleCopyShared(t)}>
                    {copyingId === t.id ? 'Kopiëren...' : '📋 Kopieer naar mijn trainingen'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trainings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          Nog geen trainingen voorbereid
        </div>
      ) : (
        <>
          <div className="tr-filters">
            <input
              className="input-field tr-search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Zoek op titel, teamprincipe, spelprincipe of coach..."
            />
            <select className="input-field tr-month-select" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
              <option value="">Alle maanden</option>
              {monthOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <div className="sb-toggles tr-status-toggles">
              <button className={`sb-toggle ${statusFilter === '' ? 'active' : ''}`} onClick={() => setStatusFilter('')}>Alle ({trainings.length})</button>
              <button className={`sb-toggle ${statusFilter === 'concept' ? 'active' : ''}`} onClick={() => setStatusFilter('concept')}>Concept ({statusCounts.concept})</button>
              <button className={`sb-toggle ${statusFilter === 'klaar' ? 'active' : ''}`} onClick={() => setStatusFilter('klaar')}>Klaar ({statusCounts.klaar})</button>
              <button className={`sb-toggle ${statusFilter === 'afgewerkt' ? 'active' : ''}`} onClick={() => setStatusFilter('afgewerkt')}>Afgewerkt ({statusCounts.afgewerkt})</button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              Geen trainingen gevonden voor deze filter of zoekopdracht
            </div>
          ) : (
            groups.map(group => (
              <div key={group.label} className="tr-group">
                <div className="tr-group-label">{group.label}</div>
                <div className="tr-list">
                  {group.items.map(t => {
                    const pct = wedstrijdvormPercentage(t.exercises);
                    const status = STATUS_META[t.status] ?? STATUS_META.concept;
                    const jw = getJaarplanWeekForDate(new Date(t.date));
                    const schema = t.trainingsschema ? getTrainingsschema(t.trainingsschema) : undefined;
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
                            {schema && (
                              <div className="tr-schema-row" title={`Opw: ${schema.opwarming} → Tuss: ${schema.tussenvorm} → Wed: ${schema.wedstrijdvorm}`}>
                                <span className={`tag ${schema.groep === 'BALBEZIT' ? 'tag-green' : 'tag-black'}`}>
                                  {TRAININGSSCHEMA_GROEP_LABELS[schema.groep]}
                                </span>
                                <span className="tr-schema-text">
                                  {schema.opwarming} → {schema.tussenvorm} → {schema.wedstrijdvorm}
                                </span>
                              </div>
                            )}
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
              </div>
            ))
          )}
        </>
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
