// ── Toegangscontrole ─────────────────────────────────────────────────────────
// Elke trainer mag alleen data van zijn eigen ploeg zien/wijzigen; admins zien
// alles. Voorheen stond overal `access: allowAll` — dat betekende dat de
// GraphQL-API zelf geen enkele rechtencontrole deed (de team-scoping in de
// frontend was puur cosmetisch, met een rechtstreekse GraphQL-call kon iedereen
// bij alle ploegen/spelers/trainers). Dit bestand voorziet de bouwstenen om dat
// per lijst correct af te dwingen.

type SessionData = {
  id: string;
  email: string;
  name: string;
  role: string;
  team: { id: string; name: string; category: string } | null;
};

type Session = { listKey: string; itemId: string; data: SessionData };
type AccessArgs = { session?: Session };

export const isSignedIn = ({ session }: AccessArgs) => !!session;
export const isAdmin = ({ session }: AccessArgs) => session?.data.role === 'admin';

/** Iedereen die ingelogd is mag alle rijen zien — voor club-brede gedeelde
 * lijsten (WeekTheme, OefeningDatabank) waar geen ploeg-scoping op past. */
export const anySignedInFilter = ({ session }: AccessArgs) => !!session;

/** Trainer: enkel het eigen account, admin ziet iedereen. */
export function selfOrAdminFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  return { id: { equals: session.data.id } };
}

/** Team: enkel de eigen ploeg, admin ziet alles. */
export function ownTeamFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const teamId = session.data.team?.id;
  if (!teamId) return false;
  return { id: { equals: teamId } };
}

/** Lijsten met een rechtstreeks `team`-veld (Player, Match, Training). */
export function teamOwnedFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const teamId = session.data.team?.id;
  if (!teamId) return false;
  return { team: { id: { equals: teamId } } };
}

/** Lijsten die via een `match`-relatie bij een ploeg horen
 * (Period, Goal, Attendance, Evaluation). */
export function matchScopedFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const teamId = session.data.team?.id;
  if (!teamId) return false;
  return { match: { team: { id: { equals: teamId } } } };
}

/** LineupProposal — LEZEN: alle voorstellen van de eigen ploeg (zodat beide
 * trainers elkaars voorstel per kwart kunnen zien en vergelijken), maar
 * SCHRIJVEN/VERWIJDEREN enkel het eigen voorstel (match uit eigen ploeg ÉN
 * trainer = zichzelf) — zo kan de ene trainer nooit het voorstel van de
 * andere aanpassen. */
export function matchScopedOwnTrainerFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const teamId = session.data.team?.id;
  if (!teamId) return false;
  return { match: { team: { id: { equals: teamId } } }, trainer: { id: { equals: session.data.id } } };
}

/** PlayTimeSession: via `attendance.match.team`. */
export function attendanceScopedFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const teamId = session.data.team?.id;
  if (!teamId) return false;
  return { attendance: { match: { team: { id: { equals: teamId } } } } };
}

/** Training: eigen ploeg, plus altijd de eigen trainingen (ook zonder ploeg —
 * er bestaan trainers die (nog) niet aan een ploeg gekoppeld zijn maar wel al
 * trainingen voorbereiden; zonder deze fallback zou zo'n trainer na het
 * aanmaken meteen zijn eigen training niet meer terugvinden). */
export function trainingOwnedFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const or: object[] = [{ trainer: { id: { equals: session.data.id } } }];
  const teamId = session.data.team?.id;
  if (teamId) or.push({ team: { id: { equals: teamId } } });
  return { OR: or };
}

/** Exercise: via `training.team`, met dezelfde eigen-trainer-fallback als
 * trainingOwnedFilter (via `training.trainer`). */
export function exerciseScopedFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const or: object[] = [{ training: { trainer: { id: { equals: session.data.id } } } }];
  const teamId = session.data.team?.id;
  if (teamId) or.push({ training: { team: { id: { equals: teamId } } } });
  return { OR: or };
}

/** Training — LEZEN: alles uit trainingOwnedFilter, plus trainingen die expliciet
 * met deze trainer gedeeld zijn via `sharedWith`. Enkel voor de query-access:
 * delen geeft bewust enkel leestoegang (om te kunnen bekijken/kopiëren), geen
 * schrijfrecht — bewerken/verwijderen/(her)delen blijft via trainingOwnedFilter
 * voorbehouden aan de maker, diens ploeg en admins. */
export function trainingVisibleFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const or: object[] = [
    { trainer: { id: { equals: session.data.id } } },
    { sharedWith: { some: { id: { equals: session.data.id } } } },
  ];
  const teamId = session.data.team?.id;
  if (teamId) or.push({ team: { id: { equals: teamId } } });
  return { OR: or };
}

/** Exercise — LEZEN: analoog aan trainingVisibleFilter, via `training.sharedWith`
 * (nodig om de oefeningen van een gedeelde training te kunnen bekijken/kopiëren). */
export function exerciseVisibleFilter({ session }: AccessArgs) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  const or: object[] = [
    { training: { trainer: { id: { equals: session.data.id } } } },
    { training: { sharedWith: { some: { id: { equals: session.data.id } } } } },
  ];
  const teamId = session.data.team?.id;
  if (teamId) or.push({ training: { team: { id: { equals: teamId } } } });
  return { OR: or };
}

/** Veld-toegang (niet lijst-toegang): enkel de eigenaar van het account of een
 * admin mag het veld lezen. Gebruikt op Trainer.email/role zodat de club-brede
 * trainerslijst (nodig om iemand te kunnen selecteren om mee te delen) wel
 * naam + ploeg toont, maar geen e-mailadres/rol van andere trainers lekt. */
export function selfOrAdminFieldRead({ session, item }: any) {
  if (!session) return false;
  if (session.data.role === 'admin') return true;
  return item?.id === session.data.id;
}

/** Genereert een validateInput-hook die controleert dat elke opgegeven
 * relatie ("connect") verwijst naar een item dat zichtbaar is via de eigen
 * query-access van die lijst. Zo kan een niet-admin trainer bv. nooit een
 * speler koppelen aan een andere ploeg dan de eigen, zonder dat we de
 * ploeg-logica op elke plek opnieuw moeten uitschrijven: we hergebruiken
 * gewoon de (al correcte) access-filter van de gekoppelde lijst zelf via
 * context.db, wat automatisch respecteert wat de sessie mag zien. */
export function relationGuard(...relations: Array<{ field: string; list: string }>) {
  return async ({ resolvedData, context, addValidationError }: any) => {
    for (const { field, list } of relations) {
      const connectId = resolvedData?.[field]?.connect?.id;
      if (!connectId) continue;
      const related = await (context.db as any)[list].findOne({ where: { id: connectId } });
      if (!related) {
        addValidationError(`Geen toegang tot de gekoppelde ${list} ("${field}").`);
      }
    }
  };
}
