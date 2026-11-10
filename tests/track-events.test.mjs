// Story 2.3 (AD-6) : listes fermées de la mesure, typées dans src/lib/track-events.ts (module pur, sans import),
// comparées au tableau d'EXPERIENCE.md › Mesure des contacts. Story 7.1 : 10 emplacements (`mobile_menu`), détail
// `language_switch`, enveloppe `TrackRequest` (rappel `done`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGE_SWITCH_PLACEMENTS, TRACK_EVENT_TYPE, TRACK_EVENTS, TRACK_PLACEMENTS } from '../src/lib/track-events.ts';

const SOURCE = readFileSync(new URL('../src/lib/track-events.ts', import.meta.url), 'utf8');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('track-events.ts : aucun import (module pur, importable par les îlots)', () => {
  const src = stripComments(SOURCE);
  assert.doesNotMatch(src, /(?:^|[^\w$.])import\b/m);
  assert.doesNotMatch(src, /\brequire\s*\(/);
});

test('TRACK_EVENT_TYPE vaut rs:track', () => {
  assert.equal(TRACK_EVENT_TYPE, 'rs:track');
});

test('TRACK_EVENTS : les 5 événements d’EXPERIENCE.md, en snake_case', () => {
  assert.deepEqual([...TRACK_EVENTS], ['call_click', 'whatsapp_click', 'form_submit', 'form_error', 'language_switch']);
  for (const name of TRACK_EVENTS) assert.match(name, /^[a-z0-9]+(?:_[a-z0-9]+)*$/);
});

test('TRACK_PLACEMENTS : les 10 emplacements de l’epic, dans son ordre, en snake_case', () => {
  assert.deepEqual([...TRACK_PLACEMENTS], ['header', 'hero', 'tile', 'mobile_bar', 'contact_band', 'contact_page', 'article_box', 'footer', '404', 'mobile_menu']);
  for (const name of TRACK_PLACEMENTS) assert.match(name, /^[a-z0-9]+(?:_[a-z0-9]+)*$/);
});

test('détails typés : aucune propriété pour le nom, le téléphone, la ville saisie ou le message', () => {
  const types = stripComments(SOURCE).match(/interface\s+Form\w+Detail\s*\{[\s\S]*?\n\}/g) ?? [];
  assert.equal(types.length, 2);
  const keys = types.flatMap((block) => [...block.matchAll(/(\w+)\??:/g)].map((m) => m[1]));
  assert.deepEqual(keys.filter((k) => !['name', 'data'].includes(k)).sort(), ['city_filled', 'fields', 'from_service_param', 'lang', 'lang', 'service'].sort());
  for (const forbidden of ['phone', 'message', 'city', 'text']) assert.ok(!keys.includes(forbidden), forbidden);
});

test('language_switch : placement footer ou mobile_menu (sous-liste de TRACK_PLACEMENTS), détail page / from / to / placement', () => {
  assert.deepEqual([...LANGUAGE_SWITCH_PLACEMENTS], ['footer', 'mobile_menu']);
  for (const p of LANGUAGE_SWITCH_PLACEMENTS) assert.ok(TRACK_PLACEMENTS.includes(p), p);
  const block = stripComments(SOURCE).match(/interface\s+LanguageSwitchDetail\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(block, /name:\s*'language_switch'/);
  assert.match(block, /data:\s*\{\s*page:\s*string;\s*from:\s*string;\s*to:\s*string;\s*placement:\s*LanguageSwitchPlacement\s*\}/);
  assert.match(stripComments(SOURCE), /export type TrackDetail = FormSubmitDetail \| FormErrorDetail \| LanguageSwitchDetail;/);
  // Le rappel `done` vit dans l'enveloppe, hors des interfaces de détail.
  assert.match(stripComments(SOURCE), /export type TrackRequest = TrackDetail & \{ done\?: \(\) => void \};/);
  const details = stripComments(SOURCE).match(/interface\s+\w+Detail\s*\{[\s\S]*?\n\}/g) ?? [];
  assert.equal(details.length, 3);
  for (const d of details) assert.doesNotMatch(d, /\bdone\b/);
});
