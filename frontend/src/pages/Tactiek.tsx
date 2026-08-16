import { useState } from 'react';
import { TACTIEK, TactiekFase, TactiekPrincipe } from '../lib/tactiek';
import './Tactiek.css';

export default function Tactiek() {
  const [activeChapter, setActiveChapter] = useState(TACTIEK[0].key);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const chapter = TACTIEK.find(c => c.key === activeChapter)!;

  return (
    <div className="page">
      <div className="tac-header">
        <div>
          <h1 className="page-title">Tactiek</h1>
          <p className="page-subtitle">Het gamemodel van KFC Lennik — aanvallen, omschakelen, verdedigen</p>
        </div>
      </div>

      <div className="tac-tabs">
        {TACTIEK.map(c => (
          <button key={c.key} className={`tac-tab ${activeChapter === c.key ? 'active' : ''}`} onClick={() => setActiveChapter(c.key)}>
            {c.titel}
          </button>
        ))}
      </div>

      {chapter.intro && (
        <div className="tac-intro card">
          {chapter.introDiagram && (
            <img
              className="tac-intro-diagram" src={chapter.introDiagram}
              alt={`${chapter.titel} — zone-indeling`} onClick={() => setLightbox(chapter.introDiagram!)}
            />
          )}
          <div className="tac-intro-text">
            {chapter.intro.map(p => (
              <div key={p.titel} className="tac-intro-punt">
                <div className="tac-intro-titel">{p.titel}</div>
                <p>{p.beschrijving}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {chapter.principes && <PrincipeList principes={chapter.principes} />}

      {chapter.fases.map((fase, i) => (
        <FaseCard key={i} fase={fase} onOpenImage={setLightbox} />
      ))}

      {lightbox && (
        <div className="tac-lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="tac-lightbox-img" alt="Tactiekdiagram" onClick={e => e.stopPropagation()} />
          <button className="btn btn-ghost btn-icon tac-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

function PrincipeList({ principes }: { principes: TactiekPrincipe[] }) {
  return (
    <div className="tac-principe-list card">
      {principes.map(p => <PrincipeItem key={p.nr} principe={p} />)}
    </div>
  );
}

function PrincipeItem({ principe }: { principe: TactiekPrincipe }) {
  return (
    <div className="tac-principe">
      <span className="tac-principe-nr">{principe.nr}</span>
      <div>
        <div className="tac-principe-titel">{principe.titel}</div>
        {principe.beschrijving && <p className="tac-principe-desc">{principe.beschrijving}</p>}
      </div>
    </div>
  );
}

function FaseCard({ fase, onOpenImage }: { fase: TactiekFase; onOpenImage: (src: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="tac-fase card">
      <button className="tac-fase-header" onClick={() => setOpen(v => !v)}>
        <div>
          <div className="tac-fase-titel">{fase.titel}</div>
          {fase.ondertitel && <div className="tac-fase-ondertitel">{fase.ondertitel}</div>}
        </div>
        <span className="tac-fase-toggle">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="tac-fase-body">
          <div className="tac-principe-list tac-principe-list-compact">
            {fase.principes.map(p => <PrincipeItem key={p.nr} principe={p} />)}
          </div>
          {fase.diagrammen.length > 0 && (
            <div className="tac-diagram-grid">
              {fase.diagrammen.map((src, i) => (
                <img
                  key={i} src={src} className="tac-diagram-thumb"
                  onClick={() => onOpenImage(src)} alt={`${fase.titel} — diagram ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
