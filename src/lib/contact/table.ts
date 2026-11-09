// AD-4, AD-5, AD-13 : cœur pur de la table des services et du message WhatsApp d'une page.
// src/lib/contact/labels.ts lui passe les entrées de src/content/services.yaml ; toute anomalie lève,
// donc fait échouer le build (labels.ts est importé par MobileBar.astro depuis la story 1.6).
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).
import type { Lang } from '../langs.ts';
import type { PageContext } from '../page-context.ts';
import type { WaInput } from './core.ts';

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

/**
 * Entrée de `waHref()` pour la page `ctx` (FR31) : service de la page hôte en hébreu, sans service
 * pour `unsure` ou une page sans service. Lève sur un code inconnu, et sur une ville tant que la table
 * des villes n'existe pas (epic 4) : mieux vaut un build en échec qu'un message sans sa ville.
 */
export function pageWaInput(ctx: Pick<PageContext, 'service' | 'city'>, table: ServiceTable): WaInput {
  const input: WaInput = {};
  const { service, city } = ctx;
  if (service !== undefined && service !== 'unsure') {
    if (!Object.hasOwn(table, service)) throw new Error(`contact : service inconnu « ${service} »`);
    input.serviceHe = table[service as ServiceCode].he;
  }
  if (city !== undefined) throw new Error('contact : table des villes absente (epic 4)');
  return input;
}
