// FR41, AD-4, décision D2 : preuve Midrag lue dans src/content/proof.yaml (collection `proof`).
// Entrée absente = objet vide : la preuve est masquée, jamais inventée.
import { getCollection } from 'astro:content';
import { toProof, type Proof } from './band.ts';

const entries = await getCollection('proof');

/** Note Midrag et nombre d'avis, chacun seulement s'il est fourni. */
export function midragProof(): Proof {
  return toProof(entries.find(({ id }) => id === 'midrag')?.data);
}
