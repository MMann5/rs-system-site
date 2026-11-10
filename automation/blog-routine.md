# Consignes de rédaction du blog RS SYSTEM

Ce fichier est lu par la routine hebdomadaire **à chaque exécution**, avant d'écrire quoi que ce soit. Il se suffit : tout ce qu'il faut savoir sur le ton, les interdits, le format et la photo est ici. Il est versionné dans le dépôt : Mike le modifie quand il veut (liste de sujets comprise), la routine suit la version de `main`.

Sources : FR36, NFR10, AD-4, AD-11, AD-12 ; décisions D1, D3, D4, D5 de l'epic 6 ; EXPERIENCE.md › Voice and Tone et › Publication du blog ; DESIGN.md › fiche « Carte de blog ». Le pas à pas d'une exécution (branche, PR, étiquette `blog-auto`, cas d'échec) est dans les instructions de la routine (story 6.4) ; ce fichier fixe **ce qu'on écrit** et **comment on le range**.

## 1. Rôle et cadence

- Rôle : écrire **un article par semaine**, utile à un particulier, un syndic (ועד בית) ou un entrepreneur d'Israël, qui répond à une vraie question sur un des services de RS SYSTEM, puis l'envoyer en PR. L'article est publié seul au bout de 48 h si Mike ne pose pas l'étiquette `hold` : **personne ne le relira forcément**. Il doit donc être juste, prudent et prêt à paraître tel quel.
- Cadence (D4) : chaque **dimanche à 7 h, heure d'Israël** (`Asia/Jerusalem`).
- Date de publication (`date` de `meta.yaml`) : **date d'exécution + 2 jours** (le mardi), au format ISO `AAAA-MM-JJ`, calculée dans le fuseau `Asia/Jerusalem`.
- Un seul article par exécution, toujours dans les **4 langues** (`he`, `en`, `ru`, `fr`). Sans ses 4 fichiers `.md`, le build échoue : un article incomplet n'est jamais publié.
- Jamais de push sur `main`. Jamais de modification hors du dossier de l'article et de sa photo.

## 2. Ton (recopié d'EXPERIENCE.md › Voice and Tone)

Un technicien qui explique, pas une agence qui vend. Phrases courtes, souvent deux par titre, point final.

| À faire | À éviter |
|---|---|
| « רואים הכול. ישנים בשקט. » | « La solution de sécurité intelligente n°1 pour votre maison » suivi d'un point d'exclamation |
| « מצלמה על העגורן. » / « רואים את האתר מתקדם. בלי לנסוע. » | Jargon produit (résolution, PoE, NVR) dans les titres. |
| Liens à verbe : « התקשרו › », « וואטסאפ › », « הצעת מחיר › », « תיאום סיור טכני › ». Seule exception : « לפרטים › » (« voir le détail »), lien standard vers la page d'un service. | « En savoir plus », « Cliquez ici », « Commencer ». |
| « Votre localité n'y est pas ? Appelez › » | Message d'impasse sans action. |
| Le numéro écrit en entier : 050-956-5669 | « Contactez-nous » sans numéro. |
| Dire ce qu'on ne sait pas, ou ne pas en parler. | Inventer une note, un chiffre ou un client. |

Dans un article, concrètement :

- Phrases courtes, vocabulaire de tous les jours. Un terme technique s'explique en une phrase la première fois.
- On conseille, on ne vend pas : ce qui compte pour décider, où poser, ce qu'on vérifie, quand un technicien devient utile.
- La dernière section peut dire quand faire appel à un technicien et renvoyer vers la page du service. L'encart contact (téléphone, WhatsApp) est ajouté par le site après l'article : ne pas écrire de numéro ni de bloc « contactez-nous » dans le texte.
- Le texte doit rester vrai pour toutes les marques et tous les logements : pas de nom de marque, de modèle ni de prix.

## 3. Interdits

Le lint éditorial (section 9) bloque la PR sur les cinq premiers points. Les autres sont des consignes : personne ne les vérifie automatiquement, la routine en est seule responsable.

1. **Aucun emoji**, nulle part (titre, chapeau, `alt`, corps, `meta.yaml`), drapeaux compris.
2. **Aucun point d'exclamation**, sous aucune forme (`!`, `！`, `‼`, `¡`). Une phrase forte se termine par un point.
3. **Ne jamais citer IDS ni Maagal**, dans aucune langue ni graphie : `IDS`, `I.D.S`, `איי די אס`, `ИДС`, `Maagal`, `Ma'agal`, `Магал`, `Маагал`… En hébreu, le mot **« מעגל » est bloqué comme mot entier**, même au sens de « cercle » ou « circuit » (avec ou sans préfixe : ומעגל, במעגל, למעגל…) : écrire autrement, par exemple « קו חשמל », « חיבור », « טבעת ». Les formes plus longues (מעגלים) passent, mais mieux vaut les éviter aussi. Le blocage ignore la casse : l'acronyme anglais « IDS » (système de détection d'intrusion) et le pluriel « IDs » (identifiants) sont bloqués aussi ; écrire « intrusion detection » / « détection d'intrusion » / « обнаружение вторжений » / « זיהוי חדירות », et « identifiers » / « identifiants » / « идентификаторы » / « מזהים ».
4. **Aucun lien littéral** : un lien interne s'écrit `page:<id>` (section 5) ; la routine écrit un lien externe en `https://` uniquement. Le lint tolère aussi `http://`, `mailto:` et `#ancre`, et refuse tout le reste (`/he/…`, `cameras`, `./…`, `tel:`, `wa.me`).
5. **Aucun placeholder** dans un article (D3) : pas de crochets hors d'un lien Markdown (`[e-mail]`, `[ציון]`, `[à compléter]`), pas de `data-placeholder`, pas de `<Placeholder>`. Si une information manque, la phrase est réécrite sans elle.
6. **Aucun superlatif non prouvé** : « le meilleur », « le plus fiable », « n°1 », « unique », « parfait », « garanti »… et leurs équivalents dans les 4 langues.
7. **Rien d'inventé ni de non fourni** (D3) : aucun chiffre, prix, durée, pourcentage, statistique, note, avis, nom de client, témoignage, loi, norme, numéro de règlement ou d'article de loi, décision d'une autorité, sauf si RS SYSTEM l'a fourni avec sa source (aujourd'hui : rien). Une règle générale de bon sens (« un détecteur par chambre ») s'écrit en mots, sans chiffre et sans « la loi impose ». En cas de doute, renvoyer à la notice du fabricant ou au technicien.
8. Pas de nom de marque, de modèle, de prix ni de promotion. Pas de comparaison avec un concurrent.
9. Pas de titre numéroté (`## 1. …`) : la numérotation des sections est ajoutée par le site. Pas de `#` (h1) dans le corps : le titre de la page vient du frontmatter. Pas de tableau (remplacer par une liste). Pas d'image dans le corps. Pas de HTML.

## 4. Catégories

`category` dans `meta.yaml` = **un code de service**, exactement l'un de ceux-ci (`POST_CATEGORIES` de `src/lib/page-schema.ts` : les codes de `src/content/services.yaml` sauf `unsure`). Chaque catégorie a sa page de service, à lier dans l'article :

| Code (`category`) | Service (he · en · ru · fr) | Page à lier |
|---|---|---|
| `cameras` | מצלמות אבטחה · Security cameras · Камеры видеонаблюдения · Caméras de surveillance | `page:cameras` |
| `smoke-detectors` | גלאי עשן · Smoke detectors · Датчики дыма · Détecteurs de fumée | `page:smoke-detectors` |
| `smart-home` | בית חכם · Smart home · Умный дом · Maison connectée | `page:smart-home` |
| `networks` | תקשורת ורשתות · Networks and communications · Сети и связь · Réseaux et communication | `page:networks` |
| `intercom` | אינטרקום · Intercom · Домофон · Interphone | `page:intercom` |
| `crane-cameras` | מצלמות לעגורן / אתר בנייה · Crane and site cameras · Камеры для крана и стройплощадки · Caméras de grue et de chantier | `page:contractors` |

Le libellé de catégorie affiché sur la page est celui du service, posé par le site : ne pas l'écrire dans l'article.

## 5. Liens internes

- Un lien interne s'écrit **toujours** `[texte](page:<id>)`. Le site le remplace au build par la bonne adresse dans la langue de la page. Avec une ancre : `[texte](page:areas#south)`.
- **Au moins un lien vers la page du service de la catégorie** (tableau de la section 4), en général dans la dernière section : « Tous les détails sur la page [caméras de surveillance](page:cameras). »
- Ids de page utilisables : `home`, `cameras`, `smoke-detectors`, `smart-home`, `networks`, `intercom`, `contractors`, `areas`, `about`, `contact`. Un id inconnu fait échouer le build.
- Pas de lien vers un autre article (son id peut changer) ; pas de lien externe sauf nécessité (source officielle fournie par RS SYSTEM, en `https://`).
- Texte du lien : le nom de la page ou une action, jamais « ici » ni « cliquez ».

## 6. Les 4 langues

- Écrire d'abord l'hébreu (langue principale du site), puis **réécrire** l'article en anglais, russe et français : même contenu, mêmes sections, mêmes conseils, mais des phrases naturelles dans chaque langue, **pas une traduction mot à mot**. Les jeux de phrases courtes se réécrivent.
- Tout se traduit : titre, chapeau, titre et description de page, `alt`, corps, **slug**.
- Public : en anglais et en français, des immigrants récents en Israël ; en russe, la communauté russophone d'Israël. Garder les réalités israéliennes (ועד בית → syndic / house committee / домовой комитет), sans les expliquer longuement.
- Le message WhatsApp n'est pas dans l'article (il est posé par le site, toujours en hébreu).
- Slugs (`slugs` de `meta.yaml`) : tirés du titre traduit, **un seul segment**, minuscules, mots séparés par un tiret simple, sans espace, barre oblique, ponctuation ni tiret en début ou fin, en Unicode **NFC** ; en hébreu les lettres hébraïques, en russe le cyrillique (`сколько-датчиков-дыма-нужно`), en anglais et en français le latin sans accents (`combien-de-detecteurs-de-fumee`). Court : 3 à 6 mots. Les 4 slugs doivent être différents de ceux des articles existants.

## 7. Format exact des fichiers

Un article = un dossier `src/content/posts/{id}/` avec **5 fichiers** : `meta.yaml`, `he.md`, `en.md`, `ru.md`, `fr.md`. Plus, sauf pour `smoke-detectors`, une photo dans `src/assets/blog/`.

- `{id}` : identifiant en anglais, kebab (minuscules, chiffres, tirets), court et stable, par exemple `choosing-home-cameras`. C'est aussi le nom du dossier. Il ne doit pas exister déjà dans `src/content/posts/`.
- Les chaînes YAML sont entre apostrophes simples `'…'`. Dans le texte, utiliser l'apostrophe typographique `’` (pas besoin d'échappement) ; une apostrophe droite `'` dans une chaîne doit être doublée (`''`).
- Un commentaire YAML (`# …`) est permis et ignoré par le site et le lint.

### `meta.yaml`

| Champ | Valeur |
|---|---|
| `date` | `'AAAA-MM-JJ'`, date d'exécution + 2 jours (entre apostrophes). |
| `category` | Un code de la section 4. |
| `image` | Nom du fichier de la photo dans `src/assets/blog/` (un seul segment, lettres, chiffres, `.`, `_`, `-`, extension `.jpg`), par exemple `choosing-home-cameras.jpg`. **Absent** pour `smoke-detectors` (D1), obligatoire pour toutes les autres catégories. |
| `slugs` | `he`, `en`, `ru`, `fr` : section 6. |
| `enabled` | `true`. |
| `featured` | Ne pas l'écrire (réservé à Mike). |

Aucun autre champ : le schéma refuse les clés inconnues.

### `{he,en,ru,fr}.md`

Un frontmatter YAML entre deux lignes `---`, puis le corps en Markdown.

| Champ | Valeur |
|---|---|
| `title` | Titre de l'article (le `h1`). Une phrase, sans point final, idéalement moins de 70 caractères. |
| `lede` | Chapeau : une ou deux phrases qui disent ce que le lecteur va savoir. |
| `meta.title` | Exactement « {title} · RS SYSTEM » (point médian `·` entouré d'espaces). |
| `meta.description` | Exactement le même texte que `lede`. |
| `alt` | Description de la photo dans la langue du fichier : ce qu'on voit, en une phrase. **Obligatoire si `meta.yaml` a une `image`, absent sinon** (`smoke-detectors`). |

Corps :

- Un paragraphe d'introduction de deux ou trois phrases, sans titre.
- Puis **4 à 5 sections** `## Titre de section` (sans numéro, la numérotation est ajoutée par le site). `###` permis à l'intérieur d'une section si besoin, jamais `#`.
- Paragraphes courts ; listes à puces `-` permises ; **gras** `**…**` pour le début d'un point de liste.
- Longueur : de 500 à 900 mots en hébreu ; les autres langues suivent.
- Au moins un lien `page:<id>` vers la page du service (section 5).

### Exemple complet (catégorie `cameras`)

`src/content/posts/choosing-home-cameras/meta.yaml` :

```yaml
# Article de la routine hebdomadaire. Photo : https://www.pexels.com/photo/…
date: '2026-11-17'
category: cameras
image: choosing-home-cameras.jpg
slugs:
  he: 'איך-בוחרים-מצלמות-לבית-פרטי'
  en: 'choosing-home-security-cameras'
  ru: 'как-выбрать-камеры-для-дома'
  fr: 'choisir-cameras-maison'
enabled: true
```

`src/content/posts/choosing-home-cameras/he.md` :

```markdown
---
title: 'איך בוחרים מצלמות אבטחה לבית פרטי'
lede: 'לא כמה שיותר מצלמות, אלא המצלמות הנכונות במקומות הנכונים. כך מחליטים מה צריך.'
meta:
  title: 'איך בוחרים מצלמות אבטחה לבית פרטי · RS SYSTEM'
  description: 'לא כמה שיותר מצלמות, אלא המצלמות הנכונות במקומות הנכונים. כך מחליטים מה צריך.'
alt: 'מצלמת אבטחה מעל דלת כניסה של בית פרטי, בשעת ערב.'
---

מצלמה טובה במקום הלא נכון לא תראה כלום. לפני שבוחרים דגם, מחליטים מה רוצים לראות. זה מה שטכנאי שואל בביקור הראשון.

## מה רוצים לראות

מתחילים מהכניסות: הדלת הראשית, השער, החניה. ...

## איפה לשים את המצלמות

...

## לראות גם בלילה

...

## מתי להזמין טכנאי

... כל הפרטים בעמוד [מצלמות אבטחה](page:cameras).
```

`en.md`, `ru.md`, `fr.md` : même structure, texte réécrit dans la langue. Frontmatter attendu :

```markdown
---
title: 'How to choose security cameras for a private house'
lede: 'Not as many cameras as possible, but the right ones in the right places. Here is how to decide what you need.'
meta:
  title: 'How to choose security cameras for a private house · RS SYSTEM'
  description: 'Not as many cameras as possible, but the right ones in the right places. Here is how to decide what you need.'
alt: 'A security camera above the front door of a house, in the evening.'
---
```

```markdown
---
title: 'Как выбрать камеры видеонаблюдения для частного дома'
lede: 'Не как можно больше камер, а нужные камеры в нужных местах. Вот как понять, что вам нужно.'
meta:
  title: 'Как выбрать камеры видеонаблюдения для частного дома · RS SYSTEM'
  description: 'Не как можно больше камер, а нужные камеры в нужных местах. Вот как понять, что вам нужно.'
alt: 'Камера видеонаблюдения над входной дверью частного дома, вечером.'
---
```

```markdown
---
title: 'Choisir ses caméras de surveillance pour une maison'
lede: 'Pas le plus de caméras possible, mais les bonnes, aux bons endroits. Voici comment décider de ce qu’il vous faut.'
meta:
  title: 'Choisir ses caméras de surveillance pour une maison · RS SYSTEM'
  description: 'Pas le plus de caméras possible, mais les bonnes, aux bons endroits. Voici comment décider de ce qu’il vous faut.'
alt: 'Une caméra de surveillance au-dessus de la porte d’entrée d’une maison, le soir.'
---
```

Les `...` de l'exemple sont à remplacer par du vrai texte : ils ne doivent jamais rester dans un article. Pour un article `smoke-detectors`, voir l'article réel `src/content/posts/how-many-smoke-detectors/` (sans `image` ni `alt`).

## 8. Photo (catégories autres que `smoke-detectors`)

- **`smoke-detectors` : jamais de photo** (D1). Pas de champ `image`, pas d'`alt`, aucune recherche Pexels : le site affiche le détecteur dessiné à la place.
- Toutes les autres catégories : **une photo Pexels**, enregistrée dans **`src/assets/blog/{id}.jpg`** (le même nom que le champ `image`). Jamais dans `public/`, jamais d'URL distante dans l'article.
- Accès réseau permis : `api.pexels.com` (recherche) et `images.pexels.com` (téléchargement) uniquement. La clé est lue dans la variable d'environnement **`PEXELS_API_KEY`** (en-tête `Authorization` de l'API). Elle n'est **jamais** écrite dans un fichier, un commit, un journal, la PR ni un commentaire. Si la variable est absente ou si Pexels ne répond pas, l'exécution échoue (aucun article sans photo, aucun repli sur une autre source).
- Choix de la photo (DESIGN.md › fiche « Carte de blog » et « Photo d'article ») :
  - elle montre **le sujet de l'article** : l'objet réel, **installé** (une caméra au mur, un interphone à l'entrée d'un immeuble, une baie réseau, un interrupteur connecté, une grue sur un chantier) ;
  - **nuit ou crépuscule** de préférence, lumière d'éclairage réel, cohérent avec l'univers du site ;
  - **recadrable en 3:2** (carte de blog) **et en 16:9** (en-tête de l'article) : sujet près du centre, marge autour, photo **horizontale** ;
  - **aucune personne reconnaissable** (visage, plaque, nom), **aucun texte** lisible dans l'image (pas de logo, marque, panneau, écran avec texte) ;
  - pas d'illustration, de rendu 3D, de montage ni de photo d'archive sur fond blanc.
- Fichier : **JPEG, au moins 1920 px de large** (télécharger la taille originale, ou `large2x` si elle atteint 1920 px). Le site en tire lui-même les formats AVIF, WebP et JPEG et les tailles (carte de blog ≤ 60 Ko, photo d'article ≤ 180 Ko).
- Crédit : **non requis** par la licence Pexels, et non affiché. L'adresse de la page Pexels de la photo peut être notée en commentaire dans `meta.yaml` (`# Photo : https://www.pexels.com/photo/…`).
- `alt` : décrit ce que montre la photo, dans chaque langue (« Une caméra de surveillance au-dessus d’une porte d’entrée, la nuit. »), sans « photo de » ni « image de ».

## 9. Ce que la CI bloque

La PR passe par `ci.yml` (contrôle `ci`, exigé pour fusionner). Elle est **rouge**, donc jamais publiée, si :

- **Lint éditorial** (`scripts/checks/editorial.mjs`, dans `npm run lint`) sur `src/content/posts/**` (`meta.yaml` et les 4 `.md`, texte publié, commentaires ignorés) : emoji ; point d'exclamation ; IDS ou Maagal dans toute langue ou graphie (dont « מעגל ») ; lien qui n'est ni `page:<id>`, ni `https://`, `http://`, `mailto:`, `#ancre` ; placeholder (`data-placeholder`, `<Placeholder`, crochet hors lien Markdown). Le message donne `fichier:ligne` et la règle.
- **Schéma** (`npm run check`, `npm run lint` › `completeness`) : champ manquant ou inconnu, `date` invalide, `category` hors liste, `image` présente pour `smoke-detectors` ou absente ailleurs, photo absente de `src/assets/blog/`, `alt` manquant ou en trop, un des 4 `.md` manquant, corps vide, slug invalide ou déjà pris.
- **Build** (`npm run build`) : lien `page:<id>` vers un id inconnu, lien refusé.
- **Tests** (`npm test`) et **portes de `dist/`** (`npm run check:dist`) : liens internes, budget JS, et sur une PR `blog-auto`, un placeholder dans l'`<article>` d'une page (D2).

Les placeholders partagés du site (e-mail du footer, À propos…) ne bloquent pas une PR `blog-auto` : ils ne font qu'avertir.

## 10. Vérification locale avant d'ouvrir la PR

Dans cet ordre, toutes doivent réussir :

1. `npm run check` : 0 erreur.
2. `npm run lint` : tous les contrôles OK, dont `editorial : OK`.
3. `npm test` : tous les tests passent.
4. `npm run build` : succès.
5. `BLOG_AUTO=true npm run check:dist` : `placeholders` sans échec (portes de `dist/`, comme en CI).

En cas d'échec, corriger l'article (jamais le contrôle, le test ni le schéma) et relancer les cinq commandes. Puis relire une dernière fois :

- [ ] 5 fichiers dans `src/content/posts/{id}/` (+ la photo dans `src/assets/blog/` sauf `smoke-detectors`), rien d'autre de modifié ;
- [ ] `date` = exécution + 2 jours ; `category` = le code du sujet ; `enabled: true` ;
- [ ] dans chaque langue : `meta.title` = « {title} · RS SYSTEM », `meta.description` = `lede`, `alt` traduit (si photo) ;
- [ ] 4 à 5 sections `## ` sans numéro, pas de `#` ;
- [ ] au moins un lien `page:<id>` vers la page du service ;
- [ ] aucun chiffre, nom, loi, norme ou statistique inventé ; aucun superlatif ;
- [ ] les 4 langues disent la même chose, chacune dans des phrases naturelles.

## 11. Choix du sujet (D5)

La routine prend **le premier sujet de la liste qui n'est pas encore traité**. Un sujet est traité si le dossier `src/content/posts/{id}/` de son id existe déjà, si un article existant (`src/content/posts/*/he.md`, titre et chapeau) répond déjà à la même question, ou si **une PR `blog-auto` encore ouverte** (branche `blog/…`, en attente, retenue par `hold` ou rouge) porte déjà ce sujet : vérifier avec `gh pr list --label blog-auto --state open` (titre de la PR et fichiers de la branche). Sinon, une PR retenue ferait reprendre le même sujet le dimanche suivant. L'article prend l'id et la catégorie du sujet. Le titre de la liste est une proposition : la routine peut le reformuler dans le ton, en gardant la question.

Si la liste est épuisée, la routine choisit seule un sujet pas encore traité : une vraie question de particulier, de syndic ou d'entrepreneur, sur un des services, en alternant les catégories (pas deux fois de suite la même que l'article le plus récent si possible).

Liste ordonnée (Mike la modifie quand il veut ; d'abord les titres du canvas, dans cet ordre, puis les sujets proposés) :

| # | Sujet (he) | Catégorie | id |
|---|---|---|---|
| 1 | איך בוחרים מצלמות אבטחה לבית פרטי | `cameras` | `choosing-home-cameras` |
| 2 | מתי כדאי להחליף אינטרקום בבניין | `intercom` | `when-to-replace-building-intercom` |
| 3 | מצלמה על העגורן: מה זה נותן לקבלן | `crane-cameras` | `crane-camera-for-contractors` |
| 4 | בית חכם בלי לשבור קירות | `smart-home` | `smart-home-without-breaking-walls` |
| 5 | רשת ביתית שלא נופלת: מה חשוב לדעת | `networks` | `home-network-that-stays-up` |
| 6 | מה לבדוק לפני שמזמינים התקנה | `cameras` | `before-ordering-installation` |
| 7 | גלאי עשן מצפצף בלילה: מה עושים | `smoke-detectors` | `smoke-detector-beeping-at-night` |
| 8 | ועד בית ומצלמות בלובי: מה כדאי לדעת לפני | `cameras` | `building-lobby-cameras` |
| 9 | האינטרנט לא מגיע לכל החדרים: למה ומה עושים | `networks` | `wifi-not-reaching-every-room` |
| 10 | אינטרקום עם מסך לבית פרטי: על מה לחשוב | `intercom` | `video-intercom-private-house` |
| 11 | תאורה ותריסים מהטלפון: מאיפה מתחילים | `smart-home` | `lights-and-shutters-from-phone` |
| 12 | מצלמות באתר בנייה בלילה: מה רואים ומה לא | `crane-cameras` | `construction-site-cameras-at-night` |
| 13 | איפה נשמרות ההקלטות של המצלמות, ומי רואה אותן | `cameras` | `where-camera-recordings-are-stored` |
| 14 | גלאי עשן בבית עם כמה קומות: איך הם עובדים יחד | `smoke-detectors` | `smoke-detectors-multi-floor-house` |

Les sujets 7 à 14 ont été rédigés en hébreu par l'agent : relecture par un locuteur natif recommandée.
