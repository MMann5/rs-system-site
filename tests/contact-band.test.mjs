// Story 1.8 (FR21, FR41, D2, D3) : cœur pur du bloc contact — note, ligne sous la note, liens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bandLinks, formatRating, ratingLine, toProof } from '../src/lib/contact/band.ts';

const LANGS = ['he', 'en', 'ru', 'fr'];
const I18N = Object.fromEntries(
  LANGS.map((lang) => [lang, JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'))]),
);
const t = (lang) => (key) => {
  if (!Object.hasOwn(I18N[lang], key)) throw new Error(`clé inconnue ${key}`);
  return I18N[lang][key];
};

/** Registre factice : seuls les ids `active` existent ; url() lève sur un autre id, comme le vrai. */
function deps(active) {
  const calls = [];
  return {
    calls,
    isEnabled: (id) => active.includes(id),
    url: (id, lang) => {
      calls.push(id);
      if (!active.includes(id)) throw new Error(`routes : « ${id} » inactif`);
      return `/${lang}/${{ areas: 'zones', contact: 'contact' }[id]}/`;
    },
  };
}

test('note seule : he/en « 9.94 », ru/fr « 9,94 » ; ligne = contact-band.midrag seul', () => {
  assert.deepEqual(LANGS.map((lang) => formatRating(9.94, lang)), ['9.94', '9.94', '9,94', '9,94']);
  for (const lang of LANGS) assert.equal(ratingLine({ rating: 9.94 }, lang, t(lang)), I18N[lang]['contact-band.midrag']);
  assert.equal(ratingLine({ rating: 9.94 }, 'fr', t('fr')), 'Note Midrag');
});

test('note et avis (fr) : « Note Midrag · 1 234 avis », groupement de Intl', () => {
  const n = new Intl.NumberFormat('fr').format(1234);
  assert.notEqual(n, '1234');
  assert.equal(ratingLine({ rating: 9.94, reviews: 1234 }, 'fr', t('fr')), `Note Midrag · ${n} avis`);
  assert.equal(ratingLine({ rating: 9.94, reviews: 12 }, 'ru', t('ru')), 'Рейтинг на Midrag · отзывов: 12');
});

test('sans note : aucune ligne, même avec un nombre d’avis', () => {
  assert.equal(ratingLine({}, 'he', t('he')), undefined);
  assert.equal(ratingLine({ reviews: 12 }, 'he', t('he')), undefined);
});

test('liens, epic 1 : areas et contact inactifs → {}, url jamais appelé', () => {
  const d = deps(['home']);
  assert.deepEqual(bandLinks({ lang: 'fr' }, d), {});
  assert.deepEqual(bandLinks({ lang: 'he', service: 'cameras' }, d), {});
  assert.deepEqual(d.calls, []);
});

test('liens actifs : zone et contact avec ?service= encodé', () => {
  const d = deps(['areas', 'contact']);
  assert.deepEqual(bandLinks({ lang: 'fr', service: 'cameras' }, d), { zoneHref: '/fr/zones/', detailsHref: '/fr/contact/?service=cameras' });
  assert.deepEqual(bandLinks({ lang: 'fr' }, d), { zoneHref: '/fr/zones/', detailsHref: '/fr/contact/' });
  assert.equal(bandLinks({ lang: 'fr', service: 'a b&c' }, d).detailsHref, '/fr/contact/?service=a%20b%26c');
  // Un seul des deux actif : l'autre lien est absent, son url jamais demandée.
  const zoneOnly = deps(['areas']);
  assert.deepEqual(bandLinks({ lang: 'he', service: 'cameras' }, zoneOnly), { zoneHref: '/he/zones/' });
  assert.deepEqual(zoneOnly.calls, ['areas']);
});

test('toProof : seulement les champs présents, {} sans entrée', () => {
  assert.deepEqual(toProof({ rating: 9.94 }), { rating: 9.94 });
  assert.deepEqual(toProof({ rating: 9.94, reviews: 12 }), { rating: 9.94, reviews: 12 });
  assert.ok(!Object.hasOwn(toProof({ rating: 9.94, reviews: undefined }), 'reviews'));
  assert.deepEqual(toProof(undefined), {});
});
