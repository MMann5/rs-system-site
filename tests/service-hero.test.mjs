// Story 3.2 (FR3, AD-4) : héros des pages services, photo encadrée ou illustration ; `alt` exigé pour une photo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroPhoto } from '../src/lib/service-hero.ts';

const ALT = { he: 'מצלמה', en: 'Camera', ru: 'Камера', fr: 'Caméra' };
const PHOTO = { kind: 'photo', src: 'land.jpg', portrait: 'portrait.jpg', focus: 'dome' };

test('heroPhoto : héros photo → photo avec alt traduit', () => {
  assert.deepEqual(heroPhoto('cameras', PHOTO, ALT, 'fr'), { src: 'land.jpg', portrait: 'portrait.jpg', focus: 'dome', alt: 'Caméra' });
});

test('heroPhoto : héros illustré → aucune photo, alt inutile', () => {
  assert.equal(heroPhoto('smoke-detectors', { kind: 'detector' }, undefined, 'he'), undefined);
});

test('heroPhoto : héros photo sans alt → erreur qui nomme la page', () => {
  assert.throws(() => heroPhoto('cameras', PHOTO, undefined, 'he'), { message: 'Service : page « cameras » à photo sans hero.alt dans src/content/pages/cameras.yaml' });
});
