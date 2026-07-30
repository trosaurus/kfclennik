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
