// NFR5, UX-DR2 : source unique du préchargement de police, repris par le layout (story 1.4).
// Seule la 700 de l'écriture de la langue est préchargée (titres) ; le reste se charge par unicode-range.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).

export type FontLang = 'he' | 'en' | 'ru' | 'fr';

export const FONT_PRELOAD: Record<FontLang, string> = {
  he: '/fonts/noto-sans-hebrew-700.woff2',
  en: '/fonts/noto-sans-latin-700.woff2',
  ru: '/fonts/noto-sans-cyrillic-700.woff2',
  fr: '/fonts/noto-sans-latin-700.woff2',
};
