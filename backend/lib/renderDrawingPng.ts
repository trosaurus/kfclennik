import sharp from 'sharp';
import { buildDrawingSvg, DrawingScene } from './drawingSvg';

/** Rasterizes a DrawingScene (vector field + elements, or an imported
 * background photo) to a PNG buffer for embedding into the PowerPoint export.
 * Orientation mirrors DrawingCanvas.tsx: landscape only when a background
 * image is present and is itself wider than tall. */
export async function renderDrawingPng(scene: DrawingScene): Promise<Buffer> {
  let landscape = false;
  if (scene.backgroundImage) {
    try {
      const base64 = scene.backgroundImage.split(',')[1] ?? '';
      const buf = Buffer.from(base64, 'base64');
      const meta = await sharp(buf).metadata();
      if (meta.width && meta.height) landscape = meta.width > meta.height;
    } catch { /* keep default portrait */ }
  }

  const svg = buildDrawingSvg(scene, landscape);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
