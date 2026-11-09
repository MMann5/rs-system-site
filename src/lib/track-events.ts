// AD-6 : listes fermées de la mesure (EXPERIENCE.md › Mesure des contacts) et détail typé des événements
// non-clic émis par les îlots via `CustomEvent('rs:track', { detail })`. Seul src/scripts/track.ts (epic 7)
// les transmettra à Umami. Aucun nom, téléphone, ville saisie ni message dans un détail.
// Aucun import, syntaxe TypeScript effaçable uniquement : les îlots et Node (tests) l'importent directement.

/** Type de l'événement DOM écouté par track.ts. */
export const TRACK_EVENT_TYPE = 'rs:track';

/** Les 5 événements d'EXPERIENCE.md › Mesure des contacts. */
export const TRACK_EVENTS = ['call_click', 'whatsapp_click', 'form_submit', 'form_error', 'language_switch'] as const;

/** Les 9 emplacements (`placement`) des clics Appeler et WhatsApp. */
export const TRACK_PLACEMENTS = [
  'header',
  'hero',
  'tile',
  'mobile_bar',
  'contact_band',
  'contact_page',
  'article_box',
  'footer',
  '404',
] as const;

export type TrackEvent = (typeof TRACK_EVENTS)[number];
export type TrackPlacement = (typeof TRACK_PLACEMENTS)[number];

/** Formulaire valide, au moment d'ouvrir WhatsApp. `service` = code du select. */
export interface FormSubmitDetail {
  name: 'form_submit';
  data: { lang: string; service: string; from_service_param: boolean; city_filled: boolean };
}

/** Envoi refusé par la validation. `fields` = champs invalides joints par `,` (ex. `name,phone`). */
export interface FormErrorDetail {
  name: 'form_error';
  data: { lang: string; fields: string };
}

export type TrackDetail = FormSubmitDetail | FormErrorDetail;
