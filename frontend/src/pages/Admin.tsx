import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getTeams, createTeam, updateTeam, deleteTeam, Team,
  getTrainers, createTrainer, updateTrainer, deleteTrainer, TrainerRecord,
  getAllPlayersWithTeam, assignPlayerToTeam, PlayerWithTeam,
  createPlayer, updatePlayer, deletePlayer,
  getWeekThemes, createWeekTheme, updateWeekTheme, deleteWeekTheme, WeekTheme, THEME_CATEGORY_LABELS,
  POSITION_LABELS, POSITIONS,
  exportAllData, downloadJSON, countFullDataExport, parseFullDataExportFile,
  wipeAllSportData, importAllData, FullDataExport, ImportProgress, ImportResult,
  exportTrainingenData, countTrainingenExport, parseTrainingenExportFile, importTrainingenData, TrainingenExport,
  exportOefendatabankData, countOefendatabankExport, parseOefendatabankExportFile, importOefendatabankData, OefendatabankExport,
} from '../lib/api';
import { CATEGORY_FORMAT } from '../lib/teamConfig';
import { useTeam } from '../lib/TeamContext';
import './Admin.css';

const CATEGORIES = Object.keys(CATEGORY_FORMAT);
const categoryRank = (c: string) => { const i = CATEGORIES.indexOf(c); return i === -1 ? 99 : i; };
const teamLabel = (t: { name: string; category: string }) => `${t.name} (${t.category})`;

const ENTITY_LABELS: Record<string, string> = {
  teams: 'Ploegen', weekThemes: "Weekthema's", trainers: 'Trainers', players: 'Spelers',
  matches: 'Wedstrijden', periods: 'Periodes', goals: 'Doelpunten', attendances: 'Aanwezigheden',
  playTimeSessions: 'Speeltijdsessies', evaluations: 'Evaluaties',
  trainings: 'Trainingen', exercises: 'Oefeningen (in trainingen)', oefeningDatabank: 'Oefendatabank',
  trainingen: 'Trainingen', oefeningen: 'Oefeningen',
  matchLineups: 'Opstellingen', lineupProposals: 'Opstellingsvoorstellen', whiteboards: 'Whiteboards',
};

const WIPE_CONFIRM_WORD = 'VERWIJDER';
/** Speciale waarde in selects voor "geen ploeg" / "niet gekoppeld". */
const NONE = '__none__';

const TABS = ['overview', 'teams', 'trainers', 'players', 'themes', 'data'] as const;
type Tab = typeof TABS[number];

type Notice = { kind: 'ok' | 'err'; msg: string } | null;

const EMPTY_PLAYER_FORM = { name: '', number: '', position: '', position2: '', active: 'true', teamId: '' };

export default function Admin() {
  const { trainer: currentTrainer } = useTeam();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const tab: Tab = tabParam && (TABS as readonly string[]).includes(tabParam) ? tabParam : 'overview';
  function setTab(t: Tab) {
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('tab', t); return n; }, { replace: true });
  }

  const [teams, setTeams]       = useState<Team[]>([]);
  const [trainers, setTrainers] = useState<TrainerRecord[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerWithTeam[]>([]);
  const [themes, setThemes]     = useState<WeekTheme[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notice, setNotice]     = useState<Notice>(null);
  const [error, setError]       = useState('');

  // ── Team state ────────────────────────────────────────────────────────────
  const [teamModal, setTeamModal] = useState(false);
  const [editTeam, setEditTeam]   = useState<Team | null>(null);
  const [teamForm, setTeamForm]   = useState({ name: '', category: 'U8', club: '', active: 'true' });
  const [saving, setSaving]       = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamConfirmDelete, setTeamConfirmDelete] = useState<Team | null>(null);

  // ── Trainer state ─────────────────────────────────────────────────────────
  const [trainerModal, setTrainerModal]   = useState(false);
  const [editTrainer, setEditTrainer]     = useState<TrainerRecord | null>(null);
  const [trainerForm, setTrainerForm]     = useState({ name: '', email: '', password: '', role: 'trainer', teamId: '' });
  const [trainerSaving, setTrainerSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TrainerRecord | null>(null);
  const [trainerSearch, setTrainerSearch] = useState('');
  const [trainerFilter, setTrainerFilter] = useState<'all' | 'admin' | 'trainer' | 'noteam'>('all');

  // ── Player state ──────────────────────────────────────────────────────────
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerTeamFilter, setPlayerTeamFilter] = useState(''); // '' = alle, NONE = niet gekoppeld, anders teamId
  const [hideInactive, setHideInactive] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [bulkTeamId, setBulkTeamId]    = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [playerModal, setPlayerModal]  = useState(false);
  const [editPlayer, setEditPlayer]    = useState<PlayerWithTeam | null>(null);
  const [playerForm, setPlayerForm]    = useState(EMPTY_PLAYER_FORM);
  const [playerSaving, setPlayerSaving] = useState(false);
  const [assigningPlayer, setAssigningPlayer] = useState<string | null>(null);
  const [playerConfirmDelete, setPlayerConfirmDelete] = useState<PlayerWithTeam | null>(null);

  // ── Week theme state ──────────────────────────────────────────────────────
  const [themeModal, setThemeModal]   = useState(false);
  const [editTheme, setEditTheme]     = useState<WeekTheme | null>(null);
  const [themeForm, setThemeForm]     = useState({ title: '', category: 'B+', description: '' });
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeConfirmDelete, setThemeConfirmDelete] = useState<WeekTheme | null>(null);
  const [themeFilter, setThemeFilter] = useState<'all' | 'B+' | 'B-' | 'inactive'>('all');

  // ── Data export/import state ──────────────────────────────────────────────
  const [exporting, setExporting]           = useState(false);
  const [exportError, setExportError]       = useState('');
  const [importFile, setImportFile]         = useState<File | null>(null);
  const [importPreview, setImportPreview]   = useState<FullDataExport | null>(null);
  const [importFileError, setImportFileError] = useState('');
  const [wipeFirst, setWipeFirst]           = useState(false);
  const [wipeTypedConfirm, setWipeTypedConfirm] = useState('');
  const [importing, setImporting]           = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult]     = useState<ImportResult | null>(null);
  const [importStage, setImportStage]       = useState<'idle' | 'wiping' | 'importing' | 'done'>('idle');
  const [dataScope, setDataScope] = useState<'alles' | 'trainingen' | 'oefendatabank'>('alles');

  const [trExporting, setTrExporting]           = useState(false);
  const [trExportError, setTrExportError]       = useState('');
  const [trImportFile, setTrImportFile]         = useState<File | null>(null);
  const [trImportPreview, setTrImportPreview]   = useState<TrainingenExport | null>(null);
  const [trImportFileError, setTrImportFileError] = useState('');
  const [trImportTeamId, setTrImportTeamId]     = useState('');
  const [trImporting, setTrImporting]           = useState(false);
  const [trImportProgress, setTrImportProgress] = useState<ImportProgress | null>(null);
  const [trImportResult, setTrImportResult]     = useState<ImportResult | null>(null);

  const [odExporting, setOdExporting]           = useState(false);
  const [odExportError, setOdExportError]       = useState('');
  const [odImportFile, setOdImportFile]         = useState<File | null>(null);
  const [odImportPreview, setOdImportPreview]   = useState<OefendatabankExport | null>(null);
  const [odImportFileError, setOdImportFileError] = useState('');
  const [odImporting, setOdImporting]           = useState(false);
  const [odImportProgress, setOdImportProgress] = useState<ImportProgress | null>(null);
  const [odImportResult, setOdImportResult]     = useState<ImportResult | null>(null);

  useEffect(() => { load(); }, []);

  // Melding verdwijnt vanzelf.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.kind === 'ok' ? 3000 : 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Escape sluit het openstaande venster.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setTeamModal(false); setTrainerModal(false); setPlayerModal(false); setThemeModal(false);
      setConfirmDelete(null); setPlayerConfirmDelete(null); setThemeConfirmDelete(null); setTeamConfirmDelete(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function load() {
    try {
      const [t, tr, p, th] = await Promise.all([getTeams(), getTrainers(), getAllPlayersWithTeam(), getWeekThemes()]);
      setTeams(t); setTrainers(tr); setAllPlayers(p); setThemes(th);
    } catch (e) {
      setNotice({ kind: 'err', msg: 'Laden mislukt: ' + errMsg(e) });
    } finally { setLoading(false); }
  }

  /** Voert een actie uit, herlaadt de data en toont een melding. */
  async function run(action: () => Promise<unknown>, okMsg?: string) {
    try {
      await action();
      await load();
      if (okMsg) setNotice({ kind: 'ok', msg: okMsg });
      return true;
    } catch (e) {
      setNotice({ kind: 'err', msg: errMsg(e) });
      return false;
    }
  }

  // ── Afgeleide data ────────────────────────────────────────────────────────

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name)),
    [teams],
  );

  const stats = useMemo(() => {
    const playersByTeam = new Map<string, PlayerWithTeam[]>();
    const trainersByTeam = new Map<string, TrainerRecord[]>();
    for (const p of allPlayers) if (p.team) playersByTeam.set(p.team.id, [...(playersByTeam.get(p.team.id) ?? []), p]);
    for (const tr of trainers) if (tr.team) trainersByTeam.set(tr.team.id, [...(trainersByTeam.get(tr.team.id) ?? []), tr]);

    // Dubbele rugnummers binnen dezelfde ploeg.
    const duplicateNumberIds = new Set<string>();
    const duplicateNumberTeams: { team: Team; numbers: number[] }[] = [];
    for (const t of teams) {
      const seen = new Map<number, string[]>();
      for (const p of playersByTeam.get(t.id) ?? []) {
        if (p.number == null || p.active === 'false') continue;
        seen.set(p.number, [...(seen.get(p.number) ?? []), p.id]);
      }
      const dups: number[] = [];
      for (const [num, ids] of seen) if (ids.length > 1) { dups.push(num); ids.forEach(id => duplicateNumberIds.add(id)); }
      if (dups.length) duplicateNumberTeams.push({ team: t, numbers: dups.sort((a, b) => a - b) });
    }

    return {
      playersByTeam, trainersByTeam, duplicateNumberIds, duplicateNumberTeams,
      unassignedPlayers: allPlayers.filter(p => !p.team),
      teamlessTrainers: trainers.filter(tr => !tr.team),
      teamsWithoutTrainer: sortedTeams.filter(t => t.active !== 'false' && !(trainersByTeam.get(t.id)?.length)),
      teamsWithoutPlayers: sortedTeams.filter(t => t.active !== 'false' && !(playersByTeam.get(t.id)?.length)),
      activePlayers: allPlayers.filter(p => p.active !== 'false').length,
      admins: trainers.filter(tr => tr.role === 'admin').length,
      activeThemes: themes.filter(t => t.active === 'true').length,
    };
  }, [allPlayers, trainers, teams, sortedTeams, themes]);

  // ── Week theme CRUD ───────────────────────────────────────────────────────

  function openThemeCreate() {
    setEditTheme(null); setThemeForm({ title: '', category: 'B+', description: '' }); setError(''); setThemeModal(true);
  }
  function openThemeEdit(t: WeekTheme) {
    setEditTheme(t); setThemeForm({ title: t.title, category: t.category, description: t.description ?? '' }); setError(''); setThemeModal(true);
  }
  async function handleSaveTheme() {
    if (!themeForm.title.trim()) return;
    setThemeSaving(true); setError('');
    try {
      const data = { title: themeForm.title.trim(), category: themeForm.category, description: themeForm.description };
      if (editTheme) await updateWeekTheme(editTheme.id, data);
      else await createWeekTheme(data);
      setThemeModal(false); await load();
      setNotice({ kind: 'ok', msg: editTheme ? 'Weekthema bijgewerkt' : 'Weekthema aangemaakt' });
    } catch (e) { setError(errMsg(e)); } finally { setThemeSaving(false); }
  }
  function handleToggleThemeActive(t: WeekTheme) {
    run(() => updateWeekTheme(t.id, { active: t.active === 'true' ? 'false' : 'true' }));
  }
  function handleDeleteTheme(t: WeekTheme) {
    setThemeConfirmDelete(null);
    run(() => deleteWeekTheme(t.id), `Weekthema "${t.title}" verwijderd`);
  }

  // ── Data export/import ────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true); setExportError('');
    try {
      downloadJSON(await exportAllData(), `kfc-lennik-export-${today()}.json`);
    } catch (e) { setExportError(errMsg(e, 'Export mislukt')); }
    finally { setExporting(false); }
  }

  async function handleImportFileChange(file: File | null) {
    setImportFile(file); setImportPreview(null); setImportFileError(''); setImportResult(null);
    setWipeFirst(false); setWipeTypedConfirm('');
    if (!file) return;
    try { setImportPreview(await parseFullDataExportFile(file)); }
    catch (e) { setImportFileError(errMsg(e, 'Kon bestand niet lezen')); }
  }

  async function handleRunImport() {
    if (!importPreview) return;
    if (wipeFirst && wipeTypedConfirm !== WIPE_CONFIRM_WORD) return;
    const confirmMsg = wipeFirst
      ? 'Dit wist EERST alle bestaande ploegen, spelers, wedstrijden, speeltijden, doelpunten en evaluaties, en importeert daarna het bestand. Trainersaccounts blijven behouden. Doorgaan?'
      : 'Dit voegt de data uit het bestand toe aan de bestaande data (niets wordt overschreven). Doorgaan?';
    if (!confirm(confirmMsg)) return;

    setImporting(true); setImportResult(null);
    try {
      if (wipeFirst) { setImportStage('wiping'); await wipeAllSportData(); }
      setImportStage('importing');
      const result = await importAllData(importPreview, p => setImportProgress(p));
      setImportResult(result); setImportStage('done');
      await load();
    } catch (e) {
      setImportFileError(errMsg(e, 'Import mislukt')); setImportStage('idle');
    } finally { setImporting(false); setImportProgress(null); }
  }

  async function handleExportTrainingen() {
    setTrExporting(true); setTrExportError('');
    try { downloadJSON(await exportTrainingenData(), `kfc-lennik-trainingen-${today()}.json`); }
    catch (e) { setTrExportError(errMsg(e, 'Export mislukt')); }
    finally { setTrExporting(false); }
  }

  async function handleTrImportFileChange(file: File | null) {
    setTrImportFile(file); setTrImportPreview(null); setTrImportFileError(''); setTrImportResult(null); setTrImportTeamId('');
    if (!file) return;
    try { setTrImportPreview(await parseTrainingenExportFile(file)); }
    catch (e) { setTrImportFileError(errMsg(e, 'Kon bestand niet lezen')); }
  }

  async function handleRunTrImport() {
    if (!trImportPreview) return;
    if (!confirm('Dit voegt de trainingen + oefeningen uit het bestand toe aan de bestaande data. Doorgaan?')) return;
    setTrImporting(true); setTrImportResult(null);
    try { setTrImportResult(await importTrainingenData(trImportPreview, trImportTeamId || undefined, p => setTrImportProgress(p))); }
    catch (e) { setTrImportFileError(errMsg(e, 'Import mislukt')); }
    finally { setTrImporting(false); setTrImportProgress(null); }
  }

  async function handleExportOefendatabank() {
    setOdExporting(true); setOdExportError('');
    try { downloadJSON(await exportOefendatabankData(), `kfc-lennik-oefendatabank-${today()}.json`); }
    catch (e) { setOdExportError(errMsg(e, 'Export mislukt')); }
    finally { setOdExporting(false); }
  }

  async function handleOdImportFileChange(file: File | null) {
    setOdImportFile(file); setOdImportPreview(null); setOdImportFileError(''); setOdImportResult(null);
    if (!file) return;
    try { setOdImportPreview(await parseOefendatabankExportFile(file)); }
    catch (e) { setOdImportFileError(errMsg(e, 'Kon bestand niet lezen')); }
  }

  async function handleRunOdImport() {
    if (!odImportPreview) return;
    if (!confirm('Dit voegt de oefeningen uit het bestand toe aan de bestaande oefendatabank. Doorgaan?')) return;
    setOdImporting(true); setOdImportResult(null);
    try { setOdImportResult(await importOefendatabankData(odImportPreview, p => setOdImportProgress(p))); }
    catch (e) { setOdImportFileError(errMsg(e, 'Import mislukt')); }
    finally { setOdImporting(false); setOdImportProgress(null); }
  }

  // ── Team CRUD ─────────────────────────────────────────────────────────────

  function openTeamCreate() {
    setEditTeam(null); setTeamForm({ name: '', category: 'U8', club: teams[0]?.club ?? '', active: 'true' }); setError(''); setTeamModal(true);
  }
  function openTeamEdit(t: Team) {
    setEditTeam(t); setTeamForm({ name: t.name, category: t.category, club: t.club, active: t.active === 'false' ? 'false' : 'true' }); setError(''); setTeamModal(true);
  }
  async function handleSaveTeam() {
    if (!teamForm.name.trim()) return;
    setSaving(true); setError('');
    try {
      const data = { name: teamForm.name.trim(), category: teamForm.category, club: teamForm.club };
      if (editTeam) await updateTeam(editTeam.id, { ...data, active: teamForm.active });
      else await createTeam(data);
      setTeamModal(false); await load();
      setNotice({ kind: 'ok', msg: editTeam ? 'Ploeg bijgewerkt' : `Ploeg "${data.name}" aangemaakt` });
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  }
  function handleDeleteTeam(t: Team) {
    setTeamConfirmDelete(null);
    run(() => deleteTeam(t.id), `Ploeg "${t.name}" verwijderd`);
  }
  function showTeamPlayers(teamId: string) {
    setPlayerTeamFilter(teamId); setPlayerSearch(''); setSelectedPlayers(new Set()); setTab('players');
  }

  // ── Trainer CRUD ──────────────────────────────────────────────────────────

  function openTrainerCreate(teamId = '') {
    setEditTrainer(null); setTrainerForm({ name: '', email: '', password: '', role: 'trainer', teamId }); setError(''); setTrainerModal(true);
  }
  function openTrainerEdit(tr: TrainerRecord) {
    setEditTrainer(tr); setTrainerForm({ name: tr.name, email: tr.email, password: '', role: tr.role, teamId: tr.team?.id ?? '' }); setError(''); setTrainerModal(true);
  }
  async function handleSaveTrainer() {
    if (!trainerForm.name.trim() || !trainerForm.email.trim()) return;
    if (!editTrainer && !trainerForm.password) return;
    setTrainerSaving(true); setError('');
    try {
      if (editTrainer) {
        const d: Record<string, unknown> = { name: trainerForm.name.trim(), email: trainerForm.email.trim(), role: trainerForm.role };
        if (trainerForm.password) d.password = trainerForm.password;
        d.team = trainerForm.teamId ? { connect: { id: trainerForm.teamId } } : { disconnect: true };
        await updateTrainer(editTrainer.id, d);
      } else {
        await createTrainer({ name: trainerForm.name.trim(), email: trainerForm.email.trim(), password: trainerForm.password, role: trainerForm.role, teamId: trainerForm.teamId || undefined });
      }
      setTrainerModal(false); await load();
      setNotice({ kind: 'ok', msg: editTrainer ? 'Trainer bijgewerkt' : `Trainer "${trainerForm.name.trim()}" aangemaakt` });
    } catch (e) { setError(errMsg(e)); } finally { setTrainerSaving(false); }
  }
  function handleDeleteTrainer(tr: TrainerRecord) {
    setConfirmDelete(null);
    if (tr.id === currentTrainer?.id) { setNotice({ kind: 'err', msg: 'Je kunt je eigen account niet verwijderen.' }); return; }
    run(() => deleteTrainer(tr.id), `Trainer "${tr.name}" verwijderd`);
  }
  function handleAssignTrainerTeam(tr: TrainerRecord, teamId: string) {
    const d = teamId ? { team: { connect: { id: teamId } } } : { team: { disconnect: true } };
    const t = teams.find(x => x.id === teamId);
    run(() => updateTrainer(tr.id, d), t ? `${tr.name} gekoppeld aan ${t.name}` : `${tr.name} ontkoppeld`);
  }
  function handleChangeRole(tr: TrainerRecord, role: string) {
    if (tr.id === currentTrainer?.id) return; // eigen adminrechten niet per ongeluk afnemen
    run(() => updateTrainer(tr.id, { role }), `${tr.name} is nu ${role}`);
  }

  // ── Player management ─────────────────────────────────────────────────────

  async function handleAssignPlayer(p: PlayerWithTeam, teamId: string) {
    setAssigningPlayer(p.id);
    await run(() => assignPlayerToTeam(p.id, teamId || null));
    setAssigningPlayer(null);
  }

  async function handleBulkAssign() {
    if (!bulkTeamId || selectedPlayers.size === 0) return;
    const target = bulkTeamId === NONE ? null : bulkTeamId;
    const ids = Array.from(selectedPlayers);
    setBulkAssigning(true);
    const ok = await run(async () => {
      // In kleine groepen parallel — sneller dan één voor één, zonder de server te overspoelen.
      for (let i = 0; i < ids.length; i += 5) {
        await Promise.all(ids.slice(i, i + 5).map(id => assignPlayerToTeam(id, target)));
      }
    }, target ? `${ids.length} speler(s) verplaatst` : `${ids.length} speler(s) ontkoppeld`);
    if (ok) { setSelectedPlayers(new Set()); setBulkTeamId(''); }
    setBulkAssigning(false);
  }

  async function handleBulkActive(active: 'true' | 'false') {
    const ids = Array.from(selectedPlayers);
    setBulkAssigning(true);
    const ok = await run(async () => {
      for (let i = 0; i < ids.length; i += 5) {
        await Promise.all(ids.slice(i, i + 5).map(id => updatePlayer(id, { active })));
      }
    }, `${ids.length} speler(s) op ${active === 'true' ? 'actief' : 'inactief'} gezet`);
    if (ok) setSelectedPlayers(new Set());
    setBulkAssigning(false);
  }

  function togglePlayerSelect(pid: string) {
    setSelectedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  /** Selecteert alle (zichtbare) spelers van een kolom, of deselecteert ze als ze al allemaal geselecteerd zijn. */
  function toggleSelectColumn(players: PlayerWithTeam[]) {
    const ids = players.map(p => p.id);
    setSelectedPlayers(prev => {
      const n = new Set(prev);
      const allOn = ids.length > 0 && ids.every(id => n.has(id));
      ids.forEach(id => allOn ? n.delete(id) : n.add(id));
      return n;
    });
  }

  function openPlayerCreate() {
    setEditPlayer(null);
    setPlayerForm({ ...EMPTY_PLAYER_FORM, teamId: playerTeamFilter && playerTeamFilter !== NONE ? playerTeamFilter : '' });
    setError(''); setPlayerModal(true);
  }
  function openPlayerEdit(p: PlayerWithTeam) {
    setEditPlayer(p);
    setPlayerForm({
      name: p.name, number: p.number?.toString() ?? '', position: p.position ?? '', position2: p.position2 ?? '',
      active: p.active === 'false' ? 'false' : 'true', teamId: p.team?.id ?? '',
    });
    setError(''); setPlayerModal(true);
  }

  async function handleSavePlayer() {
    if (!playerForm.name.trim()) return;
    setPlayerSaving(true); setError('');
    try {
      const number = playerForm.number ? parseInt(playerForm.number, 10) : null;
      if (editPlayer) {
        await updatePlayer(editPlayer.id, {
          name: playerForm.name.trim(),
          number,
          position: playerForm.position || null,
          position2: playerForm.position2 || null,
          active: playerForm.active,
        });
        if ((editPlayer.team?.id ?? '') !== playerForm.teamId) {
          await assignPlayerToTeam(editPlayer.id, playerForm.teamId || null);
        }
      } else {
        await createPlayer({
          name: playerForm.name.trim(),
          number: number ?? undefined,
          position: playerForm.position || undefined,
          position2: playerForm.position2 || undefined,
          active: playerForm.active,
          teamId: playerForm.teamId || undefined,
        });
      }
      setPlayerModal(false); await load();
      setNotice({ kind: 'ok', msg: editPlayer ? 'Speler bijgewerkt' : `Speler "${playerForm.name.trim()}" aangemaakt` });
    } catch (e) { setError(errMsg(e)); } finally { setPlayerSaving(false); }
  }

  function handleDeletePlayer(p: PlayerWithTeam) {
    setPlayerConfirmDelete(null);
    setSelectedPlayers(prev => { const n = new Set(prev); n.delete(p.id); return n; });
    run(() => deletePlayer(p.id), `Speler "${p.name}" verwijderd`);
  }

  function matchPlayer(p: PlayerWithTeam) {
    if (hideInactive && p.active === 'false') return false;
    if (!playerSearch) return true;
    const q = playerSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.number?.toString() ?? '') === q.replace('#', '');
  }

  if (loading) return <div className="page"><div className="loading-spinner">Laden...</div></div>;

  // ── Gefilterde lijsten voor de weergave ───────────────────────────────────

  const visibleTeams = sortedTeams.filter(t => {
    if (!teamSearch) return true;
    const q = teamSearch.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || (t.club ?? '').toLowerCase().includes(q);
  });

  const visibleTrainers = trainers.filter(tr => {
    if (trainerFilter === 'admin' && tr.role !== 'admin') return false;
    if (trainerFilter === 'trainer' && tr.role === 'admin') return false;
    if (trainerFilter === 'noteam' && tr.team) return false;
    if (!trainerSearch) return true;
    const q = trainerSearch.toLowerCase();
    return tr.name.toLowerCase().includes(q) || (tr.email ?? '').toLowerCase().includes(q) || (tr.team?.name ?? '').toLowerCase().includes(q);
  });

  const boardColumns: { key: string; team: Team | null; players: PlayerWithTeam[] }[] = [];
  if (playerTeamFilter !== NONE) {
    for (const t of sortedTeams) {
      if (playerTeamFilter && playerTeamFilter !== t.id) continue;
      boardColumns.push({ key: t.id, team: t, players: (stats.playersByTeam.get(t.id) ?? []).filter(matchPlayer) });
    }
  }
  if (!playerTeamFilter || playerTeamFilter === NONE) {
    boardColumns.push({ key: NONE, team: null, players: stats.unassignedPlayers.filter(matchPlayer) });
  }
  // Bij zoeken: lege kolommen verbergen zodat je de treffers meteen ziet.
  const shownColumns = playerSearch ? boardColumns.filter(c => c.players.length > 0) : boardColumns;
  const visiblePlayerCount = shownColumns.reduce((s, c) => s + c.players.length, 0);

  const visibleThemes = themes.filter(t =>
    themeFilter === 'all' ? true : themeFilter === 'inactive' ? t.active !== 'true' : t.category === themeFilter);

  const attention: { key: string; icon: string; text: string; detail?: string; action: string; onClick: () => void }[] = [];
  if (stats.unassignedPlayers.length) attention.push({
    key: 'players', icon: '👥', text: `${stats.unassignedPlayers.length} speler(s) zonder ploeg`,
    detail: preview(stats.unassignedPlayers.map(p => p.name)),
    action: 'Koppelen', onClick: () => showTeamPlayers(NONE),
  });
  if (stats.teamsWithoutTrainer.length) attention.push({
    key: 'notrainer', icon: '🏆', text: `${stats.teamsWithoutTrainer.length} ploeg(en) zonder trainer`,
    detail: preview(stats.teamsWithoutTrainer.map(t => t.name)),
    action: 'Bekijk ploegen', onClick: () => setTab('teams'),
  });
  if (stats.teamlessTrainers.length) attention.push({
    key: 'teamless', icon: '👤', text: `${stats.teamlessTrainers.length} trainer(s) zonder ploeg`,
    detail: preview(stats.teamlessTrainers.map(t => t.name)),
    action: 'Toewijzen', onClick: () => { setTrainerFilter('noteam'); setTrainerSearch(''); setTab('trainers'); },
  });
  for (const d of stats.duplicateNumberTeams) attention.push({
    key: 'dup-' + d.team.id, icon: '#', text: `Dubbele rugnummers in ${d.team.name}`,
    detail: d.numbers.map(n => '#' + n).join(', '),
    action: 'Bekijk spelers', onClick: () => showTeamPlayers(d.team.id),
  });
  if (stats.teamsWithoutPlayers.length) attention.push({
    key: 'noplayers', icon: '∅', text: `${stats.teamsWithoutPlayers.length} ploeg(en) zonder spelers`,
    detail: preview(stats.teamsWithoutPlayers.map(t => t.name)),
    action: 'Spelers toevoegen', onClick: () => showTeamPlayers(stats.teamsWithoutPlayers[0].id),
  });

  const tabDefs: { key: Tab; icon: string; label: string; count: number | null; alert?: boolean }[] = [
    { key: 'overview', icon: '📊', label: 'Overzicht', count: attention.length || null, alert: attention.length > 0 },
    { key: 'teams',    icon: '🏆', label: 'Ploegen',   count: teams.length },
    { key: 'trainers', icon: '👤', label: 'Trainers',  count: trainers.length },
    { key: 'players',  icon: '👥', label: 'Spelers',   count: allPlayers.length },
    { key: 'themes',   icon: '🎯', label: "Weekthema's", count: themes.length },
    { key: 'data',     icon: '💾', label: 'Data',      count: null },
  ];

  return (
    <div className="page">
      <div className="adm-header">
        <div>
          <h1 className="page-title">Beheer</h1>
          <p className="page-subtitle">Ploegen, trainers, spelers en clubdata</p>
        </div>
      </div>

      {notice && (
        <div className={`adm-notice ${notice.kind}`} role="status" onClick={() => setNotice(null)}>
          {notice.kind === 'ok' ? '✓' : '⚠'} {notice.msg}
        </div>
      )}

      {/* ── TABS ── */}
      <div className="adm-tabs" role="tablist">
        {tabDefs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key}
            className={`adm-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <span aria-hidden>{t.icon}</span> {t.label}
            {t.count !== null && <span className={`adm-tab-count ${t.alert ? 'alert' : ''}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ═══════════ OVERZICHT ═══════════ */}
      {tab === 'overview' && (
        <div className="adm-overview">
          <div className="adm-stat-grid">
            <StatTile label="Ploegen" value={teams.length} sub={`${teams.filter(t => t.active === 'false').length} inactief`} onClick={() => setTab('teams')} />
            <StatTile label="Trainers" value={trainers.length} sub={`${stats.admins} admin`} onClick={() => { setTrainerFilter('all'); setTab('trainers'); }} />
            <StatTile label="Spelers" value={allPlayers.length} sub={`${stats.activePlayers} actief`} onClick={() => { setPlayerTeamFilter(''); setTab('players'); }} />
            <StatTile label="Weekthema's" value={themes.length} sub={`${stats.activeThemes} actief`} onClick={() => setTab('themes')} />
          </div>

          <div className="card adm-attention">
            <div className="adm-section-title">Aandachtspunten</div>
            {attention.length === 0 ? (
              <div className="adm-attention-ok">✓ Alles in orde — elke ploeg heeft een trainer en alle spelers zijn gekoppeld.</div>
            ) : attention.map(a => (
              <div key={a.key} className="adm-attention-row">
                <span className="adm-attention-icon" aria-hidden>{a.icon}</span>
                <div className="adm-attention-info">
                  <div className="adm-attention-text">{a.text}</div>
                  {a.detail && <div className="adm-attention-detail">{a.detail}</div>}
                </div>
                <button className="btn btn-outline btn-sm" onClick={a.onClick}>{a.action} →</button>
              </div>
            ))}
          </div>

          <div className="card adm-team-summary">
            <div className="adm-section-title">Ploegen in één oogopslag</div>
            {sortedTeams.length === 0 ? (
              <div className="adm-attention-ok">Nog geen ploegen. <button className="btn btn-primary btn-sm" onClick={() => { setTab('teams'); openTeamCreate(); }}>+ Nieuwe ploeg</button></div>
            ) : (
              <div className="adm-table-wrap">
                <table className="data-table adm-table">
                  <thead><tr><th>Cat.</th><th>Ploeg</th><th>Trainer(s)</th><th className="num">Spelers</th></tr></thead>
                  <tbody>
                    {sortedTeams.map(t => {
                      const trs = stats.trainersByTeam.get(t.id) ?? [];
                      const ps = stats.playersByTeam.get(t.id) ?? [];
                      return (
                        <tr key={t.id} className={t.active === 'false' ? 'inactive' : ''}>
                          <td><span className="adm-cat-badge">{t.category}</span></td>
                          <td>{t.name}{t.active === 'false' && <span className="tag tag-black adm-inline-tag">inactief</span>}</td>
                          <td>{trs.length ? trs.map(tr => tr.name).join(', ') : <span className="adm-warn-text">geen trainer</span>}</td>
                          <td className="num"><button className="adm-link" onClick={() => showTeamPlayers(t.id)}>{ps.filter(p => p.active !== 'false').length}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ PLOEGEN ═══════════ */}
      {tab === 'teams' && (
        <div>
          <div className="adm-toolbar">
            <input className="input-field adm-search" placeholder="Zoek ploeg, categorie of club..."
              value={teamSearch} onChange={e => setTeamSearch(e.target.value)} />
            <button className="btn btn-primary" onClick={openTeamCreate}>+ Nieuwe ploeg</button>
          </div>
          {teams.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🏆</div>Nog geen ploegen</div>
          ) : visibleTeams.length === 0 ? (
            <div className="adm-empty-filter">Geen ploegen gevonden voor "{teamSearch}"</div>
          ) : (
            <div className="adm-team-grid">
              {visibleTeams.map(t => {
                const teamTrainers = stats.trainersByTeam.get(t.id) ?? [];
                const teamPlayers = stats.playersByTeam.get(t.id) ?? [];
                const otherTrainers = trainers.filter(tr => tr.team?.id !== t.id);
                const inactive = t.active === 'false';
                return (
                  <div key={t.id} className={`adm-team-card card ${inactive ? 'inactive' : ''}`}>
                    <div className="adm-tc-header">
                      <span className="adm-tc-cat">{t.category}</span>
                      <span className="adm-tc-format">{CATEGORY_FORMAT[t.category] ?? '?'}</span>
                      {inactive && <span className="tag tag-black">inactief</span>}
                      <div className="adm-tc-actions">
                        <button className="btn btn-ghost btn-sm" title="Bewerken" aria-label="Ploeg bewerken" onClick={() => openTeamEdit(t)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" title="Verwijderen" aria-label="Ploeg verwijderen" onClick={() => setTeamConfirmDelete(t)}>🗑️</button>
                      </div>
                    </div>
                    <div className="adm-tc-body">
                      <div className="adm-tc-name">{t.name}</div>
                      {t.club && <div className="adm-tc-club">{t.club}</div>}
                      <button className="adm-tc-players-link" onClick={() => showTeamPlayers(t.id)}>
                        {teamPlayers.length} speler{teamPlayers.length === 1 ? '' : 's'} beheren →
                      </button>
                    </div>
                    <div className="adm-tc-trainers">
                      <div className="adm-tc-trainers-label">Trainers <span className="adm-tc-trainers-count">{teamTrainers.length}</span></div>
                      {teamTrainers.length === 0 ? (
                        <div className="adm-tc-no-trainer">⚠ Geen trainer gekoppeld</div>
                      ) : teamTrainers.map(tr => (
                        <div key={tr.id} className="adm-tc-trainer-row">
                          <span className="adm-avatar sm">{initial(tr.name)}</span>
                          <span className="adm-tc-trainer-name">{tr.name}</span>
                          {tr.role === 'admin' && <span className="tag tag-red">admin</span>}
                          <button className="adm-tc-unlink" title="Ontkoppel" aria-label={`${tr.name} ontkoppelen`} onClick={() => handleAssignTrainerTeam(tr, '')}>✕</button>
                        </div>
                      ))}
                      <div className="adm-tc-add">
                        {otherTrainers.length > 0 && (
                          <select className="input-field adm-tc-add-select" value=""
                            onChange={e => {
                              const tr = trainers.find(x => x.id === e.target.value);
                              if (tr) handleAssignTrainerTeam(tr, t.id);
                            }}>
                            <option value="">+ Trainer koppelen...</option>
                            {otherTrainers.some(tr => !tr.team) && (
                              <optgroup label="Zonder ploeg">
                                {otherTrainers.filter(tr => !tr.team).map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                              </optgroup>
                            )}
                            {otherTrainers.some(tr => tr.team) && (
                              <optgroup label="Verplaatsen van andere ploeg">
                                {otherTrainers.filter(tr => tr.team).map(tr => <option key={tr.id} value={tr.id}>{tr.name} — nu {tr.team!.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => openTrainerCreate(t.id)}>+ Nieuw</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TRAINERS ═══════════ */}
      {tab === 'trainers' && (
        <div>
          <div className="adm-toolbar">
            <input className="input-field adm-search" placeholder="Zoek op naam, e-mail of ploeg..."
              value={trainerSearch} onChange={e => setTrainerSearch(e.target.value)} />
            <div className="adm-chips">
              {([
                ['all', `Alle (${trainers.length})`],
                ['admin', `Admins (${stats.admins})`],
                ['trainer', `Trainers (${trainers.length - stats.admins})`],
                ['noteam', `Zonder ploeg (${stats.teamlessTrainers.length})`],
              ] as const).map(([k, l]) => (
                <button key={k} className={`adm-chip ${trainerFilter === k ? 'active' : ''}`} onClick={() => setTrainerFilter(k)}>{l}</button>
              ))}
            </div>
            <button className="btn btn-primary adm-toolbar-end" onClick={() => openTrainerCreate()}>+ Nieuwe trainer</button>
          </div>
          {trainers.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">👤</div>Nog geen trainers</div>
          ) : visibleTrainers.length === 0 ? (
            <div className="adm-empty-filter">Geen trainers gevonden met deze filter.</div>
          ) : (
            <div className="card adm-table-wrap">
              <table className="data-table adm-table">
                <thead><tr><th>Naam</th><th>Rol</th><th>Ploeg</th><th className="actions"></th></tr></thead>
                <tbody>
                  {visibleTrainers.map(tr => {
                    const isSelf = tr.id === currentTrainer?.id;
                    return (
                      <tr key={tr.id} className={isSelf ? 'self' : ''}>
                        <td>
                          <div className="adm-person">
                            <span className="adm-avatar">{initial(tr.name)}</span>
                            <div className="adm-person-info">
                              <div className="adm-person-name">{tr.name}{isSelf && <span className="adm-self-badge">JIJ</span>}</div>
                              <div className="adm-person-sub">{tr.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <select className="input-field adm-inline-select" value={tr.role} disabled={isSelf}
                            title={isSelf ? 'Je kunt je eigen rol niet wijzigen' : undefined}
                            onChange={e => handleChangeRole(tr, e.target.value)}>
                            <option value="trainer">Trainer</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>
                          <select className={`input-field adm-inline-select ${tr.team ? '' : 'warn'}`} value={tr.team?.id ?? ''}
                            onChange={e => handleAssignTrainerTeam(tr, e.target.value)}>
                            <option value="">— Geen ploeg —</option>
                            {sortedTeams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
                          </select>
                        </td>
                        <td className="actions">
                          <button className="btn btn-ghost btn-sm" title="Bewerken (naam, e-mail, wachtwoord)" aria-label="Trainer bewerken" onClick={() => openTrainerEdit(tr)}>✏️</button>
                          {!isSelf && <button className="btn btn-ghost btn-sm" title="Verwijderen" aria-label="Trainer verwijderen" onClick={() => setConfirmDelete(tr)}>🗑️</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ SPELERS ═══════════ */}
      {tab === 'players' && (
        <div>
          <div className="adm-toolbar">
            <input className="input-field adm-search" placeholder="Zoek op naam of #nummer..."
              value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} />
            <select className="input-field adm-filter-select" value={playerTeamFilter}
              onChange={e => { setPlayerTeamFilter(e.target.value); }}>
              <option value="">Alle ploegen</option>
              <option value={NONE}>Niet gekoppeld ({stats.unassignedPlayers.length})</option>
              {sortedTeams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
            </select>
            <label className="adm-checkbox">
              <input type="checkbox" checked={hideInactive} onChange={e => setHideInactive(e.target.checked)} />
              Verberg inactieve
            </label>
            <button className="btn btn-primary adm-toolbar-end" onClick={openPlayerCreate}>+ Nieuwe speler</button>
          </div>

          {selectedPlayers.size > 0 && (
            <div className="adm-bulk-bar">
              <span className="adm-bulk-count">{selectedPlayers.size} geselecteerd</span>
              <select className="input-field adm-bulk-select" value={bulkTeamId} onChange={e => setBulkTeamId(e.target.value)}>
                <option value="">Verplaats naar...</option>
                <option value={NONE}>— Geen ploeg (ontkoppelen) —</option>
                {sortedTeams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" disabled={!bulkTeamId || bulkAssigning} onClick={handleBulkAssign}>
                {bulkAssigning ? 'Bezig...' : 'Verplaats'}
              </button>
              <span className="adm-bulk-sep" />
              <button className="btn btn-outline btn-sm" disabled={bulkAssigning} onClick={() => handleBulkActive('true')}>Actief</button>
              <button className="btn btn-outline btn-sm" disabled={bulkAssigning} onClick={() => handleBulkActive('false')}>Inactief</button>
              <button className="btn btn-ghost btn-sm adm-toolbar-end" onClick={() => setSelectedPlayers(new Set())}>✕ Deselecteer</button>
            </div>
          )}

          {playerSearch && <div className="adm-result-count">{visiblePlayerCount} speler(s) gevonden</div>}

          {shownColumns.length === 0 ? (
            <div className="adm-empty-filter">Geen spelers gevonden.</div>
          ) : (
            <div className={`adm-player-board ${shownColumns.length === 1 ? 'single' : ''}`}>
              {shownColumns.map(col => {
                const allOn = col.players.length > 0 && col.players.every(p => selectedPlayers.has(p.id));
                return (
                  <div key={col.key} className={`adm-pb-column card ${col.team ? '' : 'adm-pb-unassigned'}`}>
                    <div className="adm-pb-col-header">
                      {col.team
                        ? <span className="adm-pb-col-cat">{col.team.category}</span>
                        : <span className="adm-pb-col-cat none">?</span>}
                      <span className="adm-pb-col-name">{col.team ? col.team.name : 'Niet gekoppeld'}</span>
                      <span className="adm-pb-col-count">{col.players.length}</span>
                      {col.players.length > 0 && (
                        <button className={`adm-pb-check ${allOn ? 'on' : ''}`} onClick={() => toggleSelectColumn(col.players)}
                          title={allOn ? 'Deselecteer alle' : 'Selecteer alle'} aria-label={allOn ? 'Deselecteer alle' : 'Selecteer alle'}>
                          {allOn ? '✓' : ''}
                        </button>
                      )}
                    </div>
                    <div className="adm-pb-col-body">
                      {col.players.length === 0 ? (
                        <div className="adm-pb-empty">{col.team ? 'Geen spelers' : 'Alle spelers zijn gekoppeld ✓'}</div>
                      ) : col.players.map(p => (
                        <PlayerRow key={p.id} player={p} teams={sortedTeams} selected={selectedPlayers.has(p.id)}
                          assigning={assigningPlayer === p.id}
                          duplicateNumber={stats.duplicateNumberIds.has(p.id)}
                          onToggleSelect={() => togglePlayerSelect(p.id)}
                          onAssign={tid => handleAssignPlayer(p, tid)}
                          onEdit={() => openPlayerEdit(p)}
                          onDelete={() => setPlayerConfirmDelete(p)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ WEEKTHEMA'S ═══════════ */}
      {tab === 'themes' && (
        <div>
          <div className="adm-toolbar">
            <div className="adm-chips">
              {([
                ['all', `Alle (${themes.length})`],
                ['B+', `Bal+ (${themes.filter(t => t.category === 'B+').length})`],
                ['B-', `Bal- (${themes.filter(t => t.category === 'B-').length})`],
                ['inactive', `Inactief (${themes.length - stats.activeThemes})`],
              ] as const).map(([k, l]) => (
                <button key={k} className={`adm-chip ${themeFilter === k ? 'active' : ''}`} onClick={() => setThemeFilter(k)}>{l}</button>
              ))}
            </div>
            <button className="btn btn-primary adm-toolbar-end" onClick={openThemeCreate}>+ Nieuw weekthema</button>
          </div>
          {themes.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🎯</div>Nog geen weekthema's</div>
          ) : visibleThemes.length === 0 ? (
            <div className="adm-empty-filter">Geen weekthema's in deze filter.</div>
          ) : (
            <div className="adm-theme-list">
              {visibleThemes.map(t => (
                <div key={t.id} className={`adm-theme-row card ${t.active === 'true' ? '' : 'inactive'}`}>
                  <span className={`tag ${t.category === 'B+' ? 'tag-green' : 'tag-black'}`}>
                    {THEME_CATEGORY_LABELS[t.category] ?? t.category}
                  </span>
                  <div className="adm-theme-info">
                    <div className="adm-theme-title">{t.title}</div>
                    {t.description && <div className="adm-theme-desc">{t.description}</div>}
                  </div>
                  <label className="adm-switch" title="Actief / inactief">
                    <input type="checkbox" checked={t.active === 'true'} onChange={() => handleToggleThemeActive(t)} />
                    <span>{t.active === 'true' ? 'Actief' : 'Inactief'}</span>
                  </label>
                  <div className="adm-theme-actions">
                    <button className="btn btn-ghost btn-sm" aria-label="Weekthema bewerken" onClick={() => openThemeEdit(t)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" aria-label="Weekthema verwijderen" onClick={() => setThemeConfirmDelete(t)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ DATA ═══════════ */}
      {tab === 'data' && (
        <div className="adm-data-tab">
          <div className="adm-chips">
            <button className={`adm-chip ${dataScope === 'alles' ? 'active' : ''}`} onClick={() => setDataScope('alles')}>💾 Volledige back-up</button>
            <button className={`adm-chip ${dataScope === 'trainingen' ? 'active' : ''}`} onClick={() => setDataScope('trainingen')}>📝 Trainingen</button>
            <button className={`adm-chip ${dataScope === 'oefendatabank' ? 'active' : ''}`} onClick={() => setDataScope('oefendatabank')}>📚 Oefendatabank</button>
          </div>

          {dataScope === 'alles' && (<>
            <div className="card adm-data-card">
              <div className="adm-data-card-title">⬇ Exporteren</div>
              <p className="adm-data-card-desc">
                Download alle data uit de app (ploegen, trainers, spelers, wedstrijden, speeltijden, doelpunten,
                weekthema's, trainingen incl. hun oefeningen, de oefendatabank en evaluaties) als één JSON-bestand.
                Bruikbaar als back-up of om data te migreren. Wachtwoorden van trainers zitten hier <strong>niet</strong> in.
              </p>
              {exportError && <div className="adm-error">⚠ {exportError}</div>}
              <button className="btn btn-primary" disabled={exporting} onClick={handleExport}>
                {exporting ? 'Bezig met exporteren...' : '⬇ Exporteer alle data (JSON)'}
              </button>
            </div>

            <div className="card adm-data-card">
              <div className="adm-data-card-title">⬆ Importeren</div>
              <p className="adm-data-card-desc">
                Importeer een eerder geëxporteerd JSON-bestand. Alle records krijgen nieuwe id's en worden
                standaard <strong>toegevoegd</strong> aan de bestaande data. Trainersaccounts krijgen een
                nieuw, tijdelijk wachtwoord (zichtbaar na import) — bestaande accounts met hetzelfde e-mailadres
                worden niet aangepast.
              </p>
              <FileInput onChange={handleImportFileChange} />
              {importFileError && <div className="adm-error">⚠ {importFileError}</div>}

              {importPreview && (
                <div className="adm-import-preview">
                  <PreviewHeader fileName={importFile?.name} exportedAt={importPreview.exportedAt} />
                  <CountTags counts={countFullDataExport(importPreview)} tone="black" />

                  <div className="adm-wipe-box">
                    <label className="adm-wipe-checkbox">
                      <input type="checkbox" checked={wipeFirst}
                        onChange={e => { setWipeFirst(e.target.checked); setWipeTypedConfirm(''); }} />
                      <span>⚠ Eerst alle bestaande sportdata wissen (ploegen, spelers, wedstrijden, speeltijden,
                        doelpunten, weekthema's, trainingen, oefeningen, oefendatabank, evaluaties). Trainersaccounts blijven behouden.</span>
                    </label>
                    {wipeFirst && (
                      <div className="form-group adm-wipe-confirm-input">
                        <label className="input-label">Typ {WIPE_CONFIRM_WORD} om te bevestigen</label>
                        <input className="input-field" value={wipeTypedConfirm}
                          onChange={e => setWipeTypedConfirm(e.target.value)} placeholder={WIPE_CONFIRM_WORD} />
                      </div>
                    )}
                  </div>

                  <button className="btn btn-primary"
                    disabled={importing || (wipeFirst && wipeTypedConfirm !== WIPE_CONFIRM_WORD)} onClick={handleRunImport}>
                    {importing ? (importStage === 'wiping' ? 'Bestaande data wissen...' : 'Bezig met importeren...') : '⬆ Importeer data'}
                  </button>
                  {importing && importProgress && <ProgressBar progress={importProgress} />}
                </div>
              )}

              {importResult && (
                <ImportResultView result={importResult}>
                  {importResult.trainerCredentials.length > 0 && (
                    <div className="adm-trainer-creds">
                      <div className="adm-trainer-creds-title">
                        ⚠ Tijdelijke wachtwoorden voor geïmporteerde trainers — bewaar dit nu, dit wordt niet opnieuw getoond
                      </div>
                      <table className="data-table">
                        <thead><tr><th>E-mail</th><th>Tijdelijk wachtwoord</th></tr></thead>
                        <tbody>
                          {importResult.trainerCredentials.map(c => (
                            <tr key={c.email}><td>{c.email}</td><td><code>{c.tempPassword}</code></td></tr>
                          ))}
                        </tbody>
                      </table>
                      <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }}
                        onClick={() => downloadJSON(importResult.trainerCredentials, 'kfc-lennik-tijdelijke-wachtwoorden.json')}>
                        ⬇ Download als bestand
                      </button>
                    </div>
                  )}
                </ImportResultView>
              )}
            </div>
          </>)}

          {dataScope === 'trainingen' && (<>
            <div className="card adm-data-card">
              <div className="adm-data-card-title">⬇ Exporteren</div>
              <p className="adm-data-card-desc">
                Download alle trainingen (incl. hun oefeningen) als apart JSON-bestand, los van de rest van de
                clubdata — bv. om te delen met een andere trainer/club of als gerichte back-up.
              </p>
              {trExportError && <div className="adm-error">⚠ {trExportError}</div>}
              <button className="btn btn-primary" disabled={trExporting} onClick={handleExportTrainingen}>
                {trExporting ? 'Bezig met exporteren...' : '⬇ Exporteer trainingen (JSON)'}
              </button>
            </div>

            <div className="card adm-data-card">
              <div className="adm-data-card-title">⬆ Importeren</div>
              <p className="adm-data-card-desc">
                Importeer een eerder geëxporteerd trainingen-bestand. De trainingen worden <strong>toegevoegd</strong> aan
                de bestaande data — kies hieronder optioneel een ploeg om ze meteen aan te koppelen, anders blijven ze
                ongekoppeld en verschijnen ze niet in het team-gefilterde trainingenoverzicht tot je ze zelf koppelt.
              </p>
              <FileInput onChange={handleTrImportFileChange} />
              {trImportFileError && <div className="adm-error">⚠ {trImportFileError}</div>}

              {trImportPreview && (
                <div className="adm-import-preview">
                  <PreviewHeader fileName={trImportFile?.name} exportedAt={trImportPreview.exportedAt} />
                  <CountTags counts={countTrainingenExport(trImportPreview)} tone="black" />
                  <div className="form-group" style={{ maxWidth: 320 }}>
                    <label className="input-label">Koppel aan ploeg (optioneel)</label>
                    <select className="input-field" value={trImportTeamId} onChange={e => setTrImportTeamId(e.target.value)}>
                      <option value="">— Ongekoppeld laten —</option>
                      {sortedTeams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-primary" disabled={trImporting} onClick={handleRunTrImport}>
                    {trImporting ? 'Bezig met importeren...' : '⬆ Importeer trainingen'}
                  </button>
                  {trImporting && trImportProgress && <ProgressBar progress={trImportProgress} />}
                </div>
              )}
              {trImportResult && <ImportResultView result={trImportResult} />}
            </div>
          </>)}

          {dataScope === 'oefendatabank' && (<>
            <div className="card adm-data-card">
              <div className="adm-data-card-title">⬇ Exporteren</div>
              <p className="adm-data-card-desc">
                Download de volledige oefendatabank als apart JSON-bestand, los van de rest van de clubdata —
                bv. om te delen met een andere trainer/club of als gerichte back-up.
              </p>
              {odExportError && <div className="adm-error">⚠ {odExportError}</div>}
              <button className="btn btn-primary" disabled={odExporting} onClick={handleExportOefendatabank}>
                {odExporting ? 'Bezig met exporteren...' : '⬇ Exporteer oefendatabank (JSON)'}
              </button>
            </div>

            <div className="card adm-data-card">
              <div className="adm-data-card-title">⬆ Importeren</div>
              <p className="adm-data-card-desc">
                Importeer een eerder geëxporteerd oefendatabank-bestand. De oefeningen worden <strong>toegevoegd</strong> aan
                de bestaande oefendatabank.
              </p>
              <FileInput onChange={handleOdImportFileChange} />
              {odImportFileError && <div className="adm-error">⚠ {odImportFileError}</div>}

              {odImportPreview && (
                <div className="adm-import-preview">
                  <PreviewHeader fileName={odImportFile?.name} exportedAt={odImportPreview.exportedAt} />
                  <CountTags counts={countOefendatabankExport(odImportPreview)} tone="black" />
                  <button className="btn btn-primary" disabled={odImporting} onClick={handleRunOdImport}>
                    {odImporting ? 'Bezig met importeren...' : '⬆ Importeer oefendatabank'}
                  </button>
                  {odImporting && odImportProgress && <ProgressBar progress={odImportProgress} />}
                </div>
              )}
              {odImportResult && <ImportResultView result={odImportResult} />}
            </div>
          </>)}
        </div>
      )}

      {/* ═══════════════ MODALS ═══════════════ */}

      {teamModal && (
        <Modal title={editTeam ? 'Ploeg bewerken' : 'Nieuwe ploeg'} onClose={() => setTeamModal(false)}>
          <div className="form-group">
            <label className="input-label">Ploegnaam *</label>
            <input className="input-field" autoFocus value={teamForm.name}
              onChange={e => setTeamForm({ ...teamForm, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleSaveTeam()} placeholder="bv. KFC Lennik U10A" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Categorie *</label>
              <select className="input-field" value={teamForm.category}
                onChange={e => setTeamForm({ ...teamForm, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c} ({CATEGORY_FORMAT[c]})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Club</label>
              <input className="input-field" value={teamForm.club}
                onChange={e => setTeamForm({ ...teamForm, club: e.target.value })} placeholder="KFC Lennik" />
            </div>
          </div>
          {editTeam && (
            <label className="adm-checkbox">
              <input type="checkbox" checked={teamForm.active === 'true'}
                onChange={e => setTeamForm({ ...teamForm, active: e.target.checked ? 'true' : 'false' })} />
              Ploeg is actief dit seizoen
            </label>
          )}
          {error && <div className="adm-error">⚠ {error}</div>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setTeamModal(false)}>Annuleer</button>
            <button className="btn btn-primary" disabled={saving || !teamForm.name.trim()} onClick={handleSaveTeam}>
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </Modal>
      )}

      {trainerModal && (
        <Modal title={editTrainer ? 'Trainer bewerken' : 'Nieuwe trainer'} onClose={() => setTrainerModal(false)}>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Naam *</label>
              <input className="input-field" autoFocus value={trainerForm.name}
                onChange={e => setTrainerForm({ ...trainerForm, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="input-label">E-mail *</label>
              <input type="email" className="input-field" value={trainerForm.email}
                onChange={e => setTrainerForm({ ...trainerForm, email: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">{editTrainer ? 'Nieuw wachtwoord (optioneel)' : 'Wachtwoord *'}</label>
              <div className="adm-password-row">
                <input type="text" className="input-field" value={trainerForm.password} autoComplete="new-password"
                  onChange={e => setTrainerForm({ ...trainerForm, password: e.target.value })}
                  placeholder={editTrainer ? 'Leeg = ongewijzigd' : 'min. 8 tekens'} />
                <button type="button" className="btn btn-ghost btn-sm" title="Genereer een willekeurig wachtwoord"
                  onClick={() => setTrainerForm({ ...trainerForm, password: generatePassword() })}>🎲</button>
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">Rol</label>
              <select className="input-field" value={trainerForm.role} disabled={editTrainer?.id === currentTrainer?.id}
                onChange={e => setTrainerForm({ ...trainerForm, role: e.target.value })}>
                <option value="trainer">Trainer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="input-label">Ploeg</label>
            <select className="input-field" value={trainerForm.teamId}
              onChange={e => setTrainerForm({ ...trainerForm, teamId: e.target.value })}>
              <option value="">— Geen ploeg —</option>
              {sortedTeams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
            </select>
          </div>
          {error && <div className="adm-error">⚠ {error}</div>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setTrainerModal(false)}>Annuleer</button>
            <button className="btn btn-primary"
              disabled={trainerSaving || !trainerForm.name.trim() || !trainerForm.email.trim() || (!editTrainer && !trainerForm.password)}
              onClick={handleSaveTrainer}>{trainerSaving ? 'Opslaan...' : editTrainer ? 'Opslaan' : 'Aanmaken'}</button>
          </div>
        </Modal>
      )}

      {playerModal && (
        <Modal title={editPlayer ? 'Speler bewerken' : 'Nieuwe speler'} onClose={() => setPlayerModal(false)}>
          <div className="form-group">
            <label className="input-label">Naam *</label>
            <input className="input-field" autoFocus value={playerForm.name}
              onChange={e => setPlayerForm({ ...playerForm, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleSavePlayer()} placeholder="Voornaam Achternaam" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Rugnummer</label>
              <input type="number" className="input-field" value={playerForm.number}
                onChange={e => setPlayerForm({ ...playerForm, number: e.target.value })} min={1} max={99} />
            </div>
            <div className="form-group">
              <label className="input-label">Ploeg</label>
              <select className="input-field" value={playerForm.teamId}
                onChange={e => setPlayerForm({ ...playerForm, teamId: e.target.value })}>
                <option value="">— Geen ploeg —</option>
                {sortedTeams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Positie</label>
              <select className="input-field" value={playerForm.position}
                onChange={e => setPlayerForm({ ...playerForm, position: e.target.value })}>
                <option value="">Kies...</option>
                {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Tweede positie</label>
              <select className="input-field" value={playerForm.position2}
                onChange={e => setPlayerForm({ ...playerForm, position2: e.target.value })}>
                <option value="">Geen</option>
                {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <label className="adm-checkbox">
            <input type="checkbox" checked={playerForm.active === 'true'}
              onChange={e => setPlayerForm({ ...playerForm, active: e.target.checked ? 'true' : 'false' })} />
            Actieve speler
          </label>
          {error && <div className="adm-error">⚠ {error}</div>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setPlayerModal(false)}>Annuleer</button>
            <button className="btn btn-primary" disabled={playerSaving || !playerForm.name.trim()} onClick={handleSavePlayer}>
              {playerSaving ? 'Opslaan...' : editPlayer ? 'Opslaan' : 'Aanmaken'}
            </button>
          </div>
        </Modal>
      )}

      {themeModal && (
        <Modal title={editTheme ? 'Weekthema bewerken' : 'Nieuw weekthema'} onClose={() => setThemeModal(false)}>
          <div className="form-group">
            <label className="input-label">Titel *</label>
            <input className="input-field" autoFocus value={themeForm.title}
              onChange={e => setThemeForm({ ...themeForm, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleSaveTheme()} placeholder="bv. Kort passen onder druk" />
          </div>
          <div className="form-group">
            <label className="input-label">Categorie *</label>
            <select className="input-field" value={themeForm.category}
              onChange={e => setThemeForm({ ...themeForm, category: e.target.value })}>
              <option value="B+">Bal+ (aanvallend)</option>
              <option value="B-">Bal- (verdedigend)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">Omschrijving</label>
            <textarea className="input-field" rows={3} value={themeForm.description}
              onChange={e => setThemeForm({ ...themeForm, description: e.target.value })}
              placeholder="Optionele toelichting bij het thema" />
          </div>
          {error && <div className="adm-error">⚠ {error}</div>}
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setThemeModal(false)}>Annuleer</button>
            <button className="btn btn-primary" disabled={themeSaving || !themeForm.title.trim()} onClick={handleSaveTheme}>
              {themeSaving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </Modal>
      )}

      {teamConfirmDelete && (() => {
        const nP = stats.playersByTeam.get(teamConfirmDelete.id)?.length ?? 0;
        const nT = stats.trainersByTeam.get(teamConfirmDelete.id)?.length ?? 0;
        return (
          <ConfirmModal title="Ploeg verwijderen?" onCancel={() => setTeamConfirmDelete(null)} onConfirm={() => handleDeleteTeam(teamConfirmDelete)}>
            Verwijder <strong>{teamConfirmDelete.name}</strong> ({teamConfirmDelete.category})?
            {(nP > 0 || nT > 0) && <><br />{nP} speler(s) en {nT} trainer(s) worden ontkoppeld en komen bij "niet gekoppeld" terecht.</>}
            <br />Wedstrijden en trainingen van deze ploeg zijn daarna voor trainers niet meer zichtbaar.
            Overweeg de ploeg op <em>inactief</em> te zetten in plaats van te verwijderen.
          </ConfirmModal>
        );
      })()}

      {themeConfirmDelete && (
        <ConfirmModal title="Weekthema verwijderen?" onCancel={() => setThemeConfirmDelete(null)} onConfirm={() => handleDeleteTheme(themeConfirmDelete)}>
          Verwijder <strong>{themeConfirmDelete.title}</strong>?
          Bestaande quoteringen op dit thema blijven bewaard maar tonen geen themanaam meer.
        </ConfirmModal>
      )}

      {confirmDelete && (
        <ConfirmModal title="Trainer verwijderen?" onCancel={() => setConfirmDelete(null)} onConfirm={() => handleDeleteTrainer(confirmDelete)}>
          <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) verwijderen?
          {confirmDelete.team && <><br />Gekoppeld aan <strong>{confirmDelete.team.name}</strong>.</>}
        </ConfirmModal>
      )}

      {playerConfirmDelete && (
        <ConfirmModal title="Speler verwijderen?" onCancel={() => setPlayerConfirmDelete(null)} onConfirm={() => handleDeletePlayer(playerConfirmDelete)}>
          <strong>{playerConfirmDelete.name}</strong> verwijderen? Alle speeltijden en doelpunten gaan verloren.
          Wil je de speler enkel uit de selectie halen, zet hem dan op <em>inactief</em>.
        </ConfirmModal>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown, fallback = 'Er ging iets mis') {
  return e instanceof Error && e.message ? e.message : fallback;
}
function today() { return new Date().toISOString().slice(0, 10); }
function initial(name: string) { return (name.trim().charAt(0) || '?').toUpperCase(); }
function preview(names: string[], max = 4) {
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} +${names.length - max}`;
}
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => chars[n % chars.length]).join('');
}

// ── Kleine presentatiecomponenten ────────────────────────────────────────────

function StatTile({ label, value, sub, onClick }: { label: string; value: number; sub?: string; onClick: () => void }) {
  return (
    <button className="card adm-stat" onClick={onClick}>
      <span className="adm-stat-value">{value}</span>
      <span className="adm-stat-label">{label}</span>
      {sub && <span className="adm-stat-sub">{sub}</span>}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, onCancel, onConfirm, children }: {
  title: string; onCancel: () => void; onConfirm: () => void; children: ReactNode;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="adm-confirm-text">{children}</p>
      <div className="modal-actions">
        <button className="btn btn-outline" autoFocus onClick={onCancel}>Annuleer</button>
        <button className="btn btn-primary adm-btn-danger" onClick={onConfirm}>Verwijderen</button>
      </div>
    </Modal>
  );
}

function FileInput({ onChange }: { onChange: (f: File | null) => void }) {
  return (
    <div className="form-group">
      <input type="file" accept="application/json" className="input-field"
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </div>
  );
}

function PreviewHeader({ fileName, exportedAt }: { fileName?: string; exportedAt?: string }) {
  return (
    <div className="adm-import-preview-title">
      Gevonden in {fileName}
      {exportedAt && (
        <span className="adm-import-preview-date"> — geëxporteerd op {new Date(exportedAt).toLocaleString('nl-BE')}</span>
      )}
    </div>
  );
}

function CountTags({ counts, tone }: { counts: Record<string, number>; tone: 'black' | 'green' }) {
  return (
    <div className="adm-import-counts">
      {Object.entries(counts).map(([key, count]) => (
        <span key={key} className={`tag tag-${tone} adm-import-count-tag`}>{ENTITY_LABELS[key] ?? key}: {count}</span>
      ))}
    </div>
  );
}

function ProgressBar({ progress }: { progress: ImportProgress }) {
  return (
    <div className="adm-import-progress">
      <div className="adm-import-progress-label">{progress.label} — {progress.done}/{progress.total}</div>
      <div className="sz-bar-wrap">
        <div className="sz-bar-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
      </div>
    </div>
  );
}

function ImportResultView({ result, children }: { result: ImportResult; children?: ReactNode }) {
  return (
    <div className="adm-import-result">
      <div className="adm-import-preview-title">Import voltooid</div>
      <CountTags counts={result.counts} tone="green" />
      {result.errors.length > 0 && (
        <div className="adm-import-errors">
          <div className="adm-import-errors-title">{result.errors.length} fout(en)</div>
          <div className="adm-import-errors-list">
            {result.errors.map((err, i) => <div key={i}>{err}</div>)}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Spelerrij in het bord ────────────────────────────────────────────────────

function PlayerRow({ player, teams, selected, assigning, duplicateNumber, onToggleSelect, onAssign, onEdit, onDelete }: {
  player: PlayerWithTeam; teams: Team[];
  selected: boolean; assigning: boolean; duplicateNumber: boolean;
  onToggleSelect: () => void;
  onAssign: (teamId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const inactive = player.active === 'false';

  return (
    <div className={`adm-pb-player ${selected ? 'selected' : ''} ${assigning ? 'assigning' : ''} ${inactive ? 'inactive' : ''}`}>
      <button className={`adm-pb-check ${selected ? 'on' : ''}`} onClick={onToggleSelect}
        aria-label={selected ? `${player.name} deselecteren` : `${player.name} selecteren`}>
        {selected ? '✓' : ''}
      </button>

      <span className={`adm-pb-num ${duplicateNumber ? 'dup' : ''}`} title={duplicateNumber ? 'Dubbel rugnummer in deze ploeg' : undefined}>
        {player.number ? `#${player.number}` : '—'}
      </span>

      <button className="adm-pb-info" onClick={onEdit} title="Bewerken">
        <span className="adm-pb-name">{player.name}</span>
        {player.position && <span className="adm-pb-pos">{POSITION_LABELS[player.position]}</span>}
        {inactive && <span className="adm-pb-inactive">inactief</span>}
      </button>

      <div className="adm-pb-assign">
        {showDropdown ? (
          <select className="input-field adm-pb-assign-select" autoFocus
            value={player.team?.id ?? ''}
            onChange={e => { setShowDropdown(false); onAssign(e.target.value); }}
            onBlur={() => setShowDropdown(false)}>
            <option value="">— Geen ploeg —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
          </select>
        ) : (
          <button className="adm-pb-assign-btn" onClick={() => setShowDropdown(true)} title="Verplaats naar andere ploeg" aria-label="Verplaats naar andere ploeg">
            ↔
          </button>
        )}
      </div>

      <button className="adm-pb-delete" onClick={onDelete} title="Verwijderen" aria-label={`${player.name} verwijderen`}>🗑️</button>
    </div>
  );
}
