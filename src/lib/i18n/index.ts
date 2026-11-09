// AD-4 : chaînes d'interface src/i18n/{lang}.json, validées par Zod puis par buildDictionary
// (4 fichiers, mêmes clés). Chargées une fois au build ; t() lève sur une clé inconnue.
import { getCollection } from 'astro:content';
import { buildDictionary } from './core.ts';

const files = await getCollection('i18n');

const dictionary = buildDictionary(files.map(({ id, data }) => ({ id, data })));

export const { t } = dictionary;
