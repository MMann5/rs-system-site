// Story 3.2 (FR3, AD-4) : héros des pages services, photo encadrée ou illustration ; `alt` exigé pour une photo.
// Story 3.3 (UX-DR14) : ratio du cadre sous 700px par photo, 4:5 par défaut, 4:3 pour interrupteur et interphone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroPhoto } from '../src/lib/service-hero.ts';

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
