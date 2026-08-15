import { useEffect, useState } from 'react';
import { useTeam } from '../lib/TeamContext';
import {
  getWhiteboards, createWhiteboard, updateWhiteboard, deleteWhiteboard,
  WhiteboardItem, DrawingScene, parseDrawingScene,
} from '../lib/api';
import DrawingCanvas from '../components/DrawingCanvas';
import './Whiteboard.css';

function blankScene(): DrawingScene {
  return { background: 'grid', elements: [] };
}

export default function Whiteboard() {
  const { trainer, teamId } = useTeam();
  const [items, setItems] = useState<WhiteboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [naam, setNaam] = useState('Nieuwe tekening');
  const [scene, setScene] = useState<DrawingScene>(blankScene());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WhiteboardItem | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setItems(await getWhiteboards()); } finally { setLoading(false); }
  }

  function newDrawing() {
    setActiveId(null);
    setNaam('Nieuwe tekening');
    setScene(blankScene());
    setDirty(false);
  }

  function openItem(item: WhiteboardItem) {
    setActiveId(item.id);
    setNaam(item.naam);
    setScene(parseDrawingScene(item.drawingData));
    setDirty(false);
  }

  function onSceneChange(next: DrawingScene) {
    setScene(next);
    setDirty(true);
  }

  async function save() {
    const trimmed = naam.trim();
    if (!trimmed) { alert('Geef de tekening een naam.'); return; }
    setSaving(true);
    try {
      const drawingData = JSON.stringify(scene);
      if (activeId) {
        const updated = await updateWhiteboard(activeId, { naam: trimmed, drawingData });
        setItems(list => list.map(i => i.id === activeId ? updated : i));
      } else {
        const created = await createWhiteboard({
          naam: trimmed, drawingData, trainerId: trainer?.id, teamId: teamId ?? undefined,
        });
        setItems(list => [created, ...list]);
        setActiveId(created.id);
      }
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: WhiteboardItem) {
    setConfirmDelete(null);
    await deleteWhiteboard(item.id);
    setItems(list => list.filter(i => i.id !== item.id));
    if (activeId === item.id) newDrawing();
  }

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return ''; }
  }

  if (loading) return <div className="page"><div className="loading-spinner">Whiteboard laden...</div></div>;

  return (
    <div className="page">
      <div className="wb-header">
        <div>
          <h1 className="page-title">Whiteboard</h1>
          <p className="page-subtitle">Snel een tekening maken, zonder training of oefening</p>
        </div>
        <button className="btn btn-outline" onClick={newDrawing}>+ Nieuwe tekening</button>
      </div>

      {items.length > 0 && (
        <div className="wb-list">
          {items.map(item => (
            <div key={item.id} className={`wb-item card ${activeId === item.id ? 'active' : ''}`} onClick={() => openItem(item)}>
              <span className="wb-item-name">{item.naam}</span>
              <span className="wb-item-date">{fmtDate(item.createdAt)}</span>
              <button
                className="btn btn-ghost btn-sm wb-item-delete"
                onClick={e => { e.stopPropagation(); setConfirmDelete(item); }}
                title="Verwijderen"
              >🗑️</button>
            </div>
          ))}
        </div>
      )}

      <div className="wb-editor card">
        <div className="wb-editor-toolbar">
          <input
            className="wb-name-input"
            value={naam}
            onChange={e => { setNaam(e.target.value); setDirty(true); }}
            placeholder="Naam van de tekening"
          />
          <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
            {saving ? 'Opslaan...' : activeId ? 'Wijzigingen opslaan' : 'Opslaan'}
          </button>
        </div>
        <DrawingCanvas scene={scene} onChange={onSceneChange} />
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal">
            <p>"{confirmDelete.naam}" verwijderen?</p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Annuleren</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
