// AD-14, FR17, UX-DR11 : îlot du menu mobile (TypeScript vanilla, aucune donnée de build ; seul import : le module
// pur src/lib/track-events.ts, story 7.1).
// Chargé par Header.astro. Sans JS, le panneau #mobile-menu reste déplié sous la barre (NFR9) ;
// avec JS, le CSS le masque tant que le <header> n'a pas `data-menu-open`.
// Ouvre / ferme au clic du bouton (le focus reste sur le bouton, jamais déplacé dans le panneau), ferme avec Échap (focus rendu au
// bouton), sur un lien du panneau, sur un clic hors du panneau et du bouton, ou quand le focus quitte
// le panneau pour un élément autre que le bouton.
// Le défilement de la page n'est jamais verrouillé (aucune écriture sur le style du body).
// Story 1.7 (AD-14) : recopie de location.search (?service=, utm_*…) sur les liens des sélecteurs de
// langues ([data-lang-switcher], menu et footer), indépendamment du menu. Sans JS : liens sans paramètre.
// Story 7.1 (AD-6, FR34) : un clic sur une autre langue du sélecteur émet `language_switch` par
// CustomEvent('rs:track') (track.ts le transmet) ; `placement` = valeur de `data-lang-switcher` (`footer` ou
// `mobile_menu`). La langue de la page (aria-current) n'émet rien.
import { LANGUAGE_SWITCH_PLACEMENTS, TRACK_EVENT_TYPE, type TrackRequest } from '../lib/track-events.ts';

const SWITCH_PLACEMENTS: readonly string[] = LANGUAGE_SWITCH_PLACEMENTS;

for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-lang-switcher] a[hreflang]')) {
  if (location.search) link.search = location.search;
  link.addEventListener('click', () => {
    if (link.hasAttribute('aria-current')) return;
    const placement = link.closest('[data-lang-switcher]')?.getAttribute('data-lang-switcher') ?? '';
    const to = link.getAttribute('hreflang') ?? '';
    const html = document.documentElement;
    if (!SWITCH_PLACEMENTS.includes(placement) || !to) return;
    const detail = {
      name: 'language_switch',
      data: {
        page: html.getAttribute('data-page-id') ?? '',
        from: html.getAttribute('lang') ?? '',
        to,
        placement: placement as (typeof LANGUAGE_SWITCH_PLACEMENTS)[number],
      },
    } satisfies TrackRequest;
    document.dispatchEvent(new CustomEvent(TRACK_EVENT_TYPE, { detail }));
  });
}

const button = document.querySelector<HTMLButtonElement>('button[aria-controls="mobile-menu"]');
const panel = document.getElementById('mobile-menu');
const header = button?.closest('header');

if (button && panel && header) {
  const isOpen = (): boolean => button.getAttribute('aria-expanded') === 'true';

  const setOpen = (open: boolean): void => {
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    header.toggleAttribute('data-menu-open', open);
  };

  // Focus explicite : Safari (iOS, macOS) ne focalise pas un bouton touché ou cliqué ; sans lui, Échap
  // et la tabulation repartiraient du début de la page.
  button.addEventListener('click', () => {
    setOpen(!isOpen());
    if (document.activeElement !== button) button.focus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    button.focus();
  });

  // Tab hors du panneau superposé (vers <main>, caché dessous) : ferme, le focus ne reste jamais masqué
  // (WCAG 2.4.11). relatedTarget nul (fenêtre quittée, clic sur du vide) : rien.
  panel.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (!isOpen() || !(next instanceof Node) || next === button || panel.contains(next)) return;
    setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!isOpen()) return;
    const target = event.target;
    if (!(target instanceof Node) || button.contains(target)) return;
    if (!panel.contains(target)) {
      setOpen(false);
      return;
    }
    if (target instanceof Element && target.closest('a[href]')) setOpen(false);
  });
}
