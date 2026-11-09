// AD-4 (conventions) : source unique des codes de langue, dans l'ordre he, en, ru, fr partout.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).

export const LANGS = ['he', 'en', 'ru', 'fr'] as const;

export type Lang = (typeof LANGS)[number];

/** AD-7 : direction de chaque langue, posée une seule fois sur <html>. */
export const DIR: Record<Lang, 'rtl' | 'ltr'> = { he: 'rtl', en: 'ltr', ru: 'ltr', fr: 'ltr' };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}
