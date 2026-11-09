// AD-5, FR31, FR28 : noyau pur des liens et des règles du formulaire. Seul fichier de src/ qui connaît le numéro,
// les schémas de lien téléphone / WhatsApp et le gabarit hébreu du message (contrôlé par
// scripts/checks/contact-literals.mjs). Aucun import : les îlots peuvent l'importer.
// Il reçoit des libellés hébreux déjà résolus (src/lib/contact/labels.ts) et ne connaît pas `unsure`.
// Story 2.2 : règles de validation du formulaire de Contact (Nom, Téléphone), utilisées par l'îlot
// src/scripts/contact-form.ts.
// Syntaxe TypeScript effaçable uniquement : Node l'importe directement (tests).

const PHONE_E164 = '+972509565669';
const WA_BASE = 'https://wa.me/972509565669';

/** Affichage du numéro, toujours dans `<bdi dir="ltr">`, dans les 4 langues. */
export const PHONE_DISPLAY = '050-956-5669';

const GREETING = 'שלום RS SYSTEM, הגעתי מהאתר.';
const QUOTE = ' אשמח לקבל הצעת מחיר';

export interface WaInput {
  /** Libellé hébreu du service de la page hôte. */
  serviceHe?: string | undefined;
  /** Nom hébreu de la ville (page ville, ou saisie libre du formulaire). */
  cityHe?: string | undefined;
  /** Lignes ajoutées après le message, une par ligne (formulaire). */
  lines?: readonly string[] | undefined;
}

export function telHref(): string {
  return `tel:${PHONE_E164}`;
}

/** Valeur vide, absente ou faite d'espaces = absente. */
const present = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Message hébreu pré-rempli (non encodé). */
export function waMessage({ serviceHe, cityHe, lines = [] }: WaInput = {}): string {
  const service = present(serviceHe);
  const city = present(cityHe);
  let message = GREETING;
  if (service || city) {
    message += QUOTE;
    if (service) message += ` ל${service}`;
    if (city) message += ` ב${city}`;
    message += '.';
  }
  for (const line of lines) {
    const text = present(line);
    if (text) message += `\n${text}`;
  }
  return message;
}

export function waHref(input: WaInput = {}): string {
  return `${WA_BASE}?text=${encodeURIComponent(waMessage(input))}`;
}

// — Story 2.2 (FR28) : validation du formulaire de Contact, à l'envoi seulement —

/** Champs obligatoires du formulaire, dans l'ordre de lecture. */
export type ContactField = 'name' | 'phone';

export interface ContactValues {
  name: string;
  phone: string;
}

/** Nom valide : non vide après suppression des espaces. */
export function isValidName(value: string): boolean {
  return value.trim() !== '';
}

/** Retire espaces, tirets, points et parenthèses. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s\-.()]/g, '');
}

const PHONE_RE = /^(?:0\d{8,9}|\+972\d{8,9}|\+\d{8,15})$/;

/** Téléphone valide : `0` + 8–9 chiffres, `+972` + 8–9 chiffres ou `+` + 8–15 chiffres, une fois normalisé. */
export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(normalizePhone(value));
}

/** Champs invalides, dans l'ordre Nom puis Téléphone. */
export function invalidContactFields({ name, phone }: ContactValues): ContactField[] {
  const invalid: ContactField[] = [];
  if (!isValidName(name)) invalid.push('name');
  if (!isValidPhone(phone)) invalid.push('phone');
  return invalid;
}
