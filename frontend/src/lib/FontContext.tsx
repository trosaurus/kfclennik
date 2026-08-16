import { createContext, useContext, useState, ReactNode } from 'react';

export type FontPref = 'default' | 'poppins';

const STORAGE_KEY = 'kfcl-font';

interface FontContextValue {
  font: FontPref;
  toggleFont: () => void;
}

const FontContext = createContext<FontContextValue>({
  font: 'default',
  toggleFont: () => {},
});

function applyFont(font: FontPref) {
  document.documentElement.setAttribute('data-font', font);
}

export function FontProvider({ children }: { children: ReactNode }) {
  const [font, setFont] = useState<FontPref>(
    () => (localStorage.getItem(STORAGE_KEY) as FontPref) || 'default'
  );

  function toggleFont() {
    const next: FontPref = font === 'default' ? 'poppins' : 'default';
    setFont(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyFont(next);
  }

  return (
    <FontContext.Provider value={{ font, toggleFont }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  return useContext(FontContext);
}
