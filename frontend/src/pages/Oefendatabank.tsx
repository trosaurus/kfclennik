import { useEffect, useState } from 'react';
import { useTeam } from '../lib/TeamContext';
import {
  getOefeningDatabank, createOefeningDatabankItem, updateOefeningDatabankItem, deleteOefeningDatabankItem,
  getTeamManual, uploadTeamManual, removeTeamManual, TeamManual,
  OefeningDatabankItem, OefeningCategorie, Doelgroep, DOELGROEP_LEEFTIJDEN, ExerciseFase, EXERCISE_FASE_LABELS, parseDrawingScene,
  Spelprincipe, SPELPRINCIPE_OPTIONS, SPELPRINCIPE_LABELS,
} from '../lib/api';
import DrawingCanvas from '../components/DrawingCanvas';
import './TrainingEditor.css'; // hergebruikt de oefening-kaart-stijlen (te-organisatie, te-ex-drawing, ...)
import './Oefendatabank.css';

const FASE_ORDER: ExerciseFase[] = ['opwarming', 'tussenvorm', 'wedstrijdvorm', 'cooling_down'];

const CATEGORIE_LABELS: Record<OefeningCategorie, string> = {
  'B+': 'Bal+ (aanvallend)', 'B-': 'Bal- (verdedigend)',
};

interface DraftForm {
  naam: string; fase: ExerciseFase; categorie: OefeningCategorie | ''; doelgroep: Doelgroep | ''; teamprincipe: string; spelprincipe: Spelprincipe | ''; duurMinuten: number;
  organisatieSpelers: string; organisatieAfmetingen: string; organisatieMateriaal: string;
  beschrijving: string; drawingData: string; coachingPunten: string; maximaalActief: string; fun: string;
}

function emptyDraft(): DraftForm {
  return {
    naam: '', fase: 'opwarming', categorie: '', doelgroep: '', teamprincipe: '', spelprincipe: '', duurMinuten: 10,
    organisatieSpelers: '', organisatieAfmetingen: '', organisatieMateriaal: '',
    beschrijving: '', drawingData: '', coachingPunten: '', maximaalActief: '', fun: '',
  };
}
function draftFromItem(it: OefeningDatabankItem): DraftForm {
  return {
    naam: it.naam, fase: it.fase, categorie: it.categorie ?? '', doelgroep: it.doelgroep ?? '', teamprincipe: it.teamprincipe, spelprincipe: it.spelprincipe ?? '', duurMinuten: it.duurMinuten,
    organisatieSpelers: it.organisatieSpelers, organisatieAfmetingen: it.organisatieAfmetingen, organisatieMateriaal: it.organisatieMateriaal,
    beschrijving: it.beschrijving, drawingData: it.drawingData, coachingPunten: it.coachingPunten, maximaalActief: it.maximaalActief, fun: it.fun,
  };
}

// Index voor sortering "van U6 tot U17" — items zonder doelgroep komen laatst.
const AGE_INDEX: Record<string, number> = Object.fromEntries(DOELGROEP_LEEFTIJDEN.map((a, i) => [a, i]));
function ageRank(doelgroep: string | null): number {
  return doelgroep && doelgroep in AGE_INDEX ? AGE_INDEX[doelgroep] : DOELGROEP_LEEFTIJDEN.length;
}

export default function Oefendatabank() {
  const { trainer, teamId } = useTeam();
  const [items, setItems] = useState<OefeningDatabankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Trainersmanual van de eigen ploeg ────────────────────────────────────────
  const [manual, setManual] = useState<TeamManual | null>(null);
  const [manualLoading, setManualLoading] = useState(true);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualConfirmDelete, setManualConfirmDelete] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null); // 'new' of item.id
  const [draft, setDraft] = useState<DraftForm>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<OefeningDatabankItem | null>(null);

  const [filterFase, setFilterFase] = useState<ExerciseFase | ''>('');
  const [filterCategorie, setFilterCategorie] = useState<OefeningCategorie | ''>('');
  const [filterDoelgroep, setFilterDoelgroep] = useState<Doelgroep | ''>('');
  const [search, setSearch] = useState('');
  const [collapsedFases, setCollapsedFases] = useState<Set<ExerciseFase>>(new Set());

  function toggleFaseCollapsed(fase: ExerciseFase) {
    setCollapsedFases(prev => {
      const next = new Set(prev);
      if (next.has(fase)) next.delete(fase); else next.add(fase);
      return next;
    });
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { loadManual(); }, [teamId]);

  async function load() {
    setLoading(true);
    try { setItems(await getOefeningDatabank()); } finally { setLoading(false); }
  }

  async function loadManual() {
    if (!teamId) { setManual(null); setManualLoading(false); return; }
    setManualLoading(true);
    try { setManual(await getTeamManual(teamId)); } finally { setManualLoading(false); }
  }

  async function handleManualFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // zodat hetzelfde bestand opnieuw gekozen kan worden
    if (!file || !teamId) return;
    setManualBusy(true); setManualError('');
    try {
      await uploadTeamManual(teamId, file);
      await loadManual();
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Upload mislukt');
    } finally { setManualBusy(false); }
  }

  async function handleManualRemove() {
    if (!teamId) return;
    setManualConfirmDelete(false);
    setManualBusy(true);
    try { await removeTeamManual(teamId); await loadManual(); }
    finally { setManualBusy(false); }
  }

  function openNew() {
    setDraft(emptyDraft());
    setExpandedId('new');
  }
  function openEdit(it: OefeningDatabankItem) {
    setDraft(draftFromItem(it));
    setExpandedId(it.id);
  }
  function closeExpand() {
    setExpandedId(null);
  }

  async function handleSaveDraft() {
    if (!draft.naam.trim()) { setError('Naam is verplicht'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        naam: draft.naam.trim(), fase: draft.fase, teamprincipe: draft.teamprincipe, duurMinuten: draft.duurMinuten,
        organisatieSpelers: draft.organisatieSpelers, organisatieAfmetingen: draft.organisatieAfmetingen,
        organisatieMateriaal: draft.organisatieMateriaal, beschrijving: draft.beschrijving, drawingData: draft.drawingData,
        coachingPunten: draft.coachingPunten, maximaalActief: draft.maximaalActief, fun: draft.fun,
        categorie: draft.categorie || null, doelgroep: draft.doelgroep || null, spelprincipe: draft.spelprincipe || null,
      };
      if (expandedId === 'new') {
        await createOefeningDatabankItem({
          ...payload, categorie: draft.categorie || undefined, doelgroep: draft.doelgroep || undefined,
          spelprincipe: draft.spelprincipe || undefined, trainerId: trainer?.id,
        });
      } else if (expandedId) {
        await updateOefeningDatabankItem(expandedId, payload);
      }
      await load();
      closeExpand();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt');
    } finally { setSaving(false); }
  }

  async function handleDelete(it: OefeningDatabankItem) {
    setConfirmDelete(null);
    await deleteOefeningDatabankItem(it.id);
    if (expandedId === it.id) closeExpand();
    await load();
  }

  const filtered = items
    .filter(it =>
      (!filterFase || it.fase === filterFase) &&
      (!filterCategorie || it.categorie === filterCategorie) &&
      (!filterDoelgroep || it.doelgroep === filterDoelgroep) &&
      (!search.trim() || it.naam.toLowerCase().includes(search.trim().toLowerCase()) || it.teamprincipe.toLowerCase().includes(search.trim().toLowerCase()))
    )
    .sort((a, b) => ageRank(a.doelgroep) - ageRank(b.doelgroep) || a.naam.localeCompare(b.naam));

  // Zonder onderdeel-filter groeperen we per trainingsonderdeel — dat maakt een
  // club-brede, mogelijk lange lijst veel makkelijker te doorzoeken met het oog.
  const groups = !filterFase
    ? FASE_ORDER.map(f => ({ fase: f, items: filtered.filter(it => it.fase === f) })).filter(g => g.items.length > 0)
    : [];

  const filtersActive = !!(filterFase || filterCategorie || filterDoelgroep || search.trim());
  function resetFilters() {
    setFilterFase(''); setFilterCategorie(''); setFilterDoelgroep(''); setSearch('');
  }

  function renderCard(it: OefeningDatabankItem) {
    const isOpen = expandedId === it.id;
    return (
      <div key={it.id} className="card od-card">
        <button className="od-card-header" onClick={() => isOpen ? closeExpand() : openEdit(it)}>
          <span className={`tag te-fase-tag te-fase-${it.fase}`}>{EXERCISE_FASE_LABELS[it.fase]}</span>
          {it.categorie && (
            <span className={`tag ${it.categorie === 'B+' ? 'tag-green' : 'tag-black'}`}>{it.categorie}</span>
          )}
          {it.doelgroep && <span className="tag tag-black">{it.doelgroep}</span>}
          <span className="od-card-name">{it.naam}</span>
          {(it.teamprincipe || it.spelprincipe) && (
            <span className="od-card-teamprincipe">
              {it.teamprincipe}
              {it.teamprincipe && it.spelprincipe ? ' · ' : ''}
              {it.spelprincipe ? SPELPRINCIPE_LABELS[it.spelprincipe] : ''}
            </span>
          )}
          <span className="od-card-duur">{it.duurMinuten}min</span>
          <span className="te-chevron">{isOpen ? '▲' : '▼'}</span>
        </button>
        {isOpen && (
          <OefeningCard
            draft={draft} setDraft={setDraft} saving={saving}
            onSave={handleSaveDraft} onCancel={closeExpand} onOpenDrawing={() => setDrawingOpen(true)}
            onDelete={() => setConfirmDelete(it)}
          />
        )}
      </div>
    );
  }

  if (loading) return <div className="page"><div className="loading-spinner">Oefendatabank laden...</div></div>;

  return (
    <div className="page">
      <div className="od-header">
        <div>
          <h1 className="page-title">Oefendatabank</h1>
          <p className="page-subtitle">Herbruikbare oefeningen — club-breed gedeeld, indeelbaar per categorie en teamprincipe</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nieuwe oefening</button>
      </div>

      {error && <div className="adm-error">⚠ {error}</div>}

      {teamId && (
        <div className="card od-manual-card">
          <div className="od-manual-head">
            <div>
              <div className="od-manual-title">📄 Trainersmanual van je ploeg</div>
              <p className="od-manual-desc">Wordt gebruikt bij het genereren van oefeningen voor deze ploeg.</p>
            </div>
            <div className="od-manual-actions">
              <label className="btn btn-outline btn-sm od-manual-upload-btn">
                {manualBusy ? 'Bezig...' : manual?.manualFileName ? 'Vervangen' : 'Upload PDF'}
                <input type="file" accept="application/pdf" onChange={handleManualFile} disabled={manualBusy} />
              </label>
              {manual?.manualFileName && (
                <button className="btn btn-outline btn-sm" onClick={() => setManualConfirmDelete(true)} disabled={manualBusy}>
                  Verwijderen
                </button>
              )}
            </div>
          </div>
          {manualError && <div className="adm-error">⚠ {manualError}</div>}
          {!manualLoading && (
            manual?.manualFileName ? (
              <div className="od-manual-status">
                📎 {manual.manualFileName}
                {manual.manualUploadedAt ? ` — geüpload op ${new Date(manual.manualUploadedAt).toLocaleDateString('nl-BE')}` : ''}
              </div>
            ) : (
              <div className="od-manual-status od-manual-empty">
                Nog geen manual geüpload — de generator gebruikt dan enkel de standaardbibliotheek.
              </div>
            )
          )}
        </div>
      )}

      <div className="od-filters card">
        <div className="od-filters-row">
          <div className="form-group">
            <label className="input-label">Onderdeel</label>
            <select className="input-field" value={filterFase} onChange={e => setFilterFase(e.target.value as ExerciseFase | '')}>
              <option value="">Alle onderdelen</option>
              {FASE_ORDER.map(f => <option key={f} value={f}>{EXERCISE_FASE_LABELS[f]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">Categorie</label>
            <select className="input-field" value={filterCategorie} onChange={e => setFilterCategorie(e.target.value as OefeningCategorie | '')}>
              <option value="">Alle categorieën</option>
              <option value="B+">Bal+ (aanvallend)</option>
              <option value="B-">Bal- (verdedigend)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">Doelgroep</label>
            <select className="input-field" value={filterDoelgroep} onChange={e => setFilterDoelgroep(e.target.value as Doelgroep | '')}>
              <option value="">Alle doelgroepen</option>
              {DOELGROEP_LEEFTIJDEN.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group od-filter-search">
            <label className="input-label">Zoeken</label>
            <input className="input-field" placeholder="Zoek op naam of teamprincipe..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="od-filters-footer">
          <span className="od-result-count">
            {filtersActive ? `${filtered.length} van ${items.length}` : items.length} oefening{(filtersActive ? filtered.length : items.length) !== 1 ? 'en' : ''}
          </span>
          {filtersActive && <button className="btn btn-ghost btn-sm" onClick={resetFilters}>✕ Wis filters</button>}
        </div>
      </div>

      {expandedId === 'new' && (
        <OefeningCard
          isNew draft={draft} setDraft={setDraft} saving={saving}
          onSave={handleSaveDraft} onCancel={closeExpand} onOpenDrawing={() => setDrawingOpen(true)}
        />
      )}

      {filtered.length === 0 && expandedId !== 'new' ? (
        <div className="empty-state"><div className="empty-icon">📚</div>Geen oefeningen gevonden</div>
      ) : groups.length > 0 ? (
        <div className="od-groups">
          {groups.map(g => {
            const isCollapsed = collapsedFases.has(g.fase);
            return (
              <div key={g.fase} className="od-group">
                <button className={`od-group-header te-fase-${g.fase}`} onClick={() => toggleFaseCollapsed(g.fase)}>
                  <span className="od-group-title">{EXERCISE_FASE_LABELS[g.fase]}</span>
                  <span className="od-group-count">{g.items.length}</span>
                  <span className="od-group-chevron">{isCollapsed ? '▼' : '▲'}</span>
                </button>
                {!isCollapsed && (
                  <div className="od-list">
                    {g.items.map(it => renderCard(it))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="od-list">
          {filtered.map(it => renderCard(it))}
        </div>
      )}

      {drawingOpen && (
        <div className="modal-overlay te-draw-overlay" onClick={e => e.target === e.currentTarget && setDrawingOpen(false)}>
          <div className="te-draw-modal">
            <div className="te-draw-modal-header">
              <span>{draft.naam || 'Oefening'} — tekening</span>
              <button className="btn btn-primary btn-sm" onClick={() => setDrawingOpen(false)}>Klaar</button>
            </div>
            <DrawingCanvas
              scene={parseDrawingScene(draft.drawingData)}
              onChange={scene => setDraft(d => ({ ...d, drawingData: JSON.stringify(scene) }))}
            />
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <div className="modal-title">Oefening verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--white)' }}>{confirmDelete.naam}</strong> wordt permanent verwijderd uit de oefendatabank.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }}
                onClick={() => handleDelete(confirmDelete)}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}

      {manualConfirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setManualConfirmDelete(false)}>
          <div className="modal">
            <div className="modal-title">Manual verwijderen?</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 24, lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--white)' }}>{manual?.manualFileName}</strong> wordt van de server verwijderd.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setManualConfirmDelete(false)}>Annuleer</button>
              <button className="btn btn-primary" style={{ background: 'var(--red-dark)' }}
                onClick={handleManualRemove}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OefeningCard({ isNew, draft, setDraft, saving, onSave, onCancel, onOpenDrawing, onDelete }: {
  isNew?: boolean;
  draft: DraftForm;
  setDraft: React.Dispatch<React.SetStateAction<DraftForm>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onOpenDrawing: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`od-form ${isNew ? 'card' : ''}`}>
      <div className="form-row">
        <div className="form-group">
          <label className="input-label">Naam</label>
          <input className="input-field" autoFocus={isNew} value={draft.naam} onChange={e => setDraft(d => ({ ...d, naam: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="input-label">Trainingsonderdeel</label>
          <select className="input-field" value={draft.fase} onChange={e => setDraft(d => ({ ...d, fase: e.target.value as ExerciseFase }))}>
            {FASE_ORDER.map(f => <option key={f} value={f}>{EXERCISE_FASE_LABELS[f]}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="input-label">Categorie</label>
          <select className="input-field" value={draft.categorie} onChange={e => setDraft(d => ({ ...d, categorie: e.target.value as OefeningCategorie | '' }))}>
            <option value="">— geen —</option>
            <option value="B+">{CATEGORIE_LABELS['B+']}</option>
            <option value="B-">{CATEGORIE_LABELS['B-']}</option>
          </select>
        </div>
        <div className="form-group">
          <label className="input-label">Doelgroep</label>
          <select className="input-field" value={draft.doelgroep} onChange={e => setDraft(d => ({ ...d, doelgroep: e.target.value as Doelgroep | '' }))}>
            <option value="">— alle leeftijden —</option>
            {DOELGROEP_LEEFTIJDEN.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="input-label">Teamprincipe</label>
          <input className="input-field" value={draft.teamprincipe} onChange={e => setDraft(d => ({ ...d, teamprincipe: e.target.value }))}
            placeholder="bv. Opbouw via de doelman" />
        </div>
        <div className="form-group">
          <label className="input-label">Spelprincipe</label>
          <select className="input-field" value={draft.spelprincipe} onChange={e => setDraft(d => ({ ...d, spelprincipe: e.target.value as Spelprincipe | '' }))}>
            <option value="">— geen —</option>
            {SPELPRINCIPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="te-organisatie">
        <div className="input-label">Organisatie oefening</div>
        <div className="te-organisatie-grid">
          <div className="form-group">
            <label className="input-label te-su-pill">Duur (min)</label>
            <input type="number" className="input-field" min={0} value={draft.duurMinuten}
              onChange={e => setDraft(d => ({ ...d, duurMinuten: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="form-group">
            <label className="input-label te-su-pill">Aantal spelers</label>
            <input className="input-field" value={draft.organisatieSpelers} onChange={e => setDraft(d => ({ ...d, organisatieSpelers: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="input-label te-su-pill">Afmetingen</label>
            <input className="input-field" value={draft.organisatieAfmetingen} onChange={e => setDraft(d => ({ ...d, organisatieAfmetingen: e.target.value }))} placeholder="bv. 20m x 15m" />
          </div>
          <div className="form-group">
            <label className="input-label te-su-pill">Materiaal</label>
            <input className="input-field" value={draft.organisatieMateriaal} onChange={e => setDraft(d => ({ ...d, organisatieMateriaal: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="input-label">Beschrijving oefening</label>
        <textarea className="input-field" rows={3} value={draft.beschrijving} onChange={e => setDraft(d => ({ ...d, beschrijving: e.target.value }))}
          placeholder="Opstelling, spelregels, verloop..." />
      </div>

      <div className="te-ex-drawing">
        <div className="input-label">Tekening oefening</div>
        <DrawingCanvas scene={parseDrawingScene(draft.drawingData)} readOnly />
        <button className="btn btn-outline btn-sm" onClick={onOpenDrawing}>🎨 Teken oefening</button>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="input-label">Coaching</label>
          <textarea className="input-field" rows={2} value={draft.coachingPunten} onChange={e => setDraft(d => ({ ...d, coachingPunten: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="input-label">Maximaal actief</label>
          <textarea className="input-field" rows={2} value={draft.maximaalActief} onChange={e => setDraft(d => ({ ...d, maximaalActief: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="input-label">Fun</label>
          <textarea className="input-field" rows={2} value={draft.fun} onChange={e => setDraft(d => ({ ...d, fun: e.target.value }))} />
        </div>
      </div>

      <div className="te-ex-footer">
        <div className="te-reorder-btns">
          <button className="btn btn-outline btn-sm" onClick={onCancel}>Annuleer</button>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={onSave}>{saving ? 'Opslaan...' : '💾 Opslaan'}</button>
        </div>
        {onDelete && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={onDelete}>🗑️ Verwijderen</button>}
      </div>
    </div>
  );
}
