// FR28, FR29, FR30, FR33, UX-DR29, AD-5, AD-6, AD-13, AD-14 : îlot du formulaire de Contact (TypeScript
// vanilla, aucun framework). Chargé par Contact.astro. Seuls imports : les modules purs
// src/lib/contact/core.ts (validation, message WhatsApp) et src/lib/track-events.ts (détail des événements).
// Story 2.2 : validation à l'envoi seulement (aucun écouteur de frappe ni de perte du focus). Les messages,
// le résumé et les icônes sont rendus au build (textes i18n) ; l'îlot ne connaît aucune chaîne : il montre,
// cache et clone ce balisage, et pose les attributs ARIA.
// Story 2.3 : lit #rs-data (contexte, tables `services` et `cities`), présélectionne le service et la ville
// d'après `?service=` / `?city=`, compose le message hébreu avec waHref() et ouvre WhatsApp (même onglet sur
// appareil tactile, nouvel onglet sinon) ; émet `form_submit` / `form_error` par CustomEvent('rs:track').
// Story 7.1 : WhatsApp s'ouvre après l'envoi de `form_submit` (rappel `done` de track.ts), au plus tard après 300 ms.
// Story 2.4 (FR33, UX-DR29) : état d'envoi (bouton aria-disabled, libellé d'envoi annoncé par
// #contact-sending, nouvel envoi ignoré pendant 3 s), confirmation au retour sur la page (visibilitychange
// hidden puis visible, ou pageshow persisted ; focus sur son titre, Réessayer = même lien), bloc hors ligne
// (navigator.onLine faux : template cloné dans #contact-offline, rien n'est ouvert, aucun form_submit).
// Les blocs et libellés sont rendus au build ; l'îlot ne fait que les montrer, les cacher et les cloner.
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
import { TRACK_EVENT_TYPE, type TrackRequest } from '../lib/track-events.ts';

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

const track = (detail: TrackRequest): void => {
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
    const button = form.querySelector<HTMLElement>('button[type="submit"]');
    const idleLabel = button?.querySelector<HTMLElement>('.submit-idle');
    const sendingLabel = button?.querySelector<HTMLElement>('.submit-sending');
    const sendingStatus = document.getElementById('contact-sending');
    const sent = document.getElementById('contact-sent');
    const sentTitle = document.getElementById('contact-sent-title');
    const retry = document.getElementById('contact-sent-retry');
    const offline = document.getElementById('contact-offline');
    const offlineTemplate = document.getElementById('contact-offline-template');
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

    // Story 2.4 : état d'envoi. `sendingTimer` défini = envoi en cours (nouvel envoi ignoré).
    let sendingTimer: ReturnType<typeof setTimeout> | undefined;
    /** Un retour sur la page est attendu après l'ouverture de WhatsApp ; `left` : la page a été cachée depuis. */
    let awaiting = false;
    let left = false;
    let lastHref: string | undefined;

    const setSending = (on: boolean): void => {
      if (on) button?.setAttribute('aria-disabled', 'true');
      else button?.removeAttribute('aria-disabled');
      if (idleLabel) idleLabel.hidden = on;
      if (sendingLabel) sendingLabel.hidden = !on;
      if (sendingStatus) sendingStatus.textContent = on ? (sendingLabel?.textContent ?? '').trim() : '';
    };

    const stopSending = (): void => {
      clearTimeout(sendingTimer);
      sendingTimer = undefined;
      setSending(false);
    };

    // L'attente expire si la page n'a pas été cachée dans les 3 s (WhatsApp ouvert hors de la vue, ou pas du
    // tout) : un changement d'onglet ultérieur sans rapport ne montre pas la confirmation.
    let returnTimer: ReturnType<typeof setTimeout> | undefined;
    const awaitReturn = (): void => {
      awaiting = true;
      left = false;
      clearTimeout(returnTimer);
      returnTimer = setTimeout(() => {
        if (!left) awaiting = false;
      }, 3000);
    };

    const showSent = (): void => {
      awaiting = false;
      left = false;
      stopSending();
      if (sent) {
        sent.hidden = false;
        // Recette epic 2 (D6) : WebKit iPhone ne fait pas défiler jusqu'au titre focalisé ; le bloc est amené
        // à l'écran s'il n'y est pas (le scroll-padding du site laisse la place du header collant), puis le focus est posé.
        sent.scrollIntoView({ block: 'nearest' });
      }
      sentTitle?.focus({ preventScroll: true });
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (awaiting) left = true;
        return;
      }
      if (awaiting && left) showSent();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && awaiting) showSent();
    });

    // Réessayer : même lien, même ouverture qu'au premier envoi, aucun événement. Clic modifié : natif.
    retry?.addEventListener('click', (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !lastHref) return;
      event.preventDefault();
      openWhatsApp(lastHref);
      awaitReturn();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (sendingTimer !== undefined) return;
      if (sent) sent.hidden = true;
      offline?.replaceChildren();
      const invalid = invalidContactFields({ name: nameInput.value, phone: phoneInput.value });
      for (const field of FIELDS) setError(field, invalid.includes(field));
      renderSummary(invalid);
      const first = invalid[0];
      if (first) {
        inputs[first].focus();
        if (data) track({ name: 'form_error', data: { lang: data.lang, fields: invalid.join(',') } });
        return;
      }
      // Hors ligne : bloc d'alerte avec le lien Appeler ; rien n'est ouvert, aucun form_submit, focus inchangé.
      if (navigator.onLine === false) {
        if (offline && offlineTemplate instanceof HTMLTemplateElement) offline.append(offlineTemplate.content.cloneNode(true));
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
        quote: true,
      });
      setSending(true);
      sendingTimer = setTimeout(stopSending, 3000);
      lastHref = href;
      retry?.setAttribute('href', href);
      // Story 7.1 (AD-6) : WhatsApp s'ouvre quand track.ts a envoyé form_submit (rappel `done`), ou au plus tard
      // après 300 ms (track.ts absent ou Umami lent), une seule fois.
      let opened = false;
      const open = (): void => {
        if (opened) return;
        opened = true;
        clearTimeout(openTimer);
        openWhatsApp(href);
        awaitReturn();
      };
      const openTimer = setTimeout(open, 300);
      track({
        name: 'form_submit',
        data: { lang: data.lang, service: code, from_service_param: fromServiceParam, city_filled: cityText.trim() !== '' },
        done: open,
      });
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
