// Story 1.5 (AD-14) : listes de navigation du header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildNav, HEADER_NAV_IDS } from '../src/lib/nav/core.ts';

const LANGS = ['he', 'en', 'ru', 'fr'];

/** Registre factice : seuls les ids `active` existent ; url() lève sur un autre id, comme le vrai. */
function deps(active) {
  return {
    isEnabled: (id) => active.includes(id),
    url: (id, lang) => {
      if (!active.includes(id)) throw new Error(`routes : « ${id} » inactif`);
      return `/${lang}/${id}/`;
    },
    label: (lang, key) => `${lang}:${key}`,
  };
}

test('HEADER_NAV_IDS : 10 ids dans l’ordre du header', () => {
  assert.deepEqual(HEADER_NAV_IDS, ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom', 'contractors', 'areas', 'blog', 'about', 'contact']);
});

test('buildNav : seuls cameras et blog actifs, navSection blog → 2 items dans l’ordre fixe, blog courant', () => {
  const items = buildNav(HEADER_NAV_IDS, 'fr', deps(['blog', 'cameras', 'home']), 'blog');
  assert.deepEqual(items, [
    { id: 'cameras', href: '/fr/cameras/', label: 'fr:nav.cameras', current: false },
    { id: 'blog', href: '/fr/blog/', label: 'fr:nav.blog', current: true },
  ]);
});

test('buildNav : ids inactifs ou inconnus omis sans erreur ; sans navSection, aucun courant', () => {
  assert.deepEqual(buildNav(HEADER_NAV_IDS, 'he', deps(['home'])), []);
  const items = buildNav(['contact', 'nope'], 'he', deps(['contact']));
  assert.deepEqual(items, [{ id: 'contact', href: '/he/contact/', label: 'he:nav.contact', current: false }]);
});

test('clés nav.{id}, nav.main-label et header.home-label présentes dans les 4 fichiers i18n', () => {
  for (const lang of LANGS) {
    const dict = JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'));
    for (const key of [...HEADER_NAV_IDS.map((id) => `nav.${id}`), 'nav.main-label', 'header.home-label']) {
      assert.ok(typeof dict[key] === 'string' && dict[key].trim() !== '', `${lang} : ${key}`);
    }
  }
});
