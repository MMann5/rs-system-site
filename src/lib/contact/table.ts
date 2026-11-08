// AD-4, AD-5 : cœur pur de la table des services. src/lib/contact/labels.ts lui passe les entrées
// de src/content/services.yaml ; toute anomalie lève. Le build n'échoue que lorsqu'un composant importe
// labels.ts (stories 1.6+) ; d'ici là, tests/contact.test.mjs garde services.yaml.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import type { Lang } from '../langs.ts';

/** Les 7 codes du formulaire (`?service=`), dans l'ordre du sélecteur. */
export const SERVICE_CODES = ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom', 'crane-cameras', 'unsure'] as const;

export type ServiceCode = (typeof SERVICE_CODES)[number];

export interface ServiceEntry {
  /** Code du service. */
  id: string;
  label: Record<Lang, string>;
  /** Id de la page liée ; aucun pour `unsure`. */
  page?: string | undefined;
}

export interface ServiceLabel {
  /** Libellé dans la langue demandée. */
  label: string;
  /** Libellé hébreu, pour le message WhatsApp. */
  he: string;
}

export type ServiceTable = Record<ServiceCode, ServiceLabel>;

/** `{ code: { label, he } }` dans l'ordre de SERVICE_CODES ; lève si les codes ≠ les 7 attendus. */
export function buildServiceTable(entries: readonly ServiceEntry[], lang: Lang): ServiceTable {
  const errors: string[] = [];
  const byCode = new Map<string, ServiceEntry>();
  for (const entry of entries) {
    if (byCode.has(entry.id)) errors.push(`code « ${entry.id} » en double`);
    else byCode.set(entry.id, entry);
    if (!(SERVICE_CODES as readonly string[]).includes(entry.id)) errors.push(`code « ${entry.id} » inconnu`);
  }
  for (const code of SERVICE_CODES) {
    if (!byCode.has(code)) errors.push(`code « ${code} » manquant`);
  }
  if (errors.length > 0) throw new Error(errors.map((line) => `labels : ${line}`).join('\n'));

  const table = {} as ServiceTable;
  for (const code of SERVICE_CODES) {
    const { label } = byCode.get(code) as ServiceEntry;
    table[code] = { label: label[lang], he: label.he };
  }
  return table;
}
