// Story 3.2 (FR3, AD-4) : héros des pages services, photo encadrée ou illustration ; `alt` exigé pour une photo.
// Story 3.3 (UX-DR14) : ratio du cadre sous 700px par photo, 4:5 par défaut, 4:3 pour interrupteur et interphone.
// Story 3.4 (UX-DR13, FR23) : héros sombre `cover` (Réseaux, Entrepreneurs) et liens de tuile omis si leur cible est inactive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroCover, heroPhoto, tileLinks } from '../src/lib/service-hero.ts';

const ALT = { he: 'מצלמה', en: 'Camera', ru: 'Камера', fr: 'Caméra' };
const PHOTO = { kind: 'photo', src: 'land.jpg', portrait: 'portrait.jpg', focus: 'dome' };

test('heroPhoto : héros photo → photo avec alt traduit, cadre 4:5 sous 700px par défaut', () => {
  assert.deepEqual(heroPhoto('cameras', PHOTO, ALT, 'fr'), { src: 'land.jpg', portrait: 'portrait.jpg', focus: 'dome', mobile: 'portrait', alt: 'Caméra' });
});

test('heroPhoto : ratio mobile paysage (4:3) et point focal transmis', () => {
  const hero = { kind: 'photo', src: 'land.jpg', portrait: 'mobile.jpg', focus: 'intercom', mobile: 'landscape' };
  assert.deepEqual(heroPhoto('intercom', hero, ALT, 'he'), { src: 'land.jpg', portrait: 'mobile.jpg', focus: 'intercom', mobile: 'landscape', alt: 'מצלמה' });
});

test('heroPhoto : héros illustré → aucune photo, alt inutile', () => {
  assert.equal(heroPhoto('smoke-detectors', { kind: 'detector' }, undefined, 'he'), undefined);
});

test('heroPhoto : héros photo sans alt → erreur qui nomme la page', () => {
  assert.throws(() => heroPhoto('cameras', PHOTO, undefined, 'he'), { message: 'Service : page « cameras » à photo sans hero.alt dans src/content/pages/cameras.yaml' });
  assert.throws(() => heroPhoto('smart-home', { ...PHOTO, focus: 'switch', mobile: 'landscape' }, undefined, 'he'), { message: 'Service : page « smart-home » à photo sans hero.alt dans src/content/pages/smart-home.yaml' });
});

const COVER = { kind: 'cover', src: 'net.jpg', portrait: 'net-portrait.jpg', focus: 'network', scrim: 'network', size: 'networks', quote: 'quote' };

test('heroCover : héros sombre → photo, variante et clé du lien Devis', () => {
  assert.deepEqual(heroCover('networks', COVER, ALT, 'ru'), {
    photo: { src: 'net.jpg', portrait: 'net-portrait.jpg', alt: 'Камера' },
    variant: { focus: 'network', scrim: 'network', size: 'networks' },
    quoteKey: 'action.quote',
  });
  const crane = { ...COVER, focus: 'crane', scrim: 'crane', size: 'contractors', quote: 'quote-site' };
  assert.deepEqual(heroCover('contractors', crane, ALT, 'he'), {
    photo: { src: 'net.jpg', portrait: 'net-portrait.jpg', alt: 'מצלמה' },
    variant: { focus: 'crane', scrim: 'crane', size: 'contractors' },
    quoteKey: 'action.quote-site',
  });
});

test('heroCover / heroPhoto : chacun ignore le héros de l\'autre', () => {
  assert.equal(heroCover('cameras', PHOTO, ALT, 'he'), undefined);
  assert.equal(heroCover('smoke-detectors', { kind: 'detector' }, undefined, 'he'), undefined);
  assert.equal(heroPhoto('networks', COVER, ALT, 'he'), undefined);
});

test('heroCover : héros sombre sans alt → erreur qui nomme la page', () => {
  assert.throws(() => heroCover('networks', COVER, undefined, 'he'), { message: 'Service : page « networks » à photo sans hero.alt dans src/content/pages/networks.yaml' });
});

/** Faux registre : `enabled` = ids actifs ; `url` lève pour un id inactif (jamais appelé pour lui). */
function deps(enabled) {
  return {
    isEnabled: (id) => enabled.includes(id),
    url: (id, lang) => {
      if (!enabled.includes(id)) throw new Error(`url appelé pour ${id} inactif`);
      return `/${lang}/${id}/`;
    },
    t: (lang, key) => `${lang}:${key}`,
  };
}

test('tileLinks : details → page cible active, libellé action.details', () => {
  assert.deepEqual(tileLinks({ kind: 'details', page: 'contractors' }, { lang: 'fr', service: 'cameras' }, deps(['contractors', 'contact'])), [{ href: '/fr/contractors/', label: 'fr:action.details' }]);
  assert.deepEqual(tileLinks({ kind: 'details', page: 'networks' }, { lang: 'he', service: 'crane-cameras' }, deps(['networks'])), [{ href: '/he/networks/', label: 'he:action.details' }]);
});

test('tileLinks : details → omis si la cible est inactive (contractors, networks)', () => {
  assert.deepEqual(tileLinks({ kind: 'details', page: 'contractors' }, { lang: 'he', service: 'cameras' }, deps(['contact', 'networks'])), []);
  assert.deepEqual(tileLinks({ kind: 'details', page: 'networks' }, { lang: 'en', service: 'crane-cameras' }, deps(['contact', 'contractors'])), []);
});

test('tileLinks : visit → Contact ?service= de la page, omis si contact est inactif', () => {
  assert.deepEqual(tileLinks({ kind: 'visit' }, { lang: 'ru', service: 'intercom' }, deps(['contact'])), [{ href: '/ru/contact/?service=intercom', label: 'ru:action.site-visit' }]);
  assert.deepEqual(tileLinks({ kind: 'visit' }, { lang: 'ru', service: 'intercom' }, deps(['intercom'])), []);
});
