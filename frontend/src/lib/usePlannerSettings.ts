import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlannerSettings, savePlannerSettings as saveRemote } from './api';
import {
  PlannerSettings, defaultSettings, loadPlannerSettings, parsePlannerSettings, savePlannerSettings as saveLocal,
} from './speeltijdSettings';

// ── Wisselschema delen tussen toestellen ─────────────────────────────────────────
// De database (Match.plannerSettings) is de bron van waarheid; localStorage is de
// cache waarmee het schema langs het veld ook zonder bereik blijft werken.
//
// Wijzigingen zijn functies i.p.v. nieuwe waarden: bij het opslaan worden ze op de
// nieuwste versie uit de database toegepast. De server aanvaardt een opslag enkel
// als die versie intussen niet veranderd is; was een andere trainer eerst, dan
// wordt de wijziging op diens versie overgedaan. Lukt opslaan niet, dan blijven de
// wijzigingen staan en probeert de volgende poll opnieuw.

type Mutator = (s: PlannerSettings) => PlannerSettings;

const POLL_MS = 10_000;
const MAX_SAVE_ATTEMPTS = 5;

export function usePlannerSettings(matchId: string | null, category: string | undefined, saveDelayMs = 0) {
  const [settings, setSettings] = useState<PlannerSettings>(
    () => matchId ? loadPlannerSettings(matchId, category) : defaultSettings(category),
  );
  const [syncError, setSyncError] = useState(false);
  const push = useRef<((fn: Mutator) => void) | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    let cur = loadPlannerSettings(matchId, category);
    let lastRaw: string | null = null;
    let pending: Mutator[] = [];
    let flushing = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const show = (s: PlannerSettings) => {
      cur = s;
      saveLocal(matchId, s);
      if (alive) setSettings(s);
    };
    const reportError = (failed: boolean) => { if (alive) setSyncError(failed); };

    async function flush() {
      if (flushing || pending.length === 0) return;
      flushing = true;
      let saved = false;
      const batch = pending;
      pending = [];
      try {
        let next: PlannerSettings | null = null;
        for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS && !next; attempt++) {
          const raw = await getPlannerSettings(matchId!);
          const fresh = parsePlannerSettings(raw, category);
          // Lege database: `cur` bevat de wijzigingen al.
          const candidate = fresh ? batch.reduce((s, fn) => fn(s), fresh) : cur;
          const out = JSON.stringify(candidate);
          if (out === raw || await saveRemote(matchId!, raw, out)) {
            next = candidate;
            lastRaw = out;
          }
        }
        if (!next) throw new Error('Wisselschema opslaan: te veel gelijktijdige wijzigingen');
        // Wat intussen nog bijkwam blijft zichtbaar tot de volgende flush.
        show(pending.reduce((s, fn) => fn(s), next));
        saved = true;
        reportError(false);
      } catch (e) {
        console.error(e);
        pending = [...batch, ...pending];
        reportError(true);
      } finally {
        flushing = false;
        if (saved && pending.length > 0) timer = setTimeout(flush, saveDelayMs);
      }
    }

    async function pull() {
      try {
        const raw = await getPlannerSettings(matchId!);
        // Eigen wijzigingen tijdens het ophalen gaan voor; de flush verwerkt ze op het verschil.
        if (flushing || pending.length > 0) return;
        reportError(false);
        if (!raw) {
          // Schema's van vóór de gedeelde opslag staan enkel lokaal: eenmalig overzetten.
          const isDefault = JSON.stringify(cur) === JSON.stringify(defaultSettings(category));
          if (!isDefault) {
            pending.push(s => s);
            await flush();
          }
          return;
        }
        if (raw === lastRaw) return;
        const parsed = parsePlannerSettings(raw, category);
        if (!parsed) return;
        lastRaw = raw;
        show(parsed);
      } catch (e) {
        console.error(e);
        reportError(true);
      }
    }

    const tick = () => {
      if (document.hidden || flushing) return;
      if (pending.length > 0) flush(); else pull();
    };
    const onVisible = () => { if (!document.hidden) tick(); };

    push.current = fn => {
      pending.push(fn);
      show(fn(cur));
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, saveDelayMs);
    };

    setSettings(cur);
    setSyncError(false);
    tick();
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      push.current = null;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearTimeout(timer);
      flush(); // niet verliezen wat nog in de wachtrij zat
    };
  }, [matchId, category, saveDelayMs]);

  const update = useCallback((fn: Mutator) => push.current?.(fn), []);
  return { settings, update, syncError };
}
