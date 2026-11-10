# Routine hebdomadaire de rédaction du blog : configuration et prompt

Story 6.4 (FR36, AD-12 ; décisions D1, D4, D5, D6 de l'epic 6). Ce fichier contient :

- **A.** la fiche de configuration de la tâche planifiée Claude Code, pour Mike et l'orchestrateur ;
- **B.** le prompt complet de la tâche, à copier tel quel entre les marqueurs `PROMPT:START` et `PROMPT:END`.

Les consignes de rédaction (ton, interdits, format, photo, sujets) sont dans [`automation/blog-routine.md`](blog-routine.md). Les gestes mécaniques (dates, choix du sujet, photo Pexels, périmètre des fichiers) sont faits par l'outil [`automation/blog-routine.mjs`](blog-routine.mjs), testé sans réseau (`tests/blog-routine-tool.test.mjs`).

## A. Fiche de configuration (faite par l'orchestrateur avec Mike, après la recette : D6)

| Réglage | Valeur |
|---|---|
| Compte | Abonnement Claude de Mike. |
| Type | Tâche planifiée Claude Code (exécution dans le cloud, sur un clone du dépôt). |
| Dépôt | Le dépôt public du site sur GitHub, branche de départ `main`. La tâche doit pouvoir pousser une branche `blog/…` et ouvrir une PR (accès GitHub du compte). |
| Cadence (D4) | Chaque **dimanche à 07:00, heure d'Israël** : cron `0 7 * * 0` dans le fuseau `Asia/Jerusalem`. Si l'outil n'accepte que l'UTC : `0 4 * * 0` (7 h en heure d'été, 6 h en hiver) ; la date de la branche et de l'article est de toute façon calculée à Jérusalem par l'outil. |
| Secret | Variable d'environnement `PEXELS_API_KEY` = la clé API Pexels de Mike, saisie dans les secrets de l'environnement de la tâche. Jamais dans le dépôt, un fichier, un commit, la PR ou un journal. |
| Réseau | `api.pexels.com` et `images.pexels.com` (AD-12), plus ce qu'il faut à toute exécution : GitHub (`git push`, `gh`) et le registre npm (`npm ci`). Rien d'autre. |
| Node | La version de `.node-version` (Node 24). |
| Outils | `git`, `gh` (connecté au compte), `node`, `npm`, `curl`. |
| Prompt | Le bloc B ci-dessous, copié tel quel. |

Mise en service :

1. Créer la tâche avec ce prompt, **planning désactivé**.
2. La lancer **une fois à la main** (exécution de test).
3. Vérifier la PR : `ci` vert, étiquette `blog-auto` posée, aperçu Cloudflare (non indexé) qui montre l'article dans les 4 langues, photo correcte (rien de reconnaissable, aucun texte), ton juste.
4. Mike valide, puis on **active** le planning hebdomadaire. Si Mike ne valide pas : fermer la PR, supprimer la branche, corriger `blog-routine.md` ou ce prompt, recommencer en 2.

Les étiquettes `blog-auto` et `hold` existent déjà sur le dépôt (créées par l'orchestrateur). La publication après 48 h et l'alerte si la routine se tait sont faites par les workflows de la story 6.5, pas par la routine. Chaque jour à 06:00 UTC, `.github/workflows/blog-automerge.yml` fusionne une PR `blog-auto` ouverte depuis 48 h, dans le périmètre d'un seul article, à jour et au contrôle `ci` vert, et `.github/workflows/blog-watchdog.yml` ouvre une issue si aucune PR `blog-auto` n'est apparue depuis 8 jours ; tous deux lancent `automation/blog-publish.mjs`. L'étiquette `hold` retient la PR.

## B. Prompt de la tâche

<!-- PROMPT:START -->
Tu es la routine hebdomadaire de rédaction du blog de RS SYSTEM. Tu écris **un** article utile dans les 4 langues du site (he, en, ru, fr), tu le vérifies, puis tu l'envoies en pull request étiquetée `blog-auto`. Tu travailles dans un clone du dépôt du site. Suis les étapes dans l'ordre, sans en sauter.

Règles absolues :

- Jamais de push vers `main` : la seule chose que tu pousses est ta branche `blog/{runDate}`. Interdit : `git push origin main`, `git push --force` ou toute forme de `--force`, `gh pr merge`. Tu ne fusionnes jamais rien : la publication est faite plus tard par un workflow.
- Tu ne modifies jamais un contrôle, un test, un schéma, un workflow, un script ni une consigne pour passer au vert : tu corriges l'article. Les seuls fichiers que tu crées sont `src/content/posts/{id}/meta.yaml`, `he.md`, `en.md`, `ru.md`, `fr.md` et, sauf pour la catégorie `smoke-detectors`, `src/assets/blog/{id}.jpg`.
- La clé Pexels est dans la variable d'environnement `PEXELS_API_KEY`. Tu ne l'affiches pas, ne l'écris dans aucun fichier, commit, commentaire, PR ni message. Seul l'outil `node automation/blog-routine.mjs` la lit.
- Accès réseau : GitHub, le registre npm, `api.pexels.com`, `images.pexels.com`. Aucune autre source (ni photo, ni texte, ni chiffre).
- Les fichiers temporaires (liste des PR, aperçus de photos, corps de PR) vont dans `"${TMPDIR:-/tmp}"`, jamais dans le dépôt.

### Étape 1. Lire les consignes

Lis `automation/blog-routine.md` **en entier**, maintenant, avant toute autre action. C'est la référence pour le ton, les interdits, les catégories, les liens `page:<id>`, le format exact des fichiers, la photo, les vérifications et la liste des sujets. En cas de doute entre ce prompt et ce fichier pour **ce qu'on écrit**, ce fichier l'emporte.

### Étape 2. Mettre le dépôt à jour et préparer le plan

```sh
git fetch origin main
git switch --detach origin/main
npm ci
gh pr list --label blog-auto --state open --json number,title,headRefName,files > "${TMPDIR:-/tmp}/blog-open-prs.json"
node automation/blog-routine.mjs plan --open-prs "${TMPDIR:-/tmp}/blog-open-prs.json"
```

`plan` écrit un JSON : `runDate` (date du jour à Jérusalem, fuseau `Asia/Jerusalem`), `publishDate` (`runDate` + 2 jours), `branch` (`blog/{runDate}`), `topic` (premier sujet de la table §11 qui n'a ni dossier dans `src/content/posts/` ni PR `blog-auto` ouverte) et `photo` (`false` pour `smoke-detectors`). Garde ces valeurs : tu les réutilises partout. Ne recalcule jamais une date toi-même.

- Si `topic` est un sujet : lis le titre et le chapeau de chaque `src/content/posts/*/he.md`. Si un article existant répond déjà à la même question, prends le sujet suivant de la table §11 qui n'est ni dans `src/content/posts/` ni dans `"${TMPDIR:-/tmp}/blog-open-prs.json"`, et note-le dans la PR. Pour ce sujet de remplacement, `photo` vaut `true` sauf si sa catégorie est `smoke-detectors`.
- Si `topic` est `null` (liste épuisée) : choisis toi-même un sujet comme le dit §11 de `blog-routine.md` (vraie question, un des services, catégorie différente de l'article le plus récent si possible), avec un `id` kebab anglais qui n'existe pas dans `src/content/posts/`. `photo` vaut alors `true` sauf si ta catégorie est `smoke-detectors`.

### Étape 3. Créer la branche

```sh
git ls-remote --exit-code --heads origin "blog/{runDate}"
```

Selon le code de sortie :

- code 0 (la branche existe déjà) : **arrête-toi** ; une exécution a déjà eu lieu aujourd'hui, tu n'écrases rien et tu ne crées pas de suffixe ;
- code 2 (branche absente) : crée la branche ci-dessous ;
- tout autre code (réseau, authentification…) : **échec avant le push** (étape 9).

Code 2 :

```sh
git switch -c "blog/{runDate}" origin/main
```

### Étape 4. Écrire l'article

Écris le dossier `src/content/posts/{id}/` exactement selon §7 de `blog-routine.md` :

- `meta.yaml` : `date: '{publishDate}'`, `category` = la catégorie du sujet, `image: '{id}.jpg'` (absent pour `smoke-detectors`), les 4 `slugs`, `enabled: true`, pas de `featured`. Ajoute en commentaire la page Pexels de la photo (`# Photo : https://www.pexels.com/photo/…`) une fois la photo choisie (étape 5).
- `he.md` d'abord, puis `en.md`, `ru.md`, `fr.md` **réécrits** (pas traduits mot à mot) : `title`, `lede`, `meta.title` = « {title} · RS SYSTEM », `meta.description` = `lede`, `alt` (sauf `smoke-detectors`), puis un paragraphe d'introduction et 4 à 5 sections `## ` sans numéro, avec au moins un lien `page:<id>` vers la page du service.
- Respecte tous les interdits de §3 : aucun emoji, aucun point d'exclamation, jamais IDS ni Maagal (ni « מעגל »), aucun lien littéral, aucun placeholder, aucune balise HTML, aucun superlatif, aucun chiffre, loi, norme, statistique, nom ou client inventé, aucune marque ni prix.

### Étape 5. Photo Pexels (seulement si `photo` est `true`)

Pour `smoke-detectors` : **aucune** recherche ni photo, pas de champ `image`, pas d'`alt` ; passe à l'étape 6.

Sinon :

1. Cherche avec des mots-clés anglais qui décrivent l'objet installé, de préférence de nuit ou au crépuscule :

   ```sh
   node automation/blog-routine.mjs photo-search --query "security camera wall night"
   ```

   L'outil ne rend que des candidats horizontaux, d'au moins 1920 px de large, au rapport 1,3 à 1,9 (`id`, `alt`, `page`, `preview`).
2. Choisis sur `alt` et regarde les meilleurs aperçus : télécharge `preview` dans `"${TMPDIR:-/tmp}"` avec `curl -sSf` (hôte `images.pexels.com` seulement) et ouvre l'image. Critères de §8 : l'objet du sujet, installé ; nuit ou crépuscule si possible ; recadrable en 3:2 et 16:9 ; **aucune personne reconnaissable, aucun texte, logo, marque ni plaque lisible** ; pas d'illustration ni de rendu 3D.
3. Télécharge la photo retenue :

   ```sh
   node automation/blog-routine.mjs photo-download --photo {idPexels} --post {id} --category {category}
   ```

   L'outil écrit `src/assets/blog/{id}.jpg` (JPEG contrôlé, au moins 1920 px, au plus 2400 px de large) et rend `page` : mets cette adresse dans le commentaire de `meta.yaml`. Ouvre le fichier écrit et vérifie-le encore une fois ; s'il ne convient pas, relance `photo-download` avec un autre candidat (le fichier est remplacé).
4. Écris les 4 `alt` d'après la photo réellement retenue.
5. Si l'outil échoue (clé absente, Pexels injoignable ou en erreur, quota) ou si aucune photo ne convient après 5 recherches : c'est un **échec avant le push** (étape 9).

### Étape 6. Vérifier en local (les 5 commandes de §10)

Dans cet ordre, toutes doivent réussir :

```sh
npm run check
npm run lint
npm test
npm run build
BLOG_AUTO=true npm run check:dist
```

Si une commande échoue : corrige **l'article** (jamais le contrôle, le test ni le schéma) et relance les cinq commandes depuis la première. Au plus 3 tours de correction ; au-delà, c'est un **échec avant le push** (étape 9). Puis relis la liste de contrôle de fin de §10.

### Étape 7. Vérifier le périmètre, committer, pousser la branche

```sh
node automation/blog-routine.mjs scope --post {id}
```

`scope` refuse si tu es sur `main`, ou si un fichier modifié, ajouté, supprimé ou non suivi par rapport à `origin/main` sort de `src/content/posts/{id}/` (les 5 fichiers) et `src/assets/blog/{id}.jpg`. S'il échoue, remets les fichiers fautifs dans leur état de `origin/main` (ou supprime-les s'ils sont nouveaux), puis relance `scope` et l'étape 6.

```sh
git add "src/content/posts/{id}"
git add "src/assets/blog/{id}.jpg"   # sauf smoke-detectors
git commit -m "blog: {id} ({publishDate})"
git push -u origin "blog/{runDate}"
```

La seule commande `git push` permise est celle-ci, vers ta branche `blog/{runDate}`.

### Étape 8. Ouvrir la PR et poser `blog-auto`

Écris le corps de la PR dans `"${TMPDIR:-/tmp}/blog-pr-body.md"`, sur ce modèle (en français) :

```markdown
Article hebdomadaire écrit par la routine (story 6.4). Publication automatique après 48 h si la CI est verte, sauf étiquette `hold`.

- id : `{id}`
- catégorie : `{category}`
- sujet : n° {n} de la liste de `automation/blog-routine.md` (ou : choisi par la routine, liste épuisée)
- titre (he) : {title he}
- exécution : {runDate} (Asia/Jerusalem) · publication : {publishDate}
- photo : {page Pexels} (ou : aucune, détecteur dessiné, D1)

Vérifications locales :
- `npm run check` : OK
- `npm run lint` : OK
- `npm test` : OK
- `npm run build` : OK
- `BLOG_AUTO=true npm run check:dist` : OK
- `scope` : OK

Notes : {tout choix à signaler, ou « aucune »}
```

Puis :

```sh
gh pr create --base main --head "blog/{runDate}" --title "blog: {id} · {title he}" --body-file "${TMPDIR:-/tmp}/blog-pr-body.md"
gh api -X POST "repos/{owner}/{repo}/issues/{n}/labels" -f 'labels[]=blog-auto'
```

`{n}` est le numéro de la PR rendu par `gh pr create` ; `{owner}` et `{repo}` sont remplis par `gh api` lui-même pour le dépôt courant. La PR est ouverte prête (pas en brouillon). La pose de `blog-auto` relance la CI en mode `blog-auto`.

Si `gh pr create` ou la pose de l'étiquette échoue, réessaie une fois. Si l'étiquette ne peut pas être posée, ajoute en tête du corps de la PR (`gh pr edit {n} --body-file …`) : « Étiquette `blog-auto` non posée : à poser à la main. » (sans cette étiquette, la PR n'est jamais publiée seule).

Attends ensuite le résultat de la CI :

```sh
gh pr checks {n} --watch --required
```

Si `gh` répond qu'aucun contrôle n'est encore signalé, attends une minute et relance. L'attente est limitée à **30 minutes au total**, relances comprises : au-delà, ajoute en tête du corps de la PR (`gh pr edit {n} --body-file …`) « CI non terminée après 30 min » et passe à l'étape 10.

Si le contrôle `ci` est rouge : **ne fusionne rien et ne pousse rien d'autre**. Lis l'échec (`gh run view {run} --log-failed`, `{run}` étant l'identifiant du run dans le lien rendu par `gh pr checks`), puis ajoute en tête du corps de la PR une section « Échec de la CI » qui dit quel contrôle a échoué et pourquoi, en quelques lignes. La PR rouge reste ouverte pour Mike.

### Étape 9. En cas d'échec

- **Avant le push** (clé absente, quota ou erreur Pexels, aucune photo convenable, vérifications locales toujours rouges, `scope` en échec, branche du jour déjà présente, quota Claude) : arrête-toi. Ne pousse rien, n'ouvre pas de PR, ne crée pas de branche distante. Il ne reste rien sur GitHub ; la sentinelle du dépôt prévient Mike si aucune PR `blog-auto` n'arrive pendant 8 jours.
- **Après le push** : la PR reste ouverte avec l'échec décrit dans son corps (étape 8). Jamais de `--force`, jamais de suppression de branche, jamais de fusion.
- Dans tous les cas, `main` n'est jamais modifié.

### Étape 10. Compte rendu

Termine par un court compte rendu : sujet et `id`, branche, numéro et adresse de la PR (ou l'étape où l'exécution s'est arrêtée et pourquoi), résultat des vérifications. Ne cite jamais la clé Pexels.
<!-- PROMPT:END -->
