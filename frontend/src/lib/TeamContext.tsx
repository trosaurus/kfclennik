import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Trainer, Club, getMe } from './auth';
import { setHomeClubName } from './api';

interface TeamContextValue {
  trainer: Trainer | null;
  loading: boolean;
  teamId: string | null;
  category: string | null;
  isAdmin: boolean;
  /** Club van de eigen ploeg (null voor een trainer zonder ploeg/club). */
  club: Club | null;
  /** Clubnaam, of lege string als er geen club gekend is. */
  clubName: string;
  setTrainer: (t: Trainer | null) => void;
}

const TeamContext = createContext<TeamContextValue>({
  trainer: null, loading: true,
  teamId: null, category: null, isAdmin: false,
  club: null, clubName: '',
  setTrainer: () => {},
});

export function TeamProvider({ children }: { children: ReactNode }) {
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then(t => { setTrainer(t); setLoading(false); });
  }, []);

  const teamId   = trainer?.team?.id ?? null;
  const category = trainer?.team?.category ?? null;
  const isAdmin  = trainer?.role === 'admin';
  const club     = trainer?.team?.club ?? null;
  const clubName = club?.name ?? '';

  // api.ts gebruikt de clubnaam om een per ongeluk meegeplakte thuisploeg uit
  // het tegenstanderveld te knippen (zie sanitizeOpponentName).
  useEffect(() => { setHomeClubName(clubName); }, [clubName]);

  return (
    <TeamContext.Provider value={{ trainer, loading, teamId, category, isAdmin, club, clubName, setTrainer }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}

/** Label voor de eigen ploeg in wedstrijdweergaves ("<club> vs tegenstander"):
 * de clubnaam, of "Thuis" als er (nog) geen club ingesteld is. */
export function useHomeLabel(): string {
  return useContext(TeamContext).clubName || 'Thuis';
}
