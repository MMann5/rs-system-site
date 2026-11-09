// FR28, FR29, FR30, FR33, UX-DR29, AD-5, AD-6, AD-13, AD-14 : îlot du formulaire de Contact (TypeScript
// vanilla, aucun framework). Chargé par Contact.astro. Seuls imports : les modules purs
// src/lib/contact/core.ts (validation, message WhatsApp) et src/lib/track-events.ts (détail des événements).
// Story 2.2 : validation à l'envoi seulement (aucun écouteur de frappe ni de perte du focus). Les messages,
// le résumé et les icônes sont rendus au build (textes i18n) ; l'îlot ne connaît aucune chaîne : il montre,
// cache et clone ce balisage, et pose les attributs ARIA.
// Story 2.3 : lit #rs-data (contexte, tables `services` et `cities`), présélectionne le service et la ville
// d'après `?service=` / `?city=`, compose le message hébreu avec waHref() et ouvre WhatsApp (même onglet sur
// appareil tactile, nouvel onglet sinon) ; émet `form_submit` / `form_error` par CustomEvent('rs:track').
// Les valeurs saisies ne sont jamais modifiées (hors préremplissage de la ville vide au chargement).
// Sans #rs-data lisible : la validation fonctionne, l'envoi valide n'ouvre rien et aucun événement n'est émis.
// Sans îlot : le formulaire est masqué sans JS (2.1), et si le script ne charge pas, `required` reste actif.
import {
  type ContactField,
  formLines,
  invalidContactFields,
  type LabelTable,
  resolveCityHe,
  waHref,
} from '../lib/contact/core.ts';
import { TRACK_EVENT_TYPE, type TrackDetail } from '../lib/track-events.ts';

interface RsData {
  lang: string;
  services: LabelTable;
  cities: LabelTable;
}

const isTable = (value: unknown): value is LabelTable =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Contexte et tables de #rs-data ; `undefined` si le bloc est absent ou illisible. */
function readRsData(): RsData | undefined {
  try {
    const raw: unknown = JSON.parse(document.getElementById('rs-data')?.textContent ?? '');
    if (typeof raw !== 'object' || raw === null) return undefined;
    const { context, services, cities } = raw as Record<string, unknown>;
    const lang = (context as { lang?: unknown } | null | undefined)?.lang;
    if (typeof lang !== 'string' || !isTable(services) || !isTable(cities)) return undefined;
    return { lang, services, cities };
  } catch {
    return undefined;
  }
}

const track = (detail: TrackDetail): void => {
  document.dispatchEvent(new CustomEvent(TRACK_EVENT_TYPE, { detail }));
};

/** Même onglet sur appareil tactile ; nouvel onglet sinon, ou même onglet si la popup est bloquée. */
const openWhatsApp = (href: string): void => {
  if (window.matchMedia('(pointer: coarse)').matches) {
    location.assign(href);
    return;
  }
  // Sans `noopener` : il ferait toujours renvoyer `null` et masquerait une popup bloquée.
  const win = window.open(href, '_blank');
  if (!win) {
    location.assign(href);
    return;
  }
  try {
    win.opener = null;
  } catch {
    // Fenêtre déjà inaccessible : rien à protéger.
  }
};

const form = document.getElementById('contact-form');

if (form instanceof HTMLFormElement) {
  const nameInput = document.getElementById('contact-name');
  const phoneInput = document.getElementById('contact-phone');
  const summary = document.getElementById('contact-errors');
  const template = document.getElementById('contact-errors-template');

  if (
    nameInput instanceof HTMLInputElement &&
    phoneInput instanceof HTMLInputElement &&
    summary &&
    template instanceof HTMLTemplateElement
  ) {
    const cityInput = document.getElementById('contact-city');
    const serviceSelect = document.getElementById('contact-service');
    const messageInput = document.getElementById('contact-message');
    const data = readRsData();
    const inputs: Record<ContactField, HTMLInputElement> = { name: nameInput, phone: phoneInput };
    const FIELDS: readonly ContactField[] = ['name', 'phone'];

    // Bulles natives remplacées par nos messages.
    form.noValidate = true;

    // Présélection (FR29) : codes connus seulement ; sinon le select garde `unsure` (rendu au build).
    let fromServiceParam = false;
    let cityParam: string | undefined;
    if (data) {
      const params = new URLSearchParams(location.search);
      const service = params.get('service');
      if (service !== null && Object.hasOwn(data.services, service) && serviceSelect instanceof HTMLSelectElement) {
        serviceSelect.value = service;
        fromServiceParam = true;
      }
      const city = params.get('city');
      if (city !== null && Object.hasOwn(data.cities, city)) {
        cityParam = city;
        if (cityInput instanceof HTMLInputElement && cityInput.value === '') {
          cityInput.value = (data.cities[city] as { label: string }).label;
        }
      }
    }

    const setError = (field: ContactField, invalid: boolean): void => {
      const input = inputs[field];
      const message = document.getElementById(`${input.id}-error`);
      if (invalid) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', `${input.id}-error`);
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
      if (message) message.hidden = !invalid;
    };

    // Résumé à partir de 2 erreurs : contenu du <template> inséré dans la région role="alert" déjà présente
    // (annoncé plus sûrement que le retrait de `hidden`), liens des champs valides retirés.
    const renderSummary = (invalid: readonly ContactField[]): void => {
      summary.replaceChildren();
      if (invalid.length < 2) return;
      const content = template.content.cloneNode(true) as DocumentFragment;
      for (const item of content.querySelectorAll<HTMLElement>('[data-field]')) {
        if (!invalid.includes(item.dataset.field as ContactField)) item.remove();
      }
      summary.append(content);
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const invalid = invalidContactFields({ name: nameInput.value, phone: phoneInput.value });
      for (const field of FIELDS) setError(field, invalid.includes(field));
      renderSummary(invalid);
      const first = invalid[0];
      if (first) {
        inputs[first].focus();
        if (data) track({ name: 'form_error', data: { lang: data.lang, fields: invalid.join(',') } });
        return;
      }
      if (!data) return;
      // Story 2.3 (FR30) : message hébreu, service et ville retrouvés par code ou par nom.
      const code = serviceSelect instanceof HTMLSelectElement ? serviceSelect.value : 'unsure';
      const serviceHe = code !== 'unsure' && Object.hasOwn(data.services, code) ? data.services[code]?.he : undefined;
      const cityText = cityInput instanceof HTMLInputElement ? cityInput.value : '';
      const message = messageInput instanceof HTMLTextAreaElement ? messageInput.value : '';
      const href = waHref({
        serviceHe,
        cityHe: resolveCityHe(cityText, data.cities, cityParam),
        lines: formLines({ name: nameInput.value, phone: phoneInput.value, message }),
      });
      track({
        name: 'form_submit',
        data: { lang: data.lang, service: code, from_service_param: fromServiceParam, city_filled: cityText.trim() !== '' },
      });
      openWhatsApp(href);
    });

    // Liens du résumé : focus sur le champ visé (sans changer l'URL).
    summary.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link) return;
      const input = document.getElementById(link.getAttribute('href')?.slice(1) ?? '');
      if (!(input instanceof HTMLElement)) return;
      event.preventDefault();
      input.focus();
    });
  }
}
