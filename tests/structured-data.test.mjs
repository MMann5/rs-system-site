// Story 7.2 (FR38, D3) : constructeurs purs du JSON-LD (src/lib/structured-data.ts), échappement, cas de la matrice, et
// validateur de schéma de scripts/checks/share.mjs (nœud fautif refusé en nommant la propriété).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { expectedTypes, validateJsonLd } from '../scripts/checks/share.mjs';
import { PHONE_E164 } from '../src/lib/contact/core.ts';
import { absoluteUrl } from '../src/lib/seo.ts';
import {
  article,
  BRAND,
  breadcrumbList,
  businessRef,
  contactPoint,
  jsonLdGraph,
  localBusiness,
  serializeJsonLd,
  service,
} from '../src/lib/structured-data.ts';

const SITE = 'https://rssystem.co.il';
const BUSINESS = { url: '/fr/', logo: '/rs-icon-512.png' };
const ABS_BUSINESS = { url: absoluteUrl('/fr/', SITE), logo: absoluteUrl('/rs-icon-512.png', SITE) };
const graph = (...nodes) => JSON.parse(serializeJsonLd(nodes));

test('PHONE_E164 exporté par src/lib/contact/core.ts = +972509565669 (AD-5)', () => {
  assert.equal(PHONE_E164, '+972509565669');
});

test('LocalBusiness de l\'accueil : nom, téléphone, URL, logo, villes en City ; ni address, ni aggregateRating, ni review (D3)', () => {
  const node = localBusiness({ ...BUSINESS, areaServed: ['Jérusalem', 'Modiin'] });
  assert.deepEqual(node, {
    '@type': 'LocalBusiness',
    name: BRAND,
    telephone: '+972509565669',
    url: '/fr/',
    logo: '/rs-icon-512.png',
    areaServed: [
      { '@type': 'City', name: 'Jérusalem' },
      { '@type': 'City', name: 'Modiin' },
    ],
  });
  for (const prop of ['address', 'aggregateRating', 'review']) assert.ok(!Object.hasOwn(node, prop), prop);
  assert.deepEqual(validateJsonLd(graph(node), 'home'), []);
});

test('Contact : LocalBusiness avec contactPoint', () => {
  const node = localBusiness({ ...BUSINESS, areaServed: ['Ashdod'], contactPoint: true });
  assert.deepEqual(node.contactPoint, contactPoint());
  assert.deepEqual(contactPoint(), {
    '@type': 'ContactPoint',
    telephone: '+972509565669',
    contactType: 'customer service',
  });
  assert.deepEqual(validateJsonLd(graph(node), 'contact'), []);
  // Sans contactPoint, Contact échoue.
  assert.match(validateJsonLd(graph(localBusiness({ ...BUSINESS, areaServed: ['Ashdod'] })), 'contact').join('\n'), /contactPoint/);
});

test('LocalBusiness sans ville : lève', () => {
  assert.throws(() => localBusiness({ ...BUSINESS, areaServed: [] }), /sans ville/);
});

test('ville sans localités (city:modiin) : LocalBusiness areaServed = la ville, fil Zones › Région (#ancre) › Ville', () => {
  const nodes = [
    localBusiness({ ...ABS_BUSINESS, areaServed: ['Modiin'] }),
    breadcrumbList([
      { name: 'Zones', url: absoluteUrl('/fr/zones/', SITE) },
      { name: 'Centre et Shfela', url: absoluteUrl('/fr/zones/#center-shfela', SITE) },
      { name: 'Modiin', url: absoluteUrl('/fr/zones/modiin/', SITE) },
    ]),
  ];
  const data = graph(...nodes);
  assert.deepEqual(data['@graph'][0].areaServed, [{ '@type': 'City', name: 'Modiin' }]);
  assert.deepEqual(data['@graph'][1].itemListElement, [
    { '@type': 'ListItem', position: 1, name: 'Zones', item: 'https://rssystem.co.il/fr/zones/' },
    { '@type': 'ListItem', position: 2, name: 'Centre et Shfela', item: 'https://rssystem.co.il/fr/zones/#center-shfela' },
    { '@type': 'ListItem', position: 3, name: 'Modiin', item: 'https://rssystem.co.il/fr/zones/modiin/' },
  ]);
  assert.deepEqual(validateJsonLd(data, 'city:modiin'), []);
});

test('Service : provider = l\'entreprise (sans zone), areaServed ; fil Accueil › Service', () => {
  const node = service({ name: 'Caméras de surveillance', description: 'Voyez…', url: '/fr/cameras/', provider: BUSINESS, areaServed: ['Ariel'] });
  assert.deepEqual(node.provider, businessRef(BUSINESS));
  assert.ok(!Object.hasOwn(node.provider, 'areaServed'));
  const crumbs = breadcrumbList([{ name: 'Accueil', url: '/fr/' }, { name: 'Caméras de surveillance', url: '/fr/cameras/' }]);
  assert.deepEqual(validateJsonLd(graph(node, crumbs), 'cameras'), []);
  // Entrepreneurs : Service seul (pas de fil).
  assert.deepEqual(validateJsonLd(graph(node), 'contractors'), []);
  assert.match(validateJsonLd(graph(node, crumbs), 'contractors').join('\n'), /types \[Service, BreadcrumbList\] au lieu de \[Service\]/);
});

test('article sans photo (post:how-many-smoke-detectors) : Article.image = la carte détecteur, auteur et éditeur = l\'entreprise', () => {
  const image = absoluteUrl('/og/detector.png', SITE);
  const node = article({
    headline: 'Combien de détecteurs',
    description: 'Un par chambre.',
    datePublished: '2026-11-10',
    image,
    inLanguage: 'fr',
    url: absoluteUrl('/fr/blog/combien-de-detecteurs-de-fumee/', SITE),
    business: ABS_BUSINESS,
  });
  assert.equal(node.image, 'https://rssystem.co.il/og/detector.png');
  assert.deepEqual(node.author, businessRef(ABS_BUSINESS));
  assert.deepEqual(node.publisher, businessRef(ABS_BUSINESS));
  const crumbs = breadcrumbList([{ name: 'Blog', url: '/fr/blog/' }, { name: 'Combien de détecteurs', url: '/fr/blog/x/' }]);
  assert.deepEqual(validateJsonLd(graph(node, crumbs), 'post:how-many-smoke-detectors'), []);
});

test('fil d\'Ariane de moins de 2 éléments : lève', () => {
  assert.throws(() => breadcrumbList([{ name: 'Accueil', url: '/fr/' }]), /moins de 2/);
});

test('sérialisation : un seul graphe @context/@graph, « < » échappé, JSON.parse rend le graphe', () => {
  const node = service({ name: '</script><b>', description: 'a < b', url: '/fr/', provider: BUSINESS, areaServed: ['X'] });
  const text = serializeJsonLd([node]);
  assert.ok(!text.includes('<'), text);
  assert.ok(text.includes('\\u003c/script>'));
  assert.deepEqual(JSON.parse(text), jsonLdGraph([node]));
  assert.equal(JSON.parse(text)['@context'], 'https://schema.org');
  assert.equal(JSON.parse(text)['@graph'][0].name, '</script><b>');
});

test('validateur : nœud sans propriété requise, propriété interdite (D3), @type inconnu, mauvais téléphone → refusé en nommant la propriété', () => {
  const base = localBusiness({ ...BUSINESS, areaServed: ['Ofakim'] });
  const { logo: _logo, ...noLogo } = base;
  assert.match(validateJsonLd(graph(noLogo), 'home').join('\n'), /LocalBusiness\) : propriété requise « logo » absente/);
  for (const prop of ['address', 'aggregateRating', 'review']) {
    assert.match(validateJsonLd(graph({ ...base, [prop]: 'x' }), 'home').join('\n'), new RegExp(`propriété interdite « ${prop} »`));
  }
  // Interdite aussi dans un nœud imbriqué.
  const nested = service({ name: 'S', description: 'D', url: '/', provider: BUSINESS, areaServed: ['Y'] });
  nested.provider.review = { '@type': 'Review' };
  assert.match(validateJsonLd(graph(nested), 'contractors').join('\n'), /provider \(LocalBusiness\) : propriété interdite « review »/);
  assert.match(validateJsonLd(graph({ ...base, '@type': 'Organization' }), 'home').join('\n'), /@type inconnu « Organization »/);
  assert.match(validateJsonLd(graph({ ...base, telephone: '050-956-5669' }), 'home').join('\n'), /telephone/);
  // Accueil sans areaServed : requis au premier niveau.
  const { areaServed: _a, ...noArea } = base;
  assert.match(validateJsonLd(graph(noArea), 'home').join('\n'), /« areaServed » absente/);
  // Enveloppe absente.
  assert.match(validateJsonLd([base], 'home').join('\n'), /@context/);
});

test('types attendus par page (EXPERIENCE.md › Référencement) : aucun pour Zones, Blog, À propos, légales, 404', () => {
  assert.deepEqual(expectedTypes('home'), ['LocalBusiness']);
  assert.deepEqual(expectedTypes('contact'), ['LocalBusiness']);
  for (const id of ['cameras', 'smoke-detectors', 'smart-home', 'networks', 'intercom']) assert.deepEqual(expectedTypes(id), ['Service', 'BreadcrumbList'], id);
  assert.deepEqual(expectedTypes('contractors'), ['Service']);
  assert.deepEqual(expectedTypes('city:modiin'), ['LocalBusiness', 'BreadcrumbList']);
  assert.deepEqual(expectedTypes('post:how-many-smoke-detectors'), ['Article', 'BreadcrumbList']);
  for (const id of ['areas', 'blog', 'blog-page:2', 'about', 'accessibility', 'privacy', 'not-found']) assert.deepEqual(expectedTypes(id), [], id);
});

test('meta description de l\'accueil ≤ 155 caractères dans chaque langue (home.yaml)', () => {
  const home = parse(readFileSync(new URL('../src/content/pages/home.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(home.meta.description), ['he', 'en', 'ru', 'fr']);
  for (const [lang, text] of Object.entries(home.meta.description)) {
    assert.ok([...text].length <= 155, `${lang} : ${[...text].length} caractères`);
    // Services + zone + numéro (EXPERIENCE.md › Référencement).
    assert.ok(text.includes('050-956-5669'), `${lang} : numéro`);
  }
});
