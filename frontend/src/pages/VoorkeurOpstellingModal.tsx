import { useEffect, useState } from 'react';
import {
  Player, Attendance, LineupProposal,
  getLineupProposals, saveLineupProposal,
} from '../lib/api';
import FieldView from './FieldView';
import './VoorkeurOpstellingModal.css';

interface Teammate { id: string; name: string }

interface Props {
  matchId: string;
  teamCategory: string;
  squadPlayers: Player[];
  attendances: Attendance[];
  currentTrainerId: string;
  currentTrainerName: string;
  teammates: Teammate[];
  onApply: (period: number, assignment: Record<string, string>) => void;
  onClose: () => void;
}

/** Laat elke trainer van de ploeg onafhankelijk een voorkeursopstelling per
 * kwart klaarzetten (backend-gesynchroniseerd via LineupProposal, i.t.t. de
 * lokale fieldAssignment die Matchday zelf gebruikt), en toont daarna alle
 * voorstellen naast elkaar zodat er gekozen kan worden welk voorstel effectief
 * toegepast wordt (via onApply → Matchday's bestaande fieldAssignment-opslag). */
export default function VoorkeurOpstellingModal({
  matchId, teamCategory, squadPlayers, attendances, currentTrainerId, currentTrainerName, teammates, onApply, onClose,
}: Props) {
  const [activePeriod, setActivePeriod] = useState(1);
  const [proposals, setProposals] = useState<LineupProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [myAssignments, setMyAssignments] = useState<Record<number, Record<string, string>>>({ 1: {}, 2: {}, 3: {}, 4: {} });

  useEffect(() => { load(); }, [matchId]);

  async function load() {
    setLoading(true);
    try {
      const data = await getLineupProposals(matchId);
      setProposals(data);
      const mine: Record<number, Record<string, string>> = { 1: {}, 2: {}, 3: {}, 4: {} };
      data.filter(p => p.trainer.id === currentTrainerId).forEach(p => {
        try { mine[p.period] = JSON.parse(p.assignment) || {}; } catch { /* ongeldige data — leeg blijft */ }
      });
      setMyAssignments(mine);
    } finally { setLoading(false); }
  }

  function myPreAssign(posKey: string, playerId: string | null) {
    setMyAssignments(prev => {
      const cur = { ...(prev[activePeriod] || {}) };
      if (playerId === null) {
        delete cur[posKey];
      } else {
        Object.keys(cur).forEach(k => { if (cur[k] === playerId) delete cur[k]; });
        cur[posKey] = playerId;
      }
      saveLineupProposal(matchId, currentTrainerId, activePeriod, cur).then(saved => {
        setProposals(list => [...list.filter(p => !(p.trainer.id === currentTrainerId && p.period === activePeriod)), saved]);
      });
      return { ...prev, [activePeriod]: cur };
    });
  }

  const teammateProposals = teammates.map(tm => {
    const p = proposals.find(pr => pr.trainer.id === tm.id && pr.period === activePeriod);
    let assignment: Record<string, string> = {};
    if (p) { try { assignment = JSON.parse(p.assignment) || {}; } catch { /* ongeldige data — leeg blijft */ } }
    return { trainer: tm, assignment };
  });

  return (
    <div className="modal-overlay vo-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal vo-modal">
        <div className="vo-header">
          <h2 className="modal-title">Voorkeursopstelling</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <p className="vo-hint">
          Stel per kwart je eigen voorkeur in, bekijk het voorstel van je collega-trainer(s), en kies daarna welk voorstel
          effectief toegepast wordt op Matchday.
        </p>

        <div className="vo-tabs">
          {[1, 2, 3, 4].map(n => (
            <button key={n} className={`vo-tab ${activePeriod === n ? 'active' : ''}`} onClick={() => setActivePeriod(n)}>
              Kwart {n}
            </button>
          ))}
        </div>

        {loading ? <div className="loading-spinner">Laden...</div> : (
          <div className="vo-columns">
            <div className="vo-column">
              <div className="vo-column-header">
                <span className="vo-column-title">Mijn voorstel ({currentTrainerName})</span>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={Object.keys(myAssignments[activePeriod] || {}).length === 0}
                  onClick={() => onApply(activePeriod, myAssignments[activePeriod] || {})}
                >
                  ✓ Toepassen
                </button>
              </div>
              <div className="vo-field-compact">
                <FieldView
                  matchId={matchId} period={activePeriod} periodStatus="idle" sessions={[]}
                  attendances={attendances} allPlayers={squadPlayers} tick={0} category={teamCategory}
                  onRefresh={async () => {}}
                  preAssignment={myAssignments[activePeriod] || {}}
                  onPreAssign={myPreAssign}
                />
              </div>
            </div>

            {teammateProposals.map(({ trainer, assignment }) => (
              <div className="vo-column" key={trainer.id}>
                <div className="vo-column-header">
                  <span className="vo-column-title">{trainer.name}</span>
                  <button
                    className="btn btn-outline btn-sm" disabled={Object.keys(assignment).length === 0}
                    onClick={() => onApply(activePeriod, assignment)}
                  >
                    ✓ Toepassen
                  </button>
                </div>
                {Object.keys(assignment).length === 0 ? (
                  <div className="vo-empty">Nog geen voorstel voor dit kwart.</div>
                ) : (
                  <div className="vo-field-compact">
                    <FieldView
                      matchId={matchId} period={activePeriod} periodStatus="idle" sessions={[]}
                      attendances={attendances} allPlayers={squadPlayers} tick={0} category={teamCategory}
                      onRefresh={async () => {}}
                      preAssignment={assignment}
                      readOnly
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
