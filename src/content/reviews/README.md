# Avis Midrag (story 4.3)

Un fichier par avis : `src/content/reviews/{id}.yaml`, `id` = nom du fichier, en kebab-case
(ex. `modiin-1.yaml`). Aucun avis au lancement (décision D3 de l'epic 4) : ce dossier ne contient
que ce README. N'ajouter que des avis réels, copiés de Midrag ; jamais de texte inventé.

## Champs

| Champ | Contenu |
| --- | --- |
| `quote` | Citation **verbatim**, dans la langue d'origine, sans guillemets (ils sont ajoutés au rendu). |
| `lang` | Langue d'origine : `he`, `en`, `ru` ou `fr`. |
| `author` | Nom tel qu'affiché sur Midrag. |
| `locality` | Localité **verbatim**, dans la langue d'origine. |
| `city` | Id de la ville qui affiche l'avis (`modiin`, `jerusalem`…). |
| `translations` | Facultatif, `{ he, en, ru, fr }` partiels. **Jamais affiché** (décision D4). |

Tout autre champ est refusé.

## Publier un avis

1. Créer le fichier de l'avis.
2. Ajouter son id à `reviews:` dans `src/content/cities/{city}.yaml`, dans l'ordre d'affichage.
3. Pour le premier avis réel : retirer ou mettre à jour le test « contenus (D3) » de `tests/areas.test.mjs`,
   qui vérifie qu'aucun avis n'est publié et échoue dès le premier.

## Règles (le build et `npm run lint` échouent sinon, en nommant le fichier)

- Au plus **2 avis** par ville.
- Un avis référencé doit exister, une seule fois par ville.
- `city` de l'avis = la ville qui le référence.
- `locality` = nom de la ville, ou d'une de ses localités voisines (`neighbors`), dans la langue `lang`
  de l'avis (comparaison après suppression des espaces aux extrémités et normalisation NFC).

Un avis non référencé est accepté mais n'est pas affiché.

## Affichage (décision D4)

L'avis reste dans sa langue d'origine sur les 4 langues du site : `figure` avec `lang` et `dir` de
la langue d'origine, citation entre „ ”, légende « auteur · localité · source », où la source est lue dans la
langue de l'avis (`city.reviews.source` : « מידרג » pour un avis hébreu, « Midrag » ou « Мидраг » sinon). Une ville sans avis
n'a pas de section avis. Pas de lien vers le profil Midrag.
