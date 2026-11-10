// Story 7.1 (AD-6, AD-10, FR34, FR35, NFR8) : îlot de mesure, seul code du site qui appelle Umami
// (`window.umami.track`). Chargé par Base.astro sur toutes les pages, même non indexables : sans Umami, il ne fait
// qu'appeler le rappel `done` des événements (le formulaire n'attend alors pas ses 300 ms).
// Seul import : le module pur src/lib/track-events.ts (listes fermées, détails typés).
// - Clics : délégation sur les liens `a[data-track][data-placement]` (Appeler, WhatsApp), valeurs des listes
//   seulement ; propriétés `page`, `lang`, `placement`.
// - Autres événements : `CustomEvent('rs:track', { detail })` émis par contact-form.ts et nav.ts ; propriétés
//   `page`, `lang` et les champs typés du détail, rien d'autre (jamais nom, téléphone, ville saisie, message, lien).
// - `page` = `<html data-page-id>`, `lang` = `<html lang>`. L'URL (avec ses `utm_*`) est envoyée par Umami
//   lui-même : rien n'est retiré.
// - Script Umami présent mais pas encore exécuté : événements gardés (20 au plus, les plus anciens perdus), envoyés
//   à son `load` ; à son `error`, abandonnés. Sans script Umami : rien n'est envoyé.
// - `done` est appelé une seule fois : à la résolution ou au rejet de `track`, sur une exception, ou tout de suite
//   s'il n'y a rien à envoyer. L'îlot ne lève jamais.
import { LANGUAGE_SWITCH_PLACEMENTS, TRACK_EVENT_TYPE, TRACK_PLACEMENTS, type TrackRequest } from '../lib/track-events.ts';

type Props = Record<string, string | boolean>;

interface Umami {
  track: (name: string, data: Props) => unknown;
}

interface Pending {
  name: string;
  props: Props;
  done: () => void;
}

const QUEUE_MAX = 20;
const CLICK_EVENTS: readonly string[] = ['call_click', 'whatsapp_click'];
const PLACEMENTS: readonly string[] = TRACK_PLACEMENTS;
const SWITCH_PLACEMENTS: readonly string[] = LANGUAGE_SWITCH_PLACEMENTS;
/** Champs admis par événement non-clic : tout autre champ du détail est ignoré. */
const DETAIL_KEYS: Readonly<Record<string, readonly string[]>> = {
  form_submit: ['lang', 'service', 'from_service_param', 'city_filled'],
  form_error: ['lang', 'fields'],
  language_switch: ['from', 'to', 'placement'],
};

const umami = (): Umami | undefined => {
  const candidate = (window as { umami?: Partial<Umami> }).umami;
  return typeof candidate?.track === 'function' ? (candidate as Umami) : undefined;
};

/** Script Umami du `<head>` (posé par Base.astro seulement si le build est indexable avec un id de site). */
const script = document.querySelector<HTMLScriptElement>('script[data-website-id]');
/**
 * Vrai tant que le script Umami peut encore arriver. Un script `defer` du <head> s'exécute (ou échoue) avant les
 * modules, donc d'ordinaire avant cet îlot, et son `load` / `error` a déjà eu lieu : on n'attend que si le document
 * est encore en cours d'analyse et que `window.umami` manque. Sinon (Umami bloqué), rien n'est gardé.
 */
let waiting = script !== null && umami() === undefined && document.readyState === 'loading';
const queue: Pending[] = [];

/** Rappel appelé au plus une fois, sans jamais propager une exception. */
const once = (done: (() => void) | undefined): (() => void) => {
  let called = false;
  return () => {
    if (called || typeof done !== 'function') return;
    called = true;
    try {
      done();
    } catch {
      // Le rappel de l'îlot appelant ne doit pas casser la mesure.
    }
  };
};

const send = (api: Umami, { name, props, done }: Pending): void => {
  try {
    const result = api.track(name, props);
    if (result !== null && typeof result === 'object' && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(done, done);
    } else {
      done();
    }
  } catch {
    done();
  }
};

const emit = (pending: Pending): void => {
  const api = umami();
  if (api) {
    send(api, pending);
    return;
  }
  if (!waiting) {
    pending.done();
    return;
  }
  queue.push(pending);
  // Au-delà de 20 : les plus anciens sont perdus (leur rappel est appelé, ils ne partiront pas).
  while (queue.length > QUEUE_MAX) queue.shift()?.done();
};

const flush = (): void => {
  waiting = false;
  const api = umami();
  for (const pending of queue.splice(0)) {
    if (api) send(api, pending);
    else pending.done();
  }
};

script?.addEventListener('load', flush);
script?.addEventListener('error', flush);

/** Propriétés communes : id de page et langue, lus sur `<html>`. */
const base = (): { page: string; lang: string } => {
  const html = document.documentElement;
  return { page: html.getAttribute('data-page-id') ?? '', lang: html.getAttribute('lang') ?? '' };
};

const isPrimitive = (value: unknown): value is string | boolean => typeof value === 'string' || typeof value === 'boolean';

document.addEventListener('click', (event) => {
  try {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[data-track][data-placement]');
    if (!link) return;
    const name = link.getAttribute('data-track') ?? '';
    const placement = link.getAttribute('data-placement') ?? '';
    if (!CLICK_EVENTS.includes(name) || !PLACEMENTS.includes(placement)) return;
    emit({ name, props: { ...base(), placement }, done: once(undefined) });
  } catch {
    // Mesure silencieuse : le lien suit son cours.
  }
});

document.addEventListener(TRACK_EVENT_TYPE, (event) => {
  const detail = (event as CustomEvent<Partial<TrackRequest> | null>).detail;
  const done = once(detail?.done);
  try {
    const name = detail?.name;
    const keys = typeof name === 'string' && Object.hasOwn(DETAIL_KEYS, name) ? DETAIL_KEYS[name] : undefined;
    const data = detail?.data as Record<string, unknown> | undefined;
    if (!keys || typeof data !== 'object' || data === null || typeof name !== 'string') {
      done();
      return;
    }
    // Critère 7.1 : chaque événement part avec `page` et `lang` (lus sur <html>), puis ses champs typés.
    const props: Props = { ...base() };
    for (const key of keys) {
      if (key === 'lang') continue;
      const value = data[key];
      if (isPrimitive(value)) props[key] = value;
    }
    // language_switch : emplacement de la liste fermée seulement.
    if (name === 'language_switch' && !SWITCH_PLACEMENTS.includes(String(props.placement))) {
      done();
      return;
    }
    emit({ name, props, done });
  } catch {
    done();
  }
});
