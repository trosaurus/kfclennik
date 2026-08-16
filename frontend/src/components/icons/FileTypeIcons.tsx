// Kleine, herkenbare "badge"-iconen voor bestandstypes (PowerPoint/PDF) — de
// enige plek in de app die geen emoji als icoon gebruikt, bewust voor de
// export-knoppen zodat het bestandstype in één oogopslag duidelijk is.

interface FileTypeIconProps {
  size?: number;
}

export function PowerPointIcon({ size = 16 }: FileTypeIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#D24726" />
      <text x="12" y="16.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="12" fontWeight="700" fill="#fff">P</text>
    </svg>
  );
}

export function PdfIcon({ size = 16 }: FileTypeIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#DC3E15" />
      <text x="12" y="15.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.5" fontWeight="700" fill="#fff">PDF</text>
    </svg>
  );
}
