// AD-14, FR17, UX-DR11 : îlot du menu mobile (TypeScript vanilla, aucun import, aucune donnée de build).
// Chargé par Header.astro. Sans JS, le panneau #mobile-menu reste déplié sous la barre (NFR9) ;
// avec JS, le CSS le masque tant que le <header> n'a pas `data-menu-open`.
// Ouvre / ferme au clic du bouton (le focus reste sur le bouton, jamais déplacé dans le panneau), ferme avec Échap (focus rendu au
// bouton), sur un lien du panneau, sur un clic hors du panneau et du bouton, ou quand le focus quitte
// le panneau pour un élément autre que le bouton.
// Le défilement de la page n'est jamais verrouillé (aucune écriture sur le style du body).
// Recopie de location.search sur le sélecteur de langues : story 1.7.

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
