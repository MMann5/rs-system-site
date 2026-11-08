// AD-4, AD-11 (complétude) : cœur pur des chaînes d'interface. src/lib/i18n/index.ts lui passe
// les 4 fichiers src/i18n/{lang}.json ; toute anomalie lève au chargement, donc fait échouer le build.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import { LANGS, isLang, type Lang } from '../langs.ts';

/** Clé plate pointée `section.element` : au moins deux segments `[a-z][a-z0-9-]*`. */
export const KEY_RE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export interface DictionarySource {
  /** Code de langue = nom du fichier. */
  id: string;
  data: Record<string, unknown>;
}

export interface Dictionary {
  keys: readonly string[];
  t(lang: Lang, key: string): string;
}

export function buildDictionary(sources: readonly DictionarySource[]): Dictionary {
  const errors: string[] = [];
  const byLang = new Map<Lang, Record<string, unknown>>();

  for (const { id, data } of sources) {
    if (!isLang(id)) errors.push(`fichier « ${id}.json » hors des langues ${LANGS.join(', ')}`);
    else if (byLang.has(id)) errors.push(`langue « ${id} » fournie deux fois`);
    else byLang.set(id, data);
  }
  for (const lang of LANGS) {
    if (!byLang.has(lang)) errors.push(`fichier « ${lang}.json » manquant`);
  }

  const all = new Set<string>();
  for (const [lang, data] of byLang) {
    for (const [key, value] of Object.entries(data)) {
      all.add(key);
      if (!KEY_RE.test(key)) errors.push(`${lang} : clé « ${key} » invalide (attendu section.element)`);
      if (typeof value !== 'string' || value.trim() === '') errors.push(`${lang} : valeur vide pour « ${key} »`);
    }
  }
  const keys = [...all].sort();
  for (const [lang, data] of byLang) {
    const missing = keys.filter((key) => !Object.hasOwn(data, key));
    if (missing.length > 0) errors.push(`${lang} : clés manquantes ${missing.join(', ')}`);
  }

  if (errors.length > 0) throw new Error(errors.map((line) => `i18n : ${line}`).join('\n'));

  const table = new Map(LANGS.map((lang) => [lang, byLang.get(lang) as Record<string, string>]));
  return {
    keys: Object.freeze(keys),
    t(lang, key) {
      const strings = table.get(lang);
      if (!strings) throw new Error(`i18n : langue inconnue « ${String(lang)} »`);
      if (!Object.hasOwn(strings, key)) throw new Error(`i18n : clé inconnue « ${key} »`);
      return strings[key] as string;
    },
  };
}
