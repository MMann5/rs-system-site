// FR28, FR33, UX-DR29, AD-5, AD-14 : îlot du formulaire de Contact (TypeScript vanilla, aucun framework).
// Chargé par Contact.astro. Seul import : le noyau pur src/lib/contact/core.ts (règles de validation).
// Story 2.2 : validation à l'envoi seulement (aucun écouteur de frappe ni de perte du focus). Les messages,
// le résumé et les icônes sont rendus au build (textes i18n) ; l'îlot ne connaît aucune chaîne : il montre,
// cache et clone ce balisage, et pose les attributs ARIA. Les valeurs des champs ne sont jamais modifiées.
// Sans îlot : le formulaire est masqué sans JS (2.1), et si le script ne charge pas, `required` reste actif.
import { type ContactField, invalidContactFields } from '../lib/contact/core.ts';

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
    const inputs: Record<ContactField, HTMLInputElement> = { name: nameInput, phone: phoneInput };
    const FIELDS: readonly ContactField[] = ['name', 'phone'];

    // Bulles natives remplacées par nos messages.
    form.noValidate = true;

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
        return;
      }
      // Story 2.3 : composition du message et ouverture de WhatsApp.
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
