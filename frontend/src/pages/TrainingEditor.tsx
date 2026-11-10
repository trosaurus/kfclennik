import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTeam } from '../lib/TeamContext';
import {
  getTraining, updateTraining, createExercise, updateExercise, deleteExercise,
  Training, Exercise, ExerciseFase, EXERCISE_FASE_LABELS,
  wedstrijdvormPercentage, parseDrawingScene, exportTrainingToPptx, exportExerciseToPptx, exportTrainingToPdf,
  getOefeningDatabank, createOefeningDatabankItem, OefeningDatabankItem, OefeningCategorie, Doelgroep, DOELGROEP_LEEFTIJDEN, SPELPRINCIPE_LABELS,
  getTeamManual, getTrainers, setTrainingShare, TrainerRecord,
} from '../lib/api';
import { getJaarplanWeekForDate, getCategoryBracket, formatJaarplanLabel } from '../lib/jaarplan';
import { suggestExercises, LibraryExercise, KRACHTIGE_LEEROMGEVING_PRINCIPES } from '../lib/oefeningenbibliotheek';
import { TRAININGSSCHEMAS, TRAININGSSCHEMA_GROEP_LABELS, TrainingsschemaGroep, getTrainingsschema } from '../lib/trainingsschema';
import { extractManualSuggestions } from '../lib/manualOefeningen';
import { buildOefeningPrompt, parseClaudeResponse, ParsedClaudeExercise } from '../lib/claudePrompt';
import { parseTrainingPdf, ParsedExercise } from '../lib/pdfImport';
import DrawingCanvas from '../components/DrawingCanvas';
import { PowerPointIcon, PdfIcon } from '../components/icons/FileTypeIcons';
import './TrainingEditor.css';
import './Oefendatabank.css'; // hergebruikt .od-card-teamprincipe voor de databank-picker

interface LocalExercise extends Exercise { isNew?: boolean }

function uid(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Laat een textarea vanzelf meegroeien met de inhoud — i.p.v. een vast aantal
// rijen te gokken (dat bij een lange beschrijving alsnog moet scrollen), past
// de hoogte zich telkens aan aan wat er effectief staat. Aangeroepen zowel via
// de ref (juiste hoogte al bij het openen/laden) als bij elke wijziging.
function autoGrowTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function newExercise(fase: ExerciseFase): LocalExercise {
  return {
    id: `new-${uid()}`, isNew: true, order: 0, fase, naam: '', duurMinuten: 10,
    organisatieSpelers: '', organisatieAfmetingen: '', organisatieMateriaal: '',
    beschrijving: '', drawingData: '', coachingPunten: '', maximaalActief: '', fun: '',
  };
}

function exerciseFromLibrary(lib: LibraryExercise): LocalExercise {
  return {
    id: `new-${uid()}`, isNew: true, order: 0, fase: lib.fase, naam: lib.naam, duurMinuten: lib.duurMinuten,
    organisatieSpelers: lib.organisatieSpelers, organisatieAfmetingen: lib.organisatieAfmetingen, organisatieMateriaal: lib.organisatieMateriaal,
    beschrijving: lib.beschrijving, drawingData: JSON.stringify(lib.scene), coachingPunten: lib.coachingPunten, maximaalActief: lib.maximaalActief, fun: lib.fun,
  };
}

function exerciseFromManualText(fase: ExerciseFase, text: string): LocalExercise {
  return {
    id: `new-${uid()}`, isNew: true, order: 0, fase, naam: '', duurMinuten: 10,
    organisatieSpelers: '', organisatieAfmetingen: '', organisatieMateriaal: '',
    beschrijving: text, drawingData: '', coachingPunten: '', maximaalActief: '', fun: '',
  };
}

function exerciseFromClaudeResponse(fase: ExerciseFase, p: ParsedClaudeExercise): LocalExercise {
  return {
    id: `new-${uid()}`, isNew: true, order: 0, fase, naam: p.naam, duurMinuten: p.duurMinuten,
    organisatieSpelers: p.organisatieSpelers, organisatieAfmetingen: p.organisatieAfmetingen, organisatieMateriaal: p.organisatieMateriaal,
    beschrijving: p.beschrijving, drawingData: '', coachingPunten: p.coachingPunten, maximaalActief: p.maximaalActief, fun: p.fun,
  };
}

function exerciseFromDatabank(it: OefeningDatabankItem): LocalExercise {
  return {
    id: `new-${uid()}`, isNew: true, order: 0, fase: it.fase, naam: it.naam, duurMinuten: it.duurMinuten,
    organisatieSpelers: it.organisatieSpelers, organisatieAfmetingen: it.organisatieAfmetingen, organisatieMateriaal: it.organisatieMateriaal,
    beschrijving: it.beschrijving, drawingData: it.drawingData, coachingPunten: it.coachingPunten, maximaalActief: it.maximaalActief, fun: it.fun,
  };
}

function exerciseFromParsedPdf(p: ParsedExercise): LocalExercise {
  const drawingData = p.drawingImage ? JSON.stringify({ background: 'grid', elements: [], backgroundImage: p.drawingImage }) : '';
  return {
    id: `new-${uid()}`, isNew: true, order: 0, fase: p.fase, naam: p.naam, duurMinuten: p.duurMinuten,
    organisatieSpelers: p.organisatieSpelers, organisatieAfmetingen: p.organisatieAfmetingen, organisatieMateriaal: p.organisatieMateriaal,
    beschrijving: p.beschrijving, drawingData, coachingPunten: p.coachingPunten, maximaalActief: p.maximaalActief, fun: p.fun,
  };
}

const FASE_ORDER: ExerciseFase[] = ['opwarming', 'tussenvorm', 'wedstrijdvorm', 'cooling_down'];

const EMPTY_FORM = {
  date: '', titel: '', duurMinuten: 90, aantalSpelers: '', status: 'concept',
  coachNaam: '', tijdstip: '', leeftijdscategorie: '', niveau: '',
  hoofdmoment: '', spelfase: '', basisvaardigheid: '',
  speluitdagingWie: '', speluitdagingWat: '', speluitdagingWaar: '', speluitdagingWanneer: '',
  coachingswoorden: '', materiaal: '',
  actiefAanpak: '', funAanpak: '', individueleAandacht: '',
  teamprincipe: '', spelprincipe: '', focusPunten: '', jaarplanLabel: '', trainingsschema: '',
  evalBehouden: '', evalWijzigen: '', evalWarenActief: '', evalHaddenFun: '', evalBijgeleerd: '', evalIndividueleAandacht: '',
};

export default function TrainingEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { category, trainer, isAdmin } = useTeam();

  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExerciseId, setExportingExerciseId] = useState<string | null>(null);
  const [importingExercisePdf, setImportingExercisePdf] = useState(false);
  const exerciseFileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError]       = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [exercises, setExercises] = useState<LocalExercise[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawingFor, setDrawingFor] = useState<string | null>(null);
  const [openKop, setOpenKop] = useState(false);
  const [openLeren, setOpenLeren] = useState(false);
  const [openActief, setOpenActief] = useState(false);

  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genFase, setGenFase] = useState<ExerciseFase>('opwarming');
  const [genOffset, setGenOffset] = useState(0);
  const [manualText, setManualText] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [claudeResponse, setClaudeResponse] = useState('');

  const [dbItems, setDbItems] = useState<OefeningDatabankItem[]>([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [dbImportFor, setDbImportFor] = useState<string | null>(null);
  const [dbFase, setDbFase] = useState<ExerciseFase>('opwarming');
  const [dbCategorie, setDbCategorie] = useState<OefeningCategorie | ''>('');
  const [dbDoelgroep, setDbDoelgroep] = useState<Doelgroep | ''>('');
  const [dbSearch, setDbSearch] = useState('');

  const [schemaGroep, setSchemaGroep] = useState<TrainingsschemaGroep>('BALBEZIT');

  const [saveToDbFor, setSaveToDbFor] = useState<string | null>(null);
  const [saveToDbCategorie, setSaveToDbCategorie] = useState<OefeningCategorie | ''>('');
  const [saveToDbDoelgroep, setSaveToDbDoelgroep] = useState<Doelgroep | ''>('');
  const [saveToDbTeamprincipe, setSaveToDbTeamprincipe] = useState('');
  const [savingToDb, setSavingToDb] = useState(false);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTrainers, setShareTrainers] = useState<TrainerRecord[]>([]);
  const [shareTrainersLoaded, setShareTrainersLoaded] = useState(false);
  const [shareSelected, setShareSelected] = useState<Set<string>>(new Set());
  const [shareSaving, setShareSaving] = useState(false);

  useEffect(() => { if (id) load(id); }, [id]);

  async function openShareModal() {
    if (!training) return;
    setShareSelected(new Set(training.sharedWith.map(t => t.id)));
    setShareModalOpen(true);
    if (!shareTrainersLoaded) {
      const all = await getTrainers();
      setShareTrainers(all.filter(t => t.id !== trainer?.id));
      setShareTrainersLoaded(true);
    }
  }

  function toggleShareTrainer(trainerId: string) {
    setShareSelected(prev => {
      const next = new Set(prev);
      if (next.has(trainerId)) next.delete(trainerId); else next.add(trainerId);
      return next;
    });
  }

  async function handleSaveShare() {
    if (!training) return;
    setShareSaving(true);
    try {
      const ids = Array.from(shareSelected);
      await setTrainingShare(training.id, ids);
      setTraining({
        ...training,
        sharedWith: shareTrainers.filter(t => shareSelected.has(t.id)),
      });
      setShareModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delen mislukt');
    } finally { setShareSaving(false); }
  }

  async function load(trainingId: string): Promise<Training | undefined> {
    setLoading(true);
    try {
      const t = await getTraining(trainingId);
      if (!t) { setError('Training niet gevonden'); return undefined; }
      setTraining(t);
      setForm({
        date: t.date.slice(0, 10), titel: t.titel, duurMinuten: t.duurMinuten, aantalSpelers: t.aantalSpelers, status: t.status,
        coachNaam: t.coachNaam, tijdstip: t.tijdstip, leeftijdscategorie: t.leeftijdscategorie || category || '', niveau: t.niveau,
        hoofdmoment: t.hoofdmoment, spelfase: t.spelfase, basisvaardigheid: t.basisvaardigheid,
        speluitdagingWie: t.speluitdagingWie, speluitdagingWat: t.speluitdagingWat,
        speluitdagingWaar: t.speluitdagingWaar, speluitdagingWanneer: t.speluitdagingWanneer,
        coachingswoorden: t.coachingswoorden, materiaal: t.materiaal,
        actiefAanpak: t.actiefAanpak, funAanpak: t.funAanpak, individueleAandacht: t.individueleAandacht,
        teamprincipe: t.teamprincipe, spelprincipe: t.spelprincipe, focusPunten: t.focusPunten, jaarplanLabel: t.jaarplanLabel,
        trainingsschema: t.trainingsschema,
        evalBehouden: t.evalBehouden, evalWijzigen: t.evalWijzigen, evalWarenActief: t.evalWarenActief,
        evalHaddenFun: t.evalHaddenFun, evalBijgeleerd: t.evalBijgeleerd, evalIndividueleAandacht: t.evalIndividueleAandacht,
      });
      setExercises(t.exercises);
      setDeletedIds([]);
      if (t.team?.id) {
        getTeamManual(t.team.id).then(m => setManualText(m.manualText || '')).catch(() => {});
      }
      return t;
    } finally { setLoading(false); }
  }

  function applyJaarplan() {
    const d = new Date(form.date);
    const jw = getJaarplanWeekForDate(d);
    if (!jw) { alert('Geen jaarplan-data gevonden voor deze datum (bv. buiten het seizoen of tijdens de kerstvakantie).'); return; }
    const bracket = getCategoryBracket(category ?? '');
    setForm(f => ({
      ...f,
      spelfase: jw.spelfase, teamprincipe: jw.teamprincipe, spelprincipe: jw.spelprincipe,
      focusPunten: jw.basics[bracket] ?? '', jaarplanLabel: formatJaarplanLabel(jw),
    }));
  }

  function applyTrainingsschema(schemaId: string) {
    setForm(f => ({ ...f, trainingsschema: schemaId }));
  }

  function vulOefeningenInVanuitSchema() {
    const schema = getTrainingsschema(form.trainingsschema);
    if (!schema) return;
    const leeg: Record<'opwarming' | 'tussenvorm' | 'wedstrijdvorm', string> = {
      opwarming: schema.opwarming, tussenvorm: schema.tussenvorm, wedstrijdvorm: schema.wedstrijdvorm,
    };
    const toAdd = (Object.keys(leeg) as Array<keyof typeof leeg>)
      .filter(fase => !exercises.some(e => e.fase === fase))
      .map(fase => ({ ...newExercise(fase), naam: leeg[fase] }));
    if (toAdd.length === 0) {
      alert('Er staan al oefeningen in opwarming, tussenvorm en wedstrijdvorm — verwijder er eerst een als je die wil laten invullen vanuit het schema.');
      return;
    }
    setExercises(list => [...list, ...toAdd]);
  }

  function addExercise(fase: ExerciseFase) {
    const ex = newExercise(fase);
    setExercises(list => [...list, ex]);
    setExpandedId(ex.id);
  }

  function openGenerator(fase: ExerciseFase) {
    setGenFase(fase); setGenOffset(0); setClaudeResponse(''); setGenModalOpen(true);
  }
  function useSuggestion(lib: LibraryExercise) {
    const ex = exerciseFromLibrary(lib);
    setExercises(list => [...list, ex]);
    setExpandedId(ex.id);
    setGenModalOpen(false);
  }
  function useManualSuggestion(text: string) {
    const ex = exerciseFromManualText(genFase, text);
    setExercises(list => [...list, ex]);
    setExpandedId(ex.id);
    setGenModalOpen(false);
  }
  async function handleCopyPrompt(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch { /* clipboard niet beschikbaar — trainer kan zelf selecteren en kopiëren */ }
  }
  function useClaudeResponse() {
    const parsed = parseClaudeResponse(claudeResponse);
    const ex = exerciseFromClaudeResponse(genFase, parsed);
    setExercises(list => [...list, ex]);
    setExpandedId(ex.id);
    setClaudeResponse('');
    setGenModalOpen(false);
  }
  async function openDbModal(importFor?: LocalExercise) {
    setDbImportFor(importFor?.id ?? null);
    setDbFase(importFor?.fase ?? 'opwarming');
    setDbModalOpen(true);
    if (!dbLoaded) {
      try { setDbItems(await getOefeningDatabank()); setDbLoaded(true); }
      catch (e) { setError(e instanceof Error ? e.message : 'Oefendatabank laden mislukt'); }
    }
  }
  function useDbItem(it: OefeningDatabankItem) {
    if (dbImportFor) {
      updateLocal(dbImportFor, {
        naam: it.naam, duurMinuten: it.duurMinuten,
        organisatieSpelers: it.organisatieSpelers, organisatieAfmetingen: it.organisatieAfmetingen, organisatieMateriaal: it.organisatieMateriaal,
        beschrijving: it.beschrijving, drawingData: it.drawingData,
        coachingPunten: it.coachingPunten, maximaalActief: it.maximaalActief, fun: it.fun,
      });
      setExpandedId(dbImportFor);
    } else {
      const ex = exerciseFromDatabank(it);
      setExercises(list => [...list, ex]);
      setExpandedId(ex.id);
    }
    setDbModalOpen(false);
    setDbImportFor(null);
  }

  function openSaveToDb(ex: LocalExercise) {
    setSaveToDbFor(ex.id);
    setSaveToDbCategorie('');
    setSaveToDbDoelgroep((DOELGROEP_LEEFTIJDEN as readonly string[]).includes(category ?? '') ? (category as Doelgroep) : '');
    setSaveToDbTeamprincipe(form.teamprincipe || '');
  }
  async function handleSaveToDb() {
    const ex = exercises.find(e => e.id === saveToDbFor);
    if (!ex) return;
    setSavingToDb(true); setError('');
    try {
      await createOefeningDatabankItem({
        naam: ex.naam || 'Naamloze oefening', fase: ex.fase, categorie: saveToDbCategorie || undefined,
        doelgroep: saveToDbDoelgroep || undefined,
        teamprincipe: saveToDbTeamprincipe, duurMinuten: ex.duurMinuten,
        organisatieSpelers: ex.organisatieSpelers, organisatieAfmetingen: ex.organisatieAfmetingen, organisatieMateriaal: ex.organisatieMateriaal,
        beschrijving: ex.beschrijving, drawingData: ex.drawingData,
        coachingPunten: ex.coachingPunten, maximaalActief: ex.maximaalActief, fun: ex.fun,
        trainerId: trainer?.id,
      });
      setDbLoaded(false); // volgende keer de databank-modal opent, actuele lijst ophalen
      setSaveToDbFor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bewaren in oefendatabank mislukt');
    } finally { setSavingToDb(false); }
  }

  function updateLocal(exId: string, patch: Partial<LocalExercise>) {
    setExercises(list => list.map(e => e.id === exId ? { ...e, ...patch } : e));
  }
  function removeExercise(exId: string) {
    setExercises(list => list.filter(e => e.id !== exId));
    if (!exId.startsWith('new-')) setDeletedIds(ids => [...ids, exId]);
  }
  function duplicateExercise(exId: string) {
    const idx = exercises.findIndex(e => e.id === exId);
    if (idx === -1) return;
    const copy: LocalExercise = { ...exercises[idx], id: `new-${uid()}`, isNew: true };
    setExercises(list => [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)]);
    setExpandedId(copy.id);
  }
  function moveExercise(exId: string, dir: -1 | 1) {
    setExercises(list => {
      const idx = list.findIndex(e => e.id === exId);
      const swapIdx = idx + dir;
      if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return list;
      const next = [...list];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }

  async function handleSave(): Promise<Training | undefined> {
    if (!training) return undefined;
    setSaving(true); setError('');
    try {
      await updateTraining(training.id, {
        date: new Date(form.date).toISOString(), titel: form.titel, duurMinuten: form.duurMinuten,
        aantalSpelers: form.aantalSpelers, status: form.status,
        coachNaam: form.coachNaam, tijdstip: form.tijdstip, leeftijdscategorie: form.leeftijdscategorie, niveau: form.niveau,
        hoofdmoment: form.hoofdmoment, spelfase: form.spelfase, basisvaardigheid: form.basisvaardigheid,
        speluitdagingWie: form.speluitdagingWie, speluitdagingWat: form.speluitdagingWat,
        speluitdagingWaar: form.speluitdagingWaar, speluitdagingWanneer: form.speluitdagingWanneer,
        coachingswoorden: form.coachingswoorden, materiaal: form.materiaal,
        actiefAanpak: form.actiefAanpak, funAanpak: form.funAanpak, individueleAandacht: form.individueleAandacht,
        teamprincipe: form.teamprincipe, spelprincipe: form.spelprincipe, focusPunten: form.focusPunten, jaarplanLabel: form.jaarplanLabel,
        trainingsschema: form.trainingsschema,
        evalBehouden: form.evalBehouden, evalWijzigen: form.evalWijzigen, evalWarenActief: form.evalWarenActief,
        evalHaddenFun: form.evalHaddenFun, evalBijgeleerd: form.evalBijgeleerd, evalIndividueleAandacht: form.evalIndividueleAandacht,
      });

      for (const exId of deletedIds) await deleteExercise(exId);

      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        const payload = {
          fase: ex.fase, naam: ex.naam, duurMinuten: ex.duurMinuten, order: i,
          organisatieSpelers: ex.organisatieSpelers, organisatieAfmetingen: ex.organisatieAfmetingen,
          organisatieMateriaal: ex.organisatieMateriaal, beschrijving: ex.beschrijving,
          coachingPunten: ex.coachingPunten, maximaalActief: ex.maximaalActief, fun: ex.fun, drawingData: ex.drawingData,
        };
        if (ex.isNew) await createExercise(training.id, payload);
        else await updateExercise(ex.id, payload);
      }

      return await load(training.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt');
      return undefined;
    } finally { setSaving(false); }
  }

  async function handleExportPptx() {
    if (!training) return;
    setExporting(true); setError('');
    try {
      await handleSave(); // exporteer altijd de meest recente (net opgeslagen) gegevens
      const safeName = (form.titel || 'training').replace(/[^\p{L}\p{N}\-_]+/gu, '_').slice(0, 60);
      await exportTrainingToPptx(training.id, `${safeName || 'training'}.pptx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PowerPoint-export mislukt');
    } finally { setExporting(false); }
  }

  async function handleExportPdf() {
    if (!training) return;
    setExportingPdf(true); setError('');
    try {
      await handleSave(); // exporteer altijd de meest recente (net opgeslagen) gegevens
      const safeName = (form.titel || 'training').replace(/[^\p{L}\p{N}\-_]+/gu, '_').slice(0, 60);
      await exportTrainingToPdf(training.id, `${safeName || 'training'}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF-export mislukt');
    } finally { setExportingPdf(false); }
  }

  async function handleExportExercise(ex: LocalExercise) {
    if (!training) return;
    setExportingExerciseId(ex.id);
    setError('');
    try {
      // Een nog niet bewaarde oefening heeft geen echt id — sla eerst de hele
      // training op (zelfde aanpak als de volledige PowerPoint-export), en
      // zoek de bewaarde versie terug op haar positie in de lijst.
      const idx = exercises.findIndex(e => e.id === ex.id);
      const saved = await handleSave();
      const savedEx = saved?.exercises[idx];
      if (!savedEx) throw new Error('Oefening niet teruggevonden na opslaan');
      const safeName = (ex.naam || 'oefening').replace(/[^\p{L}\p{N}\-_]+/gu, '_').slice(0, 60);
      await exportExerciseToPptx(savedEx.id, `${safeName || 'oefening'}.pptx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Oefening-export mislukt');
    } finally { setExportingExerciseId(null); }
  }

  async function handleImportExercisePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingExercisePdf(true); setError('');
    try {
      const parsed = await parseTrainingPdf(file);
      if (parsed.exercises.length === 0) {
        setError('Geen oefeningen gevonden in dit PDF-bestand.');
        return;
      }
      const newExs = parsed.exercises.map(exerciseFromParsedPdf);
      setExercises(list => [...list, ...newExs]);
      setExpandedId(newExs[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF-import mislukt');
    } finally { setImportingExercisePdf(false); }
  }

  const pct = wedstrijdvormPercentage(exercises);
  const totalMin = exercises.reduce((a, e) => a + (e.duurMinuten || 0), 0);
  const wedstrijdMin = exercises.filter(e => e.fase === 'wedstrijdvorm').reduce((a, e) => a + (e.duurMinuten || 0), 0);

  if (loading) return <div className="page"><div className="loading-spinner">Training laden...</div></div>;
  if (error && !training) return <div className="page"><div className="empty-state">⚠ {error}</div></div>;
  if (!training) return null;

  const drawingExercise = exercises.find(e => e.id === drawingFor) ?? null;
  const genContext = { hoofdmoment: form.hoofdmoment, spelfase: form.spelfase, teamprincipe: form.teamprincipe, spelprincipe: form.spelprincipe, basisvaardigheid: form.basisvaardigheid };
  const genHasContext = Object.values(genContext).some(v => v.trim());
  const genSuggestions = suggestExercises(genFase, genContext, genOffset, 3);
  const manualSuggestions = extractManualSuggestions(manualText, genFase, genContext, genOffset, 3);
  const claudePrompt = buildOefeningPrompt({
    fase: genFase, doelgroep: category ?? undefined, hasManual: !!manualText.trim(),
    hoofdmoment: form.hoofdmoment, spelfase: form.spelfase,
    teamprincipe: form.teamprincipe, spelprincipe: form.spelprincipe, basisvaardigheid: form.basisvaardigheid,
  });

  const dbFiltered = dbItems
    .filter(it =>
      it.fase === dbFase &&
      (!dbCategorie || it.categorie === dbCategorie) &&
      (!dbDoelgroep || it.doelgroep === dbDoelgroep) &&
      (!dbSearch.trim() || it.naam.toLowerCase().includes(dbSearch.trim().toLowerCase()) || it.teamprincipe.toLowerCase().includes(dbSearch.trim().toLowerCase()))
    )
    .sort((a, b) => {
      const ai = a.doelgroep ? DOELGROEP_LEEFTIJDEN.indexOf(a.doelgroep) : DOELGROEP_LEEFTIJDEN.length;
      const bi = b.doelgroep ? DOELGROEP_LEEFTIJDEN.indexOf(b.doelgroep) : DOELGROEP_LEEFTIJDEN.length;
      return ai - bi || a.naam.localeCompare(b.naam);
    });
  const saveToDbExercise = exercises.find(e => e.id === saveToDbFor) ?? null;
  const dbImportForExercise = exercises.find(e => e.id === dbImportFor) ?? null;
  const canShare = isAdmin || (!!trainer && training.trainer?.id === trainer.id);

  return (
    <div className="page">
      <div className="te-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainingen')}>← Terug</button>
        <div className="te-header-actions">
          {canShare && (
            <button className="btn btn-outline" onClick={openShareModal}>
              🔗 Delen{training.sharedWith.length > 0 ? ` (${training.sharedWith.length})` : ''}
            </button>
          )}
          <button className="btn btn-outline" onClick={() => navigate(`/trainingen/${training.id}/modus`)}>▶ Trainingsmodus</button>
          <button className="btn btn-outline" disabled={exporting || saving} onClick={handleExportPptx}>
            <PowerPointIcon /> {exporting ? 'Exporteren...' : 'Exporteer naar PowerPoint'}
          </button>
          <button className="btn btn-outline" disabled={exportingPdf || saving} onClick={handleExportPdf}>
            <PdfIcon /> {exportingPdf ? 'Exporteren...' : 'Exporteer naar PDF'}
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Opslaan...' : '💾 Opslaan'}</button>
        </div>
      </div>

      {error && <div className="adm-error">⚠ {error}</div>}

      {/* ── Kop ── */}
      <div className="card te-block">
        <button className="te-block-header-btn" onClick={() => setOpenKop(o => !o)}>
          <span className="te-block-title">Trainingsvoorbereiding</span>
          <span className="te-chevron">{openKop ? '▲' : '▼'}</span>
        </button>
        {openKop && (
          <>
            <div className="form-row te-row-5">
              <div className="form-group">
                <label className="input-label">Naam coach</label>
                <input className="input-field" value={form.coachNaam} onChange={e => setForm({ ...form, coachNaam: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="input-label">Datum</label>
                <input type="date" className="input-field" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="input-label">Tijdstip</label>
                <input className="input-field" value={form.tijdstip} onChange={e => setForm({ ...form, tijdstip: e.target.value })} placeholder="bv. 18:30" />
              </div>
              <div className="form-group">
                <label className="input-label">Leeftijdscategorie</label>
                <input className="input-field" value={form.leeftijdscategorie} onChange={e => setForm({ ...form, leeftijdscategorie: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="input-label">Niveau</label>
                <input className="input-field" value={form.niveau} onChange={e => setForm({ ...form, niveau: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Titel</label>
                <input className="input-field" value={form.titel} onChange={e => setForm({ ...form, titel: e.target.value })} placeholder="bv. Linies doorbreken — diagonale passing" />
              </div>
              <div className="form-group">
                <label className="input-label">Duur (min)</label>
                <input type="number" className="input-field" value={form.duurMinuten} min={0}
                  onChange={e => setForm({ ...form, duurMinuten: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="input-label">Aantal spelers</label>
                <input className="input-field" value={form.aantalSpelers} onChange={e => setForm({ ...form, aantalSpelers: e.target.value })} placeholder="bv. 10-14" />
              </div>
              <div className="form-group">
                <label className="input-label">Status</label>
                <select className="input-field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="concept">Concept</option>
                  <option value="klaar">Klaar</option>
                  <option value="afgewerkt">Afgewerkt</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Leren ── */}
      <div className="card te-block">
        <button className="te-block-header-btn" onClick={() => setOpenLeren(o => !o)}>
          <span className="te-block-title">Leren</span>
          <span className="te-chevron">{openLeren ? '▲' : '▼'}</span>
        </button>
        {openLeren && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Hoofdmoment</label>
                <input className="input-field" value={form.hoofdmoment} onChange={e => setForm({ ...form, hoofdmoment: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="input-label">Spelfase</label>
                <input className="input-field" value={form.spelfase} onChange={e => setForm({ ...form, spelfase: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="input-label">Basisvaardigheid</label>
                <input className="input-field" value={form.basisvaardigheid} onChange={e => setForm({ ...form, basisvaardigheid: e.target.value })} />
              </div>
            </div>

            <div className="te-speluitdaging">
              <div className="input-label">Speluitdaging</div>
              <div className="te-speluitdaging-grid">
                <div className="te-su-field">
                  <span className="te-su-pill">Wie</span>
                  <input className="input-field" value={form.speluitdagingWie} onChange={e => setForm({ ...form, speluitdagingWie: e.target.value })} />
                </div>
                <div className="te-su-field">
                  <span className="te-su-pill">Wat</span>
                  <input className="input-field" value={form.speluitdagingWat} onChange={e => setForm({ ...form, speluitdagingWat: e.target.value })} />
                </div>
                <div className="te-su-field">
                  <span className="te-su-pill">Waar</span>
                  <input className="input-field" value={form.speluitdagingWaar} onChange={e => setForm({ ...form, speluitdagingWaar: e.target.value })} />
                </div>
                <div className="te-su-field">
                  <span className="te-su-pill">Wanneer</span>
                  <input className="input-field" value={form.speluitdagingWanneer} onChange={e => setForm({ ...form, speluitdagingWanneer: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Coachingswoorden</label>
                <textarea className="input-field" rows={3} value={form.coachingswoorden} onChange={e => setForm({ ...form, coachingswoorden: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="input-label">Materiaal</label>
                <textarea className="input-field" rows={3} value={form.materiaal} onChange={e => setForm({ ...form, materiaal: e.target.value })} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Actief, fun & individuele aandacht ── */}
      <div className="card te-block">
        <button className="te-block-header-btn" onClick={() => setOpenActief(o => !o)}>
          <span className="te-block-title">Actief, fun &amp; individuele aandacht</span>
          <span className="te-chevron">{openActief ? '▲' : '▼'}</span>
        </button>
        {openActief && (
          <>
            <div className="form-group">
              <label className="input-label">Hoe zorg ik dat de spelers maximaal actief zijn?</label>
              <textarea className="input-field" rows={2} value={form.actiefAanpak} onChange={e => setForm({ ...form, actiefAanpak: e.target.value })}
                placeholder="bv. wisselspelers ook actief met bal, iedereen betrekken en vragen stellen, opwarming altijd met bal" />
            </div>
            <div className="form-group">
              <label className="input-label">Hoe integreer ik fun?</label>
              <textarea className="input-field" rows={2} value={form.funAanpak} onChange={e => setForm({ ...form, funAanpak: e.target.value })}
                placeholder="bv. iedereen speelt evenveel, positieve benadering, interesse tonen in elke speler (connectie)" />
            </div>
            <div className="form-group">
              <label className="input-label">Hoe geef ik individuele aandacht aan elke speler?</label>
              <textarea className="input-field" rows={2} value={form.individueleAandacht} onChange={e => setForm({ ...form, individueleAandacht: e.target.value })}
                placeholder="bv. iedereen bij naam aangesproken, aandacht voor ieders 'rugzak', bankzitters betrokken houden" />
            </div>
          </>
        )}
      </div>

      {/* ── Jaarplan (extra) ── */}
      <div className="card te-block">
        <div className="te-block-title-row">
          <div className="te-block-title">Jaarplan-koppeling <span className="te-extra-badge">extra</span></div>
          <button className="btn btn-outline btn-sm" onClick={applyJaarplan}>↺ Vul in vanuit jaarplan</button>
        </div>
        {form.jaarplanLabel && <div className="te-jaarplan-label">{form.jaarplanLabel}</div>}
        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Teamprincipe</label>
            <input className="input-field" value={form.teamprincipe} onChange={e => setForm({ ...form, teamprincipe: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="input-label">Spelprincipe</label>
            <input className="input-field" value={form.spelprincipe} onChange={e => setForm({ ...form, spelprincipe: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label className="input-label">Focuspunten (basics/tactics)</label>
          <textarea className="input-field" rows={3} value={form.focusPunten} onChange={e => setForm({ ...form, focusPunten: e.target.value })} />
        </div>
      </div>

      {/* ── Trainingsopbouw · trainingsschema ── */}
      <div className="card te-block">
        <div className="te-block-title-row">
          <div className="te-block-title">Trainingsopbouw <span className="te-extra-badge">extra</span></div>
          {form.trainingsschema && (
            <button className="btn btn-outline btn-sm" onClick={vulOefeningenInVanuitSchema}>
              ↺ Vul oefeningen in a.d.h.v. schema
            </button>
          )}
        </div>
        <p className="te-gen-desc">
          Kies een vaste combinatie opwarming → tussenvorm → wedstrijdvorm uit het trainingsschema als basis voor deze training.
        </p>
        <div className="te-schema-groep-tabs">
          {(Object.keys(TRAININGSSCHEMA_GROEP_LABELS) as TrainingsschemaGroep[]).map(g => (
            <button key={g} className={`sb-toggle ${schemaGroep === g ? 'active' : ''}`} onClick={() => setSchemaGroep(g)}>
              {TRAININGSSCHEMA_GROEP_LABELS[g]}
            </button>
          ))}
        </div>
        <div className="te-schema-list">
          {TRAININGSSCHEMAS.filter(s => s.groep === schemaGroep).map(s => (
            <button
              key={s.id}
              className={`te-schema-card ${form.trainingsschema === s.id ? 'active' : ''}`}
              onClick={() => applyTrainingsschema(s.id)}
            >
              <div className="te-schema-row"><span className="tag te-fase-tag te-fase-opwarming">Opw</span>{s.opwarming}</div>
              <div className="te-schema-row"><span className="tag te-fase-tag te-fase-tussenvorm">Tuss</span>{s.tussenvorm}</div>
              <div className="te-schema-row"><span className="tag te-fase-tag te-fase-wedstrijdvorm">Wed</span>{s.wedstrijdvorm}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 50%-check ── */}
      <div className="card te-block">
        <div className="te-block-title-row">
          <div className="te-block-title">Wedstrijdvorm-aandeel</div>
          <span className={`te-pct-label ${pct >= 50 ? 'ok' : 'warn'}`}>{wedstrijdMin}min / {totalMin}min · {pct.toFixed(0)}%</span>
        </div>
        <div className="sz-bar-wrap te-pct-bar">
          <div className={`sz-bar-fill ${pct >= 50 ? 'te-bar-ok' : 'te-bar-warn'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        {pct < 50 && <div className="te-pct-warning">⚠ Minimum 50% wedstrijdvorm volgens de combinatiemethode nog niet bereikt.</div>}
        <div className="te-krachtige-leeromgeving">
          <div className="te-block-title-row"><span className="te-su-pill">Trainersmanual · krachtige leeromgeving</span></div>
          <ul className="te-kl-list">
            {KRACHTIGE_LEEROMGEVING_PRINCIPES.map(p => <li key={p}>{p}</li>)}
          </ul>
        </div>
      </div>

      {/* ── Oefeningen ── */}
      <div className="te-exercises">
        <div className="te-exercises-header">
          <div className="te-block-title">Oefeningen ({exercises.length})</div>
          <div className="te-add-buttons">
            {FASE_ORDER.map(f => (
              <button key={f} className="btn btn-outline btn-sm" onClick={() => addExercise(f)}>+ {EXERCISE_FASE_LABELS[f]}</button>
            ))}
            <button className="btn btn-outline btn-sm" onClick={() => openDbModal()}>📚 Kies uit databank</button>
            <input
              ref={exerciseFileInputRef} type="file" accept="application/pdf"
              style={{ display: 'none' }} onChange={handleImportExercisePdf}
            />
            <button className="btn btn-outline btn-sm" disabled={importingExercisePdf} onClick={() => exerciseFileInputRef.current?.click()}>
              {importingExercisePdf ? 'Bezig met importeren...' : '📄 Importeer oefening uit PDF'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => openGenerator('opwarming')}>✨ Genereer oefening</button>
          </div>
        </div>

        {exercises.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🏃</div>Nog geen oefeningen toegevoegd</div>
        ) : exercises.map((ex, i) => {
          const isOpen = expandedId === ex.id;
          return (
            <div key={ex.id} className="card te-ex-card">
              <button className="te-ex-header" onClick={() => setExpandedId(isOpen ? null : ex.id)}>
                <span className={`tag te-fase-tag te-fase-${ex.fase}`}>{EXERCISE_FASE_LABELS[ex.fase]}</span>
                <span className="te-ex-name">{ex.naam || 'Naamloze oefening'}</span>
                <span className="te-ex-duur">{ex.duurMinuten}min</span>
                <span className="te-chevron">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="te-ex-body">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="input-label">Naam</label>
                      <input className="input-field" value={ex.naam} onChange={e => updateLocal(ex.id, { naam: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="input-label">Trainingsonderdeel</label>
                      <select className="input-field" value={ex.fase} onChange={e => updateLocal(ex.id, { fase: e.target.value as ExerciseFase })}>
                        {FASE_ORDER.map(f => <option key={f} value={f}>{EXERCISE_FASE_LABELS[f]}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="te-organisatie">
                    <div className="input-label">Organisatie oefening</div>
                    <div className="te-organisatie-grid">
                      <div className="form-group">
                        <label className="input-label te-su-pill">Duur (min)</label>
                        <input type="number" className="input-field" min={0} value={ex.duurMinuten}
                          onChange={e => updateLocal(ex.id, { duurMinuten: parseInt(e.target.value) || 0 })} />
                      </div>
                      <div className="form-group">
                        <label className="input-label te-su-pill">Aantal spelers</label>
                        <input className="input-field" value={ex.organisatieSpelers} onChange={e => updateLocal(ex.id, { organisatieSpelers: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="input-label te-su-pill">Afmetingen</label>
                        <input className="input-field" value={ex.organisatieAfmetingen} onChange={e => updateLocal(ex.id, { organisatieAfmetingen: e.target.value })} placeholder="bv. 20m x 15m" />
                      </div>
                      <div className="form-group">
                        <label className="input-label te-su-pill">Materiaal</label>
                        <input className="input-field" value={ex.organisatieMateriaal} onChange={e => updateLocal(ex.id, { organisatieMateriaal: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="input-label">Beschrijving oefening</label>
                    <textarea
                      className="input-field te-autogrow" rows={3} ref={autoGrowTextarea} value={ex.beschrijving}
                      onChange={e => { updateLocal(ex.id, { beschrijving: e.target.value }); autoGrowTextarea(e.target); }}
                      placeholder="Opstelling, spelregels, verloop..."
                    />
                  </div>

                  <div className="te-ex-drawing">
                    <div className="input-label">Tekening oefening</div>
                    <DrawingCanvas scene={parseDrawingScene(ex.drawingData)} readOnly />
                    <button className="btn btn-outline btn-sm" onClick={() => setDrawingFor(ex.id)}>🎨 Teken oefening</button>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="input-label">Coaching</label>
                      <textarea className="input-field" rows={2} value={ex.coachingPunten} onChange={e => updateLocal(ex.id, { coachingPunten: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="input-label">Maximaal actief</label>
                      <textarea className="input-field" rows={2} value={ex.maximaalActief} onChange={e => updateLocal(ex.id, { maximaalActief: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="input-label">Fun</label>
                      <textarea className="input-field" rows={2} value={ex.fun} onChange={e => updateLocal(ex.id, { fun: e.target.value })} />
                    </div>
                  </div>

                  <div className="te-ex-footer">
                    <div className="te-reorder-btns">
                      <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => moveExercise(ex.id, -1)}>▲ Omhoog</button>
                      <button className="btn btn-ghost btn-sm" disabled={i === exercises.length - 1} onClick={() => moveExercise(ex.id, 1)}>▼ Omlaag</button>
                      <button className="btn btn-outline btn-sm" onClick={() => duplicateExercise(ex.id)}>📄 Dupliceer oefening</button>
                      <button className="btn btn-outline btn-sm" onClick={() => openDbModal(ex)}>📚 Importeer uit databank</button>
                      <button className="btn btn-outline btn-sm" onClick={() => openSaveToDb(ex)}>💾 Bewaar in databank</button>
                      <button className="btn btn-outline btn-sm" disabled={exportingExerciseId === ex.id} onClick={() => handleExportExercise(ex)}>
                        <PowerPointIcon size={14} /> {exportingExerciseId === ex.id ? 'Exporteren...' : 'Exporteer oefening'}
                      </button>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeExercise(ex.id)}>🗑️ Verwijderen</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Reflectie · 360° evaluatie ── */}
      <div className="card te-block">
        <div className="te-block-title">Reflectie · 360° evaluatie na training</div>
        <div className="form-row">
          <div className="form-group">
            <label className="input-label">Wat zou jij behouden van deze training?</label>
            <textarea className="input-field" rows={3} value={form.evalBehouden} onChange={e => setForm({ ...form, evalBehouden: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="input-label">Wat zou jij wijzigen aan deze training?</label>
            <textarea className="input-field" rows={3} value={form.evalWijzigen} onChange={e => setForm({ ...form, evalWijzigen: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label className="input-label">Waren de spelers actief?</label>
          <textarea className="input-field" rows={2} value={form.evalWarenActief} onChange={e => setForm({ ...form, evalWarenActief: e.target.value })}
            placeholder="Hebben spelers gezweet? Niet stilgestaan? Was er interactie? Was de opwarming actief (iedereen een bal)?" />
        </div>
        <div className="form-group">
          <label className="input-label">Hadden de spelers fun?</label>
          <textarea className="input-field" rows={2} value={form.evalHaddenFun} onChange={e => setForm({ ...form, evalHaddenFun: e.target.value })}
            placeholder="Wedstrijdjes gespeeld? Ruimte voor interactie/humor? Winmomenten? Interesse getoond in iedere speler?" />
        </div>
        <div className="form-group">
          <label className="input-label">Hebben de spelers bijgeleerd?</label>
          <textarea className="input-field" rows={2} value={form.evalBijgeleerd} onChange={e => setForm({ ...form, evalBijgeleerd: e.target.value })}
            placeholder="Stonden wedstrijdvormen (50%) centraal? Wedstrijdecht (richting, posities, spelregels)? Konden spelers het thema zelf benoemen?" />
        </div>
        <div className="form-group">
          <label className="input-label">Gaf je individuele aandacht aan elke speler?</label>
          <textarea className="input-field" rows={2} value={form.evalIndividueleAandacht} onChange={e => setForm({ ...form, evalIndividueleAandacht: e.target.value })}
            placeholder="Iedereen min. 1x bij naam aangesproken? Bankzitters betrokken? Iedereen evenveel gespeeld? Schouderklopjes gegeven?" />
        </div>
      </div>

      {/* ── Tekentool fullscreen modal ── */}
      {drawingExercise && (
        <div className="modal-overlay te-draw-overlay" onClick={e => e.target === e.currentTarget && setDrawingFor(null)}>
          <div className="te-draw-modal">
            <div className="te-draw-modal-header">
              <span>{drawingExercise.naam || 'Oefening'} — tekening</span>
              <button className="btn btn-primary btn-sm" onClick={() => setDrawingFor(null)}>Klaar</button>
            </div>
            <DrawingCanvas
              scene={parseDrawingScene(drawingExercise.drawingData)}
              onChange={scene => updateLocal(drawingExercise.id, { drawingData: JSON.stringify(scene) })}
            />
          </div>
        </div>
      )}

      {/* ── Genereer-oefening modal (lokale bibliotheek, geen API) ── */}
      {genModalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setGenModalOpen(false)}>
          <div className="modal te-gen-modal">
            <div className="modal-title">✨ Genereer oefening</div>
            <p className="te-gen-desc">
              Lokale voorstellen uit de oefeningenbibliotheek (Trainersmanual U10/U11 + jaarplan) — geen externe AI-oproep.
            </p>

            <div className="te-gen-fase-tabs">
              {FASE_ORDER.map(f => (
                <button key={f} className={`sb-toggle ${genFase === f ? 'active' : ''}`}
                  onClick={() => { setGenFase(f); setGenOffset(0); }}>{EXERCISE_FASE_LABELS[f]}</button>
              ))}
            </div>

            {!genHasContext && (
              <div className="te-gen-hint">
                ℹ Vul eerst "Leren" (hoofdmoment/spelfase) of de jaarplan-koppeling in voor gerichte suggesties — nu tonen we algemene oefeningen.
              </div>
            )}

            {genSuggestions.length === 0 ? (
              <div className="te-gen-hint">Geen oefeningen gevonden voor deze fase.</div>
            ) : (
              <div className="te-gen-list">
                {genSuggestions.map(s => (
                  <div key={s.id} className="te-gen-card">
                    <div className="te-gen-card-top">
                      <span className="te-gen-card-name">{s.naam}</span>
                      <span className="te-gen-card-duur">{s.duurMinuten}min</span>
                    </div>
                    <div className="te-gen-card-desc">{s.beschrijving}</div>
                    <div className="te-gen-card-drawing">
                      <DrawingCanvas scene={s.scene} readOnly />
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => useSuggestion(s)}>Gebruik deze oefening</button>
                  </div>
                ))}
              </div>
            )}

            {manualText.trim() && (
              <>
                <div className="te-gen-manual-title">📄 Uit jouw manual</div>
                {manualSuggestions.length === 0 ? (
                  <div className="te-gen-hint">Geen passende fragmenten gevonden in je manual voor deze fase.</div>
                ) : (
                  <div className="te-gen-list">
                    {manualSuggestions.map((s, i) => (
                      <div key={i} className="te-gen-card">
                        <div className="te-gen-card-desc">{s.text}</div>
                        <button className="btn btn-primary btn-sm" onClick={() => useManualSuggestion(s.text)}>Gebruik deze tekst</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="te-gen-manual-title">🤖 Genereer met Claude</div>
            <p className="te-gen-hint">
              Kopieer deze prompt naar je eigen Claude-project (bv. met je trainersmanual als projectkennis),
              en plak het antwoord hieronder terug om het rechtstreeks als oefening te importeren.
            </p>
            <textarea className="input-field te-claude-prompt" rows={6} readOnly value={claudePrompt} onClick={e => (e.target as HTMLTextAreaElement).select()} />
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => handleCopyPrompt(claudePrompt)}>
                {promptCopied ? '✓ Gekopieerd' : '📋 Kopieer prompt'}
              </button>
              <a className="btn btn-outline btn-sm" href="https://claude.ai/" target="_blank" rel="noopener noreferrer">Open Claude ↗</a>
            </div>

            <label className="input-label" style={{ marginTop: 14, display: 'block' }}>Plak hier het antwoord van Claude</label>
            <textarea className="input-field te-claude-prompt" rows={6} value={claudeResponse} onChange={e => setClaudeResponse(e.target.value)}
              placeholder={'Naam: ...\nDuur (minuten): ...\nBeschrijving: ...'} />
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={!claudeResponse.trim()} onClick={useClaudeResponse}>
                📥 Importeer als oefening
              </button>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setGenOffset(o => o + 3)}>🔄 Andere voorstellen</button>
              <button className="btn btn-outline" onClick={() => setGenModalOpen(false)}>Sluiten</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kies-uit-databank modal ── */}
      {dbModalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setDbModalOpen(false), setDbImportFor(null))}>
          <div className="modal te-gen-modal">
            <div className="modal-title">
              📚 {dbImportForExercise ? `Importeer in "${dbImportForExercise.naam || 'oefening'}"` : 'Kies uit oefendatabank'}
            </div>
            <p className="te-gen-desc">
              {dbImportForExercise
                ? 'Vul deze oefening volledig aan met een oefening uit de oefendatabank — alle velden (organisatie, beschrijving, tekening, coaching) worden overschreven.'
                : 'Herbruikbare oefeningen die trainers eerder in de oefendatabank bewaarden.'}
            </p>

            <div className="te-gen-fase-tabs">
              {FASE_ORDER.map(f => (
                <button key={f} className={`sb-toggle ${dbFase === f ? 'active' : ''}`} onClick={() => setDbFase(f)}>{EXERCISE_FASE_LABELS[f]}</button>
              ))}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="input-label">Categorie</label>
                <select className="input-field" value={dbCategorie} onChange={e => setDbCategorie(e.target.value as OefeningCategorie | '')}>
                  <option value="">Alle categorieën</option>
                  <option value="B+">Bal+ (aanvallend)</option>
                  <option value="B-">Bal- (verdedigend)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="input-label">Doelgroep</label>
                <select className="input-field" value={dbDoelgroep} onChange={e => setDbDoelgroep(e.target.value as Doelgroep | '')}>
                  <option value="">Alle doelgroepen</option>
                  {DOELGROEP_LEEFTIJDEN.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="input-label">Zoeken</label>
              <input className="input-field" value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="Naam of teamprincipe..." />
            </div>

            {dbFiltered.length === 0 ? (
              <div className="te-gen-hint">Geen oefeningen in de databank voor deze filters.</div>
            ) : (
              <div className="te-gen-list">
                {dbFiltered.map(it => (
                  <div key={it.id} className="te-gen-card">
                    <div className="te-gen-card-top">
                      <span className="te-gen-card-name">{it.naam}</span>
                      <span className="te-gen-card-duur">{it.duurMinuten}min</span>
                    </div>
                    {(it.categorie || it.doelgroep || it.teamprincipe || it.spelprincipe) && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        {it.categorie && <span className={`tag ${it.categorie === 'B+' ? 'tag-green' : 'tag-black'}`}>{it.categorie}</span>}
                        {it.doelgroep && <span className="tag tag-black">{it.doelgroep}</span>}
                        {it.teamprincipe && <span className="od-card-teamprincipe">{it.teamprincipe}</span>}
                        {it.spelprincipe && <span className="od-card-teamprincipe">{SPELPRINCIPE_LABELS[it.spelprincipe]}</span>}
                      </div>
                    )}
                    <div className="te-gen-card-desc">{it.beschrijving}</div>
                    <div className="te-gen-card-drawing">
                      <DrawingCanvas scene={parseDrawingScene(it.drawingData)} readOnly />
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => useDbItem(it)}>
                      {dbImportForExercise ? 'Importeer deze oefening' : 'Gebruik deze oefening'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setDbModalOpen(false); setDbImportFor(null); }}>Sluiten</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bewaar-in-databank modal ── */}
      {saveToDbExercise && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSaveToDbFor(null)}>
          <div className="modal">
            <div className="modal-title">💾 Bewaar "{saveToDbExercise.naam || 'oefening'}" in databank</div>
            <div className="form-group">
              <label className="input-label">Categorie</label>
              <select className="input-field" value={saveToDbCategorie} onChange={e => setSaveToDbCategorie(e.target.value as OefeningCategorie | '')}>
                <option value="">— geen —</option>
                <option value="B+">Bal+ (aanvallend)</option>
                <option value="B-">Bal- (verdedigend)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Doelgroep</label>
              <select className="input-field" value={saveToDbDoelgroep} onChange={e => setSaveToDbDoelgroep(e.target.value as Doelgroep | '')}>
                <option value="">— alle leeftijden —</option>
                {DOELGROEP_LEEFTIJDEN.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Teamprincipe</label>
              <input className="input-field" value={saveToDbTeamprincipe} onChange={e => setSaveToDbTeamprincipe(e.target.value)} placeholder="bv. Opbouw via de doelman" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSaveToDbFor(null)}>Annuleer</button>
              <button className="btn btn-primary" disabled={savingToDb} onClick={handleSaveToDb}>{savingToDb ? 'Bewaren...' : 'Bewaar in databank'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delen-modal ── */}
      {shareModalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShareModalOpen(false)}>
          <div className="modal">
            <div className="modal-title">🔗 Training delen</div>
            <p style={{ color: 'var(--text-mid)', marginBottom: 16, lineHeight: 1.6 }}>
              Geselecteerde trainers kunnen deze training bekijken en er een eigen, bewerkbare kopie van maken.
              Ze kunnen het origineel niet wijzigen.
            </p>
            {!shareTrainersLoaded ? (
              <div className="loading-spinner">Trainers laden...</div>
            ) : shareTrainers.length === 0 ? (
              <div className="empty-state">Geen andere trainers gevonden</div>
            ) : (
              <div className="te-share-list">
                {shareTrainers.map(t => (
                  <label key={t.id} className="te-share-row">
                    <input
                      type="checkbox"
                      checked={shareSelected.has(t.id)}
                      onChange={() => toggleShareTrainer(t.id)}
                    />
                    <span className="te-share-name">{t.name}</span>
                    <span className="te-share-team">{t.team ? `${t.team.name} (${t.team.category})` : 'Geen ploeg'}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShareModalOpen(false)}>Annuleer</button>
              <button className="btn btn-primary" disabled={shareSaving || !shareTrainersLoaded} onClick={handleSaveShare}>
                {shareSaving ? 'Bewaren...' : 'Delen bewaren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
