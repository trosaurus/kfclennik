import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Trainer, getMe } from './auth';

interface TeamContextValue {
  trainer: Trainer | null;
  loading: boolean;
  teamId: string | null;
  category: string | null;
  isAdmin: boolean;
  setTrainer: (t: Trainer | null) => void;
}

const TeamContext = createContext<TeamContextValue>({
  trainer: null, loading: true,
  teamId: null, category: null, isAdmin: false,
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

  return (
    <TeamContext.Provider value={{ trainer, loading, teamId, category, isAdmin, setTrainer }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
