import { useEffect, useState } from 'react';

export type Language = 'pl' | 'en';
const KEY = 'joypad.language';
export const LANGUAGES: Record<Language, string> = { pl: 'Polski', en: 'English' };
export function loadLanguage(): Language { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'pl'; } catch { return 'pl'; } }
export function setLanguage(language: Language) { try { localStorage.setItem(KEY, language); } catch { /* optional */ } window.dispatchEvent(new CustomEvent('joypad-language', { detail: language })); }
export function useLanguage() {
  const [language, setState] = useState<Language>(loadLanguage);
  useEffect(() => { const update = (event: Event) => setState((event as CustomEvent<Language>).detail || loadLanguage()); window.addEventListener('joypad-language', update); return () => window.removeEventListener('joypad-language', update); }, []);
  return language;
}
export const copy = {
  pl: { language: 'Język interfejsu', languageDetail: 'Nowe ekrany obsługują Polski i English.', gallery: 'Galeria Moments', save: 'Zapisz do Galerii Moments', saved: 'Zapisano w galerii', close: 'Zamknij' },
  en: { language: 'Interface language', languageDetail: 'New screens support Polski and English.', gallery: 'Moments Gallery', save: 'Save to Moments Gallery', saved: 'Saved to gallery', close: 'Close' },
} as const;
