# Listo — kit de design (HTML/CSS natifs)

Maquettes complètes : dans le canevas Design « Listo — maquettes ». Ce dossier contient ce qu'il faut pour les reprendre en code, sans framework ni bibliothèque d'icônes.

| Fichier | Rôle |
|---|---|
| `listo.css` | Variables de thème (clair, sombre, auto) et tous les composants. Les sections 1 à 16 (dont 16.5, zone des articles cochés) sont à reprendre telles quelles ; la section 17 (« Présentation des maquettes ») ne sert qu'aux planches et peut être supprimée. |
| `icons-sprite.html` | Sprite SVG de 74 icônes à coller une fois au début du `<body>`. Utilisation : `<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>`. |
| `maquettes/` | Captures PNG de tous les écrans et variantes, en clair et en sombre (`liste-1-clair.png`, `reglages-3-sombre.png`, etc.). Référence visuelle à comparer au rendu. |
| `recherche/` | Maquettes de la recherche : `PROMPT.md` et `README.md` (écrans, états, comportements), `captures/` (20 PNG, clair et sombre), balisage de référence et règles d'origine. Gardé hors de l'image Docker, comme `maquettes/`. |
| `components.html` | Référence : chaque composant en HTML, en thème clair puis sombre. Le balisage est celui des écrans. |
| `icones/icon.svg`, `icones/icon-maskable.svg` | Icône 512 × 512, fond plein cadre, logo entièrement dans la zone de sécurité de 80 %. |
| `icones/icon-512.png`, `icones/icon-192.png` | Exports PNG pour le manifeste PWA. |
| `icones/i-disquette.svg` | L'icône « Enregistrer » de la fiche d'un article (disquette), en fichier SVG séparé, identique à celle du sprite. |
| `icones/listes/` | Les 31 icônes ajoutées pour l'icône d'une liste, une par fichier SVG (24 × 24, trait de 2, `currentColor`), identiques à celles du sprite. |

## Thèmes

- `<html data-theme="light">`, `"dark"` ou `"auto"` (suit `prefers-color-scheme`). Sans attribut, c'est le thème clair.
- Choix de l'utilisateur : le réglage « Clair / Sombre / Auto » écrit simplement la valeur de `data-theme` sur `<html>`.
- Palette de départ respectée, avec 8 valeurs affinées pour le contraste AA (marquées dans la planche « Variables de thème ») : texte sur accent en sombre `#08101D`, danger clair `#C73A3A`, textes d'accent, de succès et de danger, bordure des champs.

## Variables principales

Couleurs : `--color-bg`, `--color-surface`, `--color-text`, `--color-text-2`, `--color-border`, `--color-control`, `--color-accent`, `--color-accent-soft`, `--color-accent-ink`, `--color-on-accent`, `--color-success(-ink)`, `--color-danger(-ink|-soft)`, `--color-inverse-*`.
Texte : `--text-sm` 14, `--text-base` 16, `--text-item` 17, `--text-lg` 18, `--text-sheet` 20, `--text-title` 22, `--text-display` 28.
Espacement : `--space-0` à `--space-6` (4, 8, 16, 24, 32, 40, 48). Rayons : `--radius-sm` 12, `--radius-md` 16, `--radius-lg` 24, `--radius-pill`.
Zones tactiles : `--tap-min` 44, `--tap` 48. Mouvement : `--dur-fast` 160 ms (neutralisé par `prefers-reduced-motion`). Contenu ordinateur : `--content-max` 720 px.

## Composants et classes

- Page : `.app` (conteneur racine), `.topbar`, `.statusbar`, `.scroll`, `.body`, `.footer`.
- Synchro : `.sync` + `.sync--ok | --busy | --off` (icône + texte, toujours visible sous la barre de titre).
- Boutons : `.btn` + `--primary | --secondary | --danger | --danger-outline | --ghost`, `--sm`, `--block`, `--icon` ; `.icon-btn` ; `.fab`.
- Listes : `.list-card` (+ `.is-selected`), `.avatars` / `.avatar`, `.chip`.
- Articles : `.aisle` (en-tête `position: sticky`, `.is-stuck` = ombre quand collé), `.item` (+ `.is-done`), `.check` avec `aria-pressed`, `.item__body`, `.item__name`, `.item__note`, `.item__qty`.
- Ajout : `.addbar`, `.addbar__field`, `.addbar__input`, `.suggest` / `.suggest__item` (+ `--new`).
- Surcouches : `.scrim` + `.sheet` (feuille du bas), `.dialog` (confirmation), `.menu`, `.toast`.
- Formulaires : `.field`, `.field__label | __hint | __error`, `.input` (+ `--select | --area | --code | --mono`, `aria-invalid="true"`), `.tick-row`, `.radio-row`, `.choice`, `.segmented` (interrupteur de thème), `.switch` (`role="switch"`), `.tabs` / `.tab` (`role="tab"`).
- Réglages et administration : `.group`, `.row`, `.section-title`, `.manage` (+ `.is-off`), `.add-inline`, `.note`, `.codes`, `.qr`.
- Vides : `.empty`.
- Ordinateur : `.shell`, `.shell__side`, `.shell__main`, `.shell__col`. À partir de 1024 px, la colonne des listes apparaît à gauche et le contenu est plafonné à `--content-max`.

## Accessibilité (déjà dans le CSS et le balisage)

- Contraste du texte AA dans les deux thèmes (rapports calculés dans la planche « Variables de thème »).
- Zones tactiles d'au moins 44 px ; la case ronde mesure 30 px mais sa zone cliquable fait 52 × 56 px.
- Un article coché est barré, atténué et porte une coche : jamais la couleur seule.
- Boutons-icônes : `aria-label` obligatoire. Indicateur de synchro : un vrai `<button>` (un appui relance la synchronisation) avec `aria-live="polite"` et un nom qui dit l'état et l'action (`aria-label="À jour, synchroniser maintenant"`) ; un simple texte `role="status"` seulement s'il n'est pas cliquable.
- Pas de survol. Les actions secondaires passent par le menu ⋮ (le même bouton sur la liste ouverte et sur chaque carte de « Mes listes »). Un seul geste : glisser une ligne vers la gauche révèle « Supprimer » ; c'est un raccourci, jamais le seul chemin : la poubelle de la fiche de l'article reste la voie complète (lecteurs d'écran, clavier, souris).

## Manifeste PWA (extrait)

```json
{
  "name": "Listo",
  "short_name": "Listo",
  "lang": "fr",
  "display": "standalone",
  "background_color": "#F4F7FB",
  "theme_color": "#2F6FED",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "maskable" }
  ]
}
```

Pour une version maskable en PNG, réutilisez `icones/icon-512.png` : le logo est déjà dans la zone de sécurité et le fond est plein cadre.

## Ajout : photo d'un article, magasin « multi », lien public

Tout est dans la section 16 de `listo.css` (mêmes variables, aucune couleur en dur) et dans la dernière partie de `components.html`. Rien d'existant n'a changé. Aucun style en ligne ni script en ligne dans le balisage fourni.

Nouvelles icônes (sprite) : `i-camera`, `i-image`, `i-link`, `i-link-off`, `i-clock`, `i-layers` (magasin multi), `i-eye-off`. Réutilisées : `i-copy`, `i-lock`, `i-store`, `i-eye`.

Photos de démonstration : `photos/*.svg` (4:3), uniquement pour les maquettes.

### Composants nouveaux

- Photo : `.item__photo` (miniature 48 px dans `.item`, bouton avec `aria-label="Agrandir la photo de …"`), `.photo` (image qui remplit son cadre), `.photo-actions` (rangée de deux boutons, gardée dans le kit ; l'application ne s'en sert plus depuis le bouton unique) ; sans photo, un seul `.btn.btn--secondary.btn--block` « Ajouter une photo » (`#i-camera`), qui ouvre le sélecteur d'images du téléphone, `.photo-block` + `__thumb` + `__actions` (aperçu, « Changer la photo », Retirer), `.lightbox` + `__bar | __title | __stage | __img | __cap | __foot` (photo plein écran, fond sombre dans les deux thèmes), `.sheet--scroll`.
- Multi : `.aisle__name` (icône + nom dans `.aisle`), `.badge-multi`, `.input__value`, `.add-block` (+ `__row`) avec `.segmented` Simple / Multi, `.manage-detail` (+ `__title | __note`) avec `.tick-row` pour les magasins regroupés, `.icon-btn[aria-expanded]`.
- Lien : `.duration` + `__opt` (choix unique, coche quand actif, `disabled` hors ligne), `.duration-custom`, `.link-box` (+ `__url`), `.expiry` (+ `__title | __sub`), `.secret` (+ `__label | __row | __value | __value--masked`).
- Page publique : `.readonly-banner`, `.public-head` (+ `__main | __title | __sub`), `.public-foot`, `.check--static` (case non interactive, `.is-on` quand cochée), `.gate` + `.gate__head` (mot de passe).
- Utilitaires : `.stack--lg`, `.text-sm`, `.body--flush`, `.input[disabled]`.

### Réutilisés tels quels

`.sheet`, `.scrim`, `.dialog`, `.btn` (toutes variantes), `.icon-btn`, `.item`, `.check`, `.aisle` (en-tête collé = magasin), `.field`, `.input`, `.input--select`, `.input--mono`, `.input-wrap`, `.segmented`, `.switch`, `.card`, `.row` (+ `__icon | __body | __title | __sub`), `.radio-row`, `.tick-row`, `.tabs`, `.manage`, `.group`, `.note` (+ `--danger`), `.sync`, `.statusbar`, `.topbar`, `.empty`, `.avatar`, `.list-card`.

### Correspondance des maquettes (`maquettes/`)

| Écran | Fichiers |
|---|---|
| A · Liste avec photos | `liste-photos-1` |
| B · Feuille article (sans photo, avec photo, multi, choix du magasin) | `article-photo-1` à `4` |
| C · Photo plein écran | `photo-plein-ecran-1` |
| D · Liste multi (haut, bas de liste) | `liste-multi-1`, `2` |
| E · Administration, Magasins (ajout, magasin ouvert) | `administration-magasins-1`, `2` |
| F · Liste avec magasin multi (formulaire, choix) | `formulaire-liste-multi-1`, `2` |
| G · Partager par lien (aucun lien, personnalisée, mot de passe affiché, masqué, sans mot de passe, confirmation, hors ligne) | `partage-lien-1` à `7` |
| H · Page publique (rayons, multi par magasin) | `page-publique-1`, `2` |
| I · Mot de passe (saisie, incorrect, trop d'essais) | `page-publique-mot-de-passe-1` à `3` |
| J · Lien expiré ou inexistant | `page-publique-expiree-1` |

Chaque fichier existe en `-clair` et `-sombre`.

### Comportement à respecter

- Lien public : lecture seule, sans compte ; la page n'affiche ni menu ni navigation de l'application. Réponse neutre « Lien expiré ou inexistant » pour un lien expiré, arrêté ou inconnu (même message, sans bouton de connexion).
- Mot de passe du lien : 16 caractères générés par l'application, montrés une seule fois à la création (`.secret`), puis masqués ; « Nouveau mot de passe » remplace l'ancien. Après trop d'essais : « Trop d'essais, réessayez plus tard ».
- Magasin multi : le magasin joue le rôle du rayon (en-têtes `.aisle` collés, « Sans magasin » en dernier, pas de rayons) ; chaque article choisit son magasin parmi ceux regroupés.
- Hors ligne : la gestion du lien est désactivée avec le message « Indisponible hors ligne ».
- Un article avec photo : une seule photo, ouverte en plein écran depuis la miniature (liste et page publique).

## Ajout : zone des articles cochés (« Dans le panier » / « Terminés »)

Choix validés : 1A (courses, zone ouverte), 4A (tâches), 5a (aucun coché : la zone n'existe pas). Styles : section 16.5 de `listo.css` (variables existantes uniquement). Balisage : dernière partie de `components.html`. Aucune nouvelle icône.

Ce qui change par rapport à la liste d'origine :

- « Vider les barrés » disparaît de la barre d'état et du menu de la liste. La barre d'état ne garde que l'indicateur de synchro.
- Les articles cochés quittent leur rayon et forment une zone en bas de la liste, sous le dernier rayon. Aucun coché : pas de zone (ni en-tête, ni ligne grisée).

Composants nouveaux :

- `.cart` : `<section class="cart">` placée directement dans `.scroll`. Sa `<ul>` reprend le style carte existant ; les lignes sont des `.item.is-done` avec `.check[aria-pressed="true"]`.
- `.cart__head` > `.cart__bar` > `.cart__toggle` : bouton de repli pleine largeur (48 px) avec `aria-expanded`, `aria-controls` (id de la `<ul>`) et `aria-label` du type « Dans le panier, 12 articles ». Le chevron (`#i-chev-d`) pivote à −90° quand c'est replié. Le nombre est dans `.cart__count`.
- `.cart__actions` > `.cart__action` (+ `.cart__action--danger`) : deux actions texte sur une ligne, 44 px de haut, absentes quand la zone est repliée. Chaque bouton a un `aria-label` avec le nombre (« Tout remettre à acheter, 12 articles »).
- `.scroll--flat` : à ajouter sur `.scroll` quand la liste n'a pas d'en-tête de rayon (tâches).

Réutilisés tels quels : `.item`, `.is-done`, `.check`, `.sheet`, `.sheet__head`, `.sheet__title`, `.sheet__sub`, `.dialog__actions`, `.btn--secondary`, `.btn--primary`, `.btn--danger`, `.note.note--danger`, `.scrim`, `.scroll`, `.statusbar`, `.sync`.

| | Courses | Tâches et autres listes |
|---|---|---|
| Titre de la zone | Dans le panier · 12 | Terminés · 4 |
| Action non destructive | Tout remettre à acheter | Tout rouvrir |
| Action destructive | Retirer du panier | Retirer les terminés |
| Unité (lecteurs d'écran) | articles | éléments |

Comportement : zone ouverte par défaut, état ouvert/replié mémorisé par liste sur l'appareil ; du plus récemment coché au plus ancien ; chaque action est confirmée par une feuille du bas (« Remettre 12 articles à acheter ? » ; « Retirer 12 articles de la liste ? » avec la mention « C'est définitif : impossible de les récupérer. » et un bouton `.btn--danger`) ; aucun champ ne prend le focus tout seul.

Maquettes (`maquettes/`, chacune en `-clair` et `-sombre`) :

| Écran | Fichiers |
|---|---|
| 1A · Courses, zone ouverte (bas de liste) | `liste-panier-a-1` |
| 2 · Zone repliée | `liste-panier-replie-1` |
| 3 · Confirmer « Tout remettre à acheter » | `liste-panier-remettre-1` |
| 3 · Confirmer « Retirer du panier » | `liste-panier-retirer-1` |
| 4A · Tâches | `liste-taches-panier-a-1` |
| 5a · Aucun coché, zone absente | `liste-panier-vide-absente-1` |

## Ajout : bloc « À propos » (Réglages)

Une carte `.group` en deux zones `.row` séparées par un trait fin. Styles : section 16.6 de `listo.css` (variables existantes uniquement). Balisage : dernière partie de `components.html`. Aucune nouvelle icône. Aucune commande de serveur dans l'interface (elle reste dans `docs/exploitation.md`).

- `.row.about` (zone 1), ligne du haut : à gauche, `.row__title.about__version` « Version : » + lien `.about__link` sur les 7 caractères du commit (zone tactile de 44 px par marges négatives, sans agrandir la ligne). À droite, pour l'Admin, `.about__actions` : un état éventuel dans `.about__state` (`role="status"`, masqué s'il est vide), puis `.about__checked`, qui garde ensemble (`nowrap`) le texte `.row__sub` (`role="status"`) et le bouton-icône `.icon-btn.about__check` (`#i-sync`, `aria-label="Vérifier maintenant"`, 44 px ; pendant la vérification : `disabled` et `.is-busy`, l'icône tourne sauf mouvement réduit). Le texte est « Vérifié il y a 15 min », ou, à jour, « À jour · il y a 15 min » (`.about__ok`, vert ET écrit : une pastille de plus ne tient pas sur la ligne d'un téléphone de 375 px). Trop étroit (360 px, texte agrandi) : le groupe passe sous la version, aligné à droite.
- Nouvelle version : `.about__update`, ligne à part sous la ligne du haut (`flex: 1 0 100%`), avec la seule pastille `.chip--accent` « Nouvelle version : 7025130 » (`#i-alert`), toute la pastille est un lien `.about__chip-link` vers le commit (`aria-label="Nouvelle version disponible : 7025130, ouvrir sur GitHub"`, zone tactile étendue à 44 px), sans bouton à côté. Sans nouvelle version, cette ligne n'existe pas. `.chip--neutral` « Vérification impossible » ou « Hors ligne » : dans `.about__state`, ligne du haut.
- Autre compte, vérification désactivée (`LISTO_UPDATE_CHECK=off`) : « Version : aee6d6f » seule. Développement : « Version : non précisée », sans lien.
- `.row.about-links` (zone 2) : deux liens égaux `.about-links__link` (44 px, `target="_blank"`, `rel="noopener noreferrer"`) séparés par `.about-links__sep` : « magicgg91 » (`#i-pencil`, `aria-label="Développeur : magicgg91 sur GitHub"`) et « Projet GitHub » (`#i-link`, `aria-label="Projet Listo sur GitHub"`).

Réutilisés tels quels : `.group`, `.row`, `.row__body`, `.row__title`, `.row__sub`, `.chip`, `.icon-btn`, `@keyframes spin`.

## Ajout : carte du compte et écran « Mon compte »

Réglages devient court : carte du compte, Administration (Admin), À propos, Se déconnecter. Sécurité, Apparence et Ce téléphone passent dans un écran « Mon compte » (même gabarit que les autres : barre de titre avec retour, zone qui défile). Styles : section 16.7 de `listo.css`. Balisage : dernière partie de `components.html`. Aucune nouvelle icône.

- `.card.account.account--link` : `<button>` sur toute la surface de la carte du compte (avatar `.avatar--lg`, nom, sous-titre « Mon compte », pastille du rôle, chevron `#i-chev-r`), `aria-label="Mon compte : Guillaume"`, fond `--color-neutral-soft` au toucher. Ouvre « Mon compte ».
- Écran « Mon compte » : `.card.account` (identité : avatar, nom, « Identifiant : … », pastille du rôle), puis `.section-title` + `.group` de `.row` : Sécurité (Mot de passe, Double authentification avec la pastille « Activée »), Apparence (`.segmented` Clair / Sombre / Auto), Ce téléphone (Réinitialiser les données de ce téléphone).

Réutilisés tels quels : `.card`, `.avatar`, `.chip`, `.row`, `.group`, `.group--pad`, `.section-title`, `.segmented`, `.topbar`.

## Ajout : tri de « Mes listes »

Un seul bouton-icône `.icon-btn` dans la barre du haut de « Mes listes », à gauche des Réglages (et dans la colonne de gauche sur ordinateur). Chaque appui bascule entre « Plus récentes d'abord » (par défaut) et « Ordre alphabétique ». Balisage : dernière partie de `components.html`. Aucun style nouveau.

- L'icône montre le tri actif : `#i-clock` (plus récentes) ou `#i-az` (ordre alphabétique, **nouvelle icône** du sprite : A au-dessus de Z et flèche vers le bas, même trait que les autres).
- `aria-label` qui dit le tri actuel et l'effet d'un appui (« Tri : ordre alphabétique. Appuyer pour trier par plus récentes ») ; après un appui, annonce dans une zone `role="status"` masquée (`.visually-hidden`) et toast de 2 secondes « Tri : … », au-dessus du bouton « Nouvelle liste ».
- Bouton masqué s'il y a moins de deux listes. À l'intérieur d'une liste : rien ne change.

## Ajout : priorité et échéance des éléments (listes autres que les courses)

Styles : section 16.8 de `listo.css`. Balisage : dernière partie de `components.html`. **Nouvelles icônes** du sprite : `i-calendar` (échéance), `i-arrow-up` (priorité élevée), `i-arrow-down` (priorité basse). Les listes de courses ne sont pas concernées.

- `.item__meta` : une ligne de pastilles `.chip` (24 px de haut) sous le nom. « ↑ Élevée » (`.chip--accent`), « ↓ Basse » (`.chip` neutre), normale : rien. Échéance : `#i-calendar` + date (« ven. 24 oct. »), « Aujourd'hui » (`.chip--accent`), « Demain » ; en retard : `.chip--late` (couleur danger) + `#i-alert` + « En retard · ven. 16 oct. ». Élément coché (`.item.is-done`) : pastilles en gris, jamais « En retard ». Toujours une icône ET un texte. Le libellé du bouton de la ligne reprend priorité et échéance pour les lecteurs d'écran.
- Feuille de l'élément : « Priorité » en `.segmented` (Basse / Normale / Élevée, `role="radio"`, choix actif avec `.icon--check` ET texte) ; « Échéance » : `.due-picker` (bouton `.input--select` avec `#i-calendar` et la date, et par-dessus le vrai `<input type="date">` invisible `.due-picker__input`, date seule) ; raccourcis `.due-shortcuts` (Aujourd'hui, Demain, Dans 1 semaine, Effacer, `.btn--secondary.btn--sm`, 44 px).

## Ajout : tri d'une liste (listes autres que les courses)

Balisage : dernière partie de `components.html` ; style : section 16.9 de `listo.css`. Aucune nouvelle icône (`i-az`, `i-arrow-up`, `i-calendar`).

- Bouton-icône `.icon-btn` « Trier la liste » (`aria-haspopup="menu"`) dans la barre du haut, entre le titre et le menu ⋮ ; son icône montre le tri actif. Absent des listes de courses.
- Choix dans le `.menu` existant : options `role="menuitemradio"` avec `aria-checked` ; l'option active a une coche `.icon--check` ET son texte. Choisir ferme le menu, trie et affiche un toast bref « Tri : par priorité ».
- Tri par priorité : en-têtes `.aisle` « Priorité élevée », « Priorité normale », « Priorité basse » (groupe vide : pas d'en-tête). Par échéance : une seule liste, sans en-tête.

## Ajout : pastille d'état dans la barre du haut de « Mes listes »

Styles : section 16.10 de `listo.css`. Balisage : dernière partie de `components.html`. Aucune nouvelle icône.

- `.topbar.topbar--plain.topbar--status` : sur une ligne, le titre (`.topbar__main`, sa largeur naturelle), puis `.topbar__status` (prend la place restante) qui contient la pastille `.sync`, puis le bouton de tri et les Réglages. La ligne `.statusbar` disparaît de l'accueil (gardée sur l'écran d'une liste).
- `.sync--compact` : quand le texte ne tient pas, il est masqué visuellement (toujours lu par les lecteurs d'écran) et seule l'icône reste, suivie de `.sync__count` (nombre en attente, masqué aux lecteurs d'écran qui lisent déjà « Hors ligne · 3 en attente »). Le choix est refait à chaque changement de largeur ou d'état.
- La pastille reste un bouton (« À jour, synchroniser maintenant » pour les lecteurs d'écran) avec une zone tactile de 44 px de haut.

## Ajout : mode scan des listes de courses

Balisage : dernière partie de `components.html`. Aucun style nouveau : composants existants. **Nouvelle icône** du sprite : `i-barcode` (code-barres dans un cadre de visée, même trait que les autres), soit 40 icônes.

- Bouton « Scanner » : `.btn.btn--secondary.btn--icon` (52 px), `aria-label="Scanner un produit"`, entre le champ d'ajout et le bouton `+` de `.addbar`, dans les listes de courses seulement. Il ouvre directement le sélecteur d'images du téléphone (champ fichier caché `accept="image/*"`, sans `capture`) : aucune feuille de choix propre à Listo. Exception, sur Android seulement : voir « Ajout : choix de la source sur Android ».
- Feuille « Scanner un produit » (`.sheet`, qui défile si besoin) :
  - lecture et recherche : pastille `.sync.sync--busy` (« Lecture du code-barres… », « Recherche du produit… ») ;
  - produit trouvé : `.note` avec `#i-check`, champs `.field` « Nom » (modifiable) et « Note (facultative) » (« marque · format »), `.note` « Déjà dans la liste » (bouton « Ajouter quand même »), `.field__hint` « Données : Open Food Facts », `.sheet__actions` « Ajouter à la liste » / « Annuler » ;
  - code non lu, lecteur indisponible : `.note.note--danger`, « Réessayer » (`#i-camera`, le même sélecteur d'images), « Saisir le code à la main » qui fait apparaître un champ `inputmode="numeric"` ;
  - nom introuvable : `.note`, « Taper le nom » ;
  - produit connu (déjà dans une de mes listes) : `.note` « Produit connu : <nom>. Vous pouvez corriger le nom avant de l'ajouter. » (`#i-check`), mêmes champs et boutons, sans la mention Open Food Facts ;
  - scan pour cocher : `.note` « Déjà dans la liste : <nom> » (`#i-alert`) puis `.sheet__actions` « Cocher (je l'ai pris) » (`.btn--primary`, `#i-check`), « Ajouter quand même », « Annuler » ; article coché : `.note` « Déjà coché : <nom> » (`#i-check`) et « Le remettre dans la liste » ;
  - après un ajout : la feuille se ferme, toast « Ajouté : … » ; l'article ajouté est brièvement mis en évidence dans la liste (`.item--added`, fond `--color-accent-soft` qui s'efface, dans `public/css/app.css`).

## Ajout : code-barres des articles (listes de courses)

Balisage : dernière partie de `components.html`. Aucun style nouveau, aucune nouvelle icône (`i-barcode` existe).

- Feuille de l'article, sous la note : `.field` « Code-barres » ; titre `.field__label` « Code-barres » suivi de l'aide `.field__aside` « (8, 12 ou 13 chiffres) » (plus petite, grisée, pas en gras, dans le `<label>`). Dessous, une ligne `.field__row` (`app.css`) : `.input-wrap` du kit (le champ `inputmode="numeric"` prend la largeur restante, avec à droite, dedans, la croix `.icon-btn` `#i-close` « Effacer le code-barres », visible seulement si le champ n'est pas vide), puis le bouton `.btn.btn--secondary.btn--icon` (`#i-barcode`, 52 px, `aria-label="Scanner un code-barres"`, sans texte ; ouvre directement le sélecteur d'images du téléphone, comme le mode scan). Même principe pour « Quantité (par exemple 2 ou 500 g) » : aide courte à côté du titre, plus de ligne d'aide sous le champ. Code invalide : `.field__error` « Code invalide : vérifiez les chiffres ». Un autre article de la liste porte le même code : `.note` d'avertissement (on prévient, on n'interdit pas).
- Mode scan : « Déjà dans la liste : « Lait demi-écrémé » a ce code-barres. » (même `.note`, bouton « Ajouter quand même »).
- La ligne de la liste ne change pas : le code n'y est pas affiché.

## Ajout : groupes repliables (toutes les listes)

Styles : section 16.11 de `listo.css`. Balisage : dernière partie de `components.html`. Aucune nouvelle icône (`i-chev-d`).

- Chaque en-tête de groupe (rayon, magasin d'une liste « multi », priorité) devient `.aisle.aisle--fold` et contient un vrai bouton `.aisle__toggle` pleine largeur (48 px) : `aria-expanded`, `aria-controls` (id de la `<ul>` du groupe), `aria-label` du type « Fruits et légumes, 2 articles restants sur 3 » ; chevron `#i-chev-d`, `.aisle__name`, `.aisle__count` à droite.
- Replié : le chevron pivote à −90°, la `<ul>` est masquée (`hidden`), et `.aisle__count` laisse place à `.aisle__rest` « · 2 à acheter » (« · 3 à faire » hors courses) juste après le nom : l'état ne repose jamais sur la couleur seule. **Remplacé** par le compteur « X/Y », voir « Ajout : compteur X/Y » (`.aisle__rest` n'est plus utilisé).
- La zone des cochés (`.cart__toggle`, section 16.5) se replie déjà de la même façon.
- `.fold-all` « Tout replier » / « Tout déplier » : bouton texte compact (44 px, `#i-chev-d` tourné vers le haut tant qu'un groupe est ouvert : `.fold-all--open`), à droite de la `.statusbar` de l'écran d'une liste, seulement s'il y a au moins deux groupes (zone des cochés comprise).
- Liste sans groupe (liste de tâches en ordre alphabétique ou par échéance) : aucun en-tête, aucun bouton. La page publique du lien n'est pas concernée (en-têtes simples, en lecture seule).

## Ajout : fiche d'un article, boutons dans l'en-tête

Styles : `public/css/app.css` (ajouts minimes, aucune nouvelle classe dans `listo.css`). Balisage : « Feuille du bas (fiche d'un article) » dans `components.html`. Aucune nouvelle icône (`i-trash`, `i-check`, `i-close`).

- `.sheet__head.sheet__head--tools` : le titre dans `.sheet__heading` (une ligne, tronqué par `text-overflow: ellipsis`), puis `.sheet__tools` : `.icon-btn.icon-btn--danger.sheet__delete` (`#i-trash`, rouge `--color-danger-ink`, `aria-label="Supprimer l'article"`), un espace (`margin-right: var(--space-2)`), `.icon-btn.icon-btn--primary` (`#i-disquette` sur fond `--color-accent`, la coche `#i-check` jusqu'au 19 octobre 2026, `type="submit"` relié au formulaire par `form`, `aria-label="Enregistrer"`), puis la croix `.icon-btn` « Fermer ». Tous de 44 px. L'en-tête reste collé en haut quand la feuille défile.
- Plus de `.sheet__actions` « Enregistrer » / « Supprimer » en bas de la fiche.

## Ajout : glissement d'une ligne vers la gauche (« Supprimer »)

Styles : `public/css/app.css`. Balisage : « Ligne glissée vers la gauche » dans `components.html`. Aucune nouvelle icône (`i-trash`). Gestes : `public/js/swipe.js` (événements tactiles natifs, aucune bibliothèque).

- `li.item.swipe` (`touch-action: pan-y` : le défilement vertical reste au navigateur) : le contenu de la ligne est dans `.swipe__slide` (fond hérité de la ligne), qui suit le doigt (`transform`) ; derrière, `button.swipe__delete` (fond `--color-danger`, `#i-trash` ET « Supprimer », 104 px de large, `aria-label="Supprimer <nom>"`), visible seulement pendant le glissement (`.is-swiping`) ou ligne ouverte (`.is-open`).
- Animation de retour coupée avec `prefers-reduced-motion`. Pas de glissement à la souris. La page publique n'a ni glissement ni suppression.

## Ajout : menu ⋮ des cartes de « Mes listes »

Styles : `public/css/app.css`. Balisage : « Carte avec menu ⋮ » dans `components.html`. Aucune nouvelle icône (`i-more`, `i-trash`).

- `.list-card-wrap` (position relative) : le lien `a.card.list-card` (inchangé), puis le bouton `.icon-btn.list-card__menu` (`#i-more`, 44 px, `aria-label="Actions de la liste <nom>"`, `aria-haspopup="menu"`, `aria-expanded`) posé dans le coin haut droit, hors du lien ; `.list-card__head` laisse sa place. Pas de bouton quand aucune action n'est possible (depuis le 19 octobre 2026, tout membre en a au moins une : voir « Dupliquer la liste » et « Quitter la liste » plus bas).
- Menu : le `.menu` existant, placé juste sous le bouton (jamais hors de l'écran). Propriétaire : « Modifier la liste » (`#i-pencil`), « Dupliquer la liste » (`#i-copy`), « Partager par lien » (`#i-link`), un trait `.menu__sep` (`role="separator"`), « Supprimer la liste » (`.menu__item--danger`, `#i-trash`). Contributeur et invité : voir « Dupliquer la liste » et « Quitter la liste » plus bas.
- Menu ⋮ de la liste ouverte : exactement le même (plus d'« Actualiser » : la pastille d'état fait la même chose). Pas de bouton ⋮ quand aucune action n'est possible. Menu complet par profil (dont « Dupliquer la liste » et « Quitter la liste ») : voir plus bas.
- Confirmation : le `.dialog` existant, « Supprimer la liste « <nom> » ? », la même pour les trois chemins.

## Ajout : droit par personne et liste en lecture seule

Styles : `public/css/app.css` (ajouts minimes) et composants existants. Balisage : « Partage : droit par personne » et « Liste en lecture seule » dans `components.html`. Aucune nouvelle icône (`i-check`, `i-eye`).

- Formulaire « Nouvelle liste » / « Modifier la liste », carte `.card.share` : chaque personne est un `.share__person` (la `.tick-row` habituelle, puis, si elle est cochée, `.share__access`). `.share__access` contient un `.segmented` (`role="radiogroup"`, `aria-label="Droit de <nom> sur la liste"`) avec deux `.segmented__opt` (`role="radio"`, 44 px) : « Peut modifier » et « Lecture seule » ; le choix actif porte `.icon--check` ET son texte (jamais la couleur seule). Une personne cochée commence sur « Lecture seule ». Le propriétaire (« (vous) ») n'a pas de choix : `.share__hint` « Tous les droits ».
- Liste en lecture seule : `.readonly-banner` (le bandeau de la page publique, `#i-eye` + « Lecture seule ») juste sous la `.topbar` ; pas de `.addbar`, pas de bouton « Scanner », pas de `.swipe`, pas de `.cart__actions` ; cases `.check.check--static` (`role="img"`, `aria-label` « Coché » / « Non coché » ; cochée : `.is-on`, et la ligne `.is-done` reste barrée) ; la ligne reste un bouton `.item__body` (« Voir <nom> ») qui ouvre la fiche à consulter.
- Fiche à consulter : `.sheet` « Détail de l'article » (« de l'élément » hors courses), sans outils dans l'en-tête (seulement la croix) ; un `.note` (`#i-eye`) rappelle la lecture seule ; chaque valeur est un `.field` avec `.field__label` et `.field__value` (texte, pas de champ) ; la photo est un `.photo-block__thumb` qui s'agrandit.
- Carte de « Mes listes » : `.chip.chip--readonly` (`#i-eye` + « Lecture seule », 22 px de haut) dans `.list-card__meta`.

## Ajout : priorité et échéance activées ou non, liste par liste

Styles : `public/css/app.css` (ajouts minimes) et composants existants. Balisage : « Nouvelle liste : options désactivées » et « Modifier la liste : le même composant » dans `components.html`. Aucune nouvelle icône.

- Formulaire « Nouvelle liste » / « Modifier la liste », après le magasin : `.field` « Options des éléments » avec une `.card.list-options` de deux `.toggle-row` séparées par un trait. Chacune : `.row__title` (« Priorité », « Échéance »), `.row__sub` avec la description seule, fixe (« Basse, normale ou élevée. », « Une date limite ; retards signalés. ») et un `.switch` (`role="switch"`, `aria-checked`, nom = le titre par `aria-labelledby`, description par `aria-describedby`, 44 px). L'état se voit à la position du bouton, sans texte d'état (retouche du 30 octobre 2026). Masqué pour une liste de courses.
- Réglage désactivé : aucune trace dans la liste (pas de pastille de priorité ni d'échéance, pas de « En retard »), ni dans la fiche (champ absent), ni dans la fiche à consulter, ni sur la page publique ; le menu « Trier la liste » ne propose que les tris disponibles, et le bouton disparaît s'il ne reste que l'ordre alphabétique.

## Ajout : « Dupliquer la liste » et « Quitter la liste »

Styles : `public/css/app.css` (`.list-card--fresh`) et composants existants. Balisage : « Menu d'une liste, par profil », « Feuille « Dupliquer la liste » » et « Confirmation « Quitter la liste » » dans `components.html`. Aucune nouvelle icône (`i-copy`, `i-logout`, déjà dans le sprite).

- Menu ⋮ d'une carte et menu ⋮ de la liste (le même `.menu`, mêmes actions dans le même ordre) :
  - propriétaire : « Modifier la liste » (`#i-pencil`), « Dupliquer la liste » (`#i-copy`), « Partager par lien » (`#i-link`), un trait, « Supprimer la liste » (`.menu__item--danger`, `#i-trash`) ;
  - contributeur : « Dupliquer la liste », un trait, « Quitter la liste » (`.menu__item--danger`, `#i-logout`) ;
  - invité en lecture seule : « Quitter la liste » seulement (sans trait).
  Le bouton ⋮ d'une carte apparaît donc pour tout membre ; il n'apparaît jamais sans action.
- Feuille « Dupliquer la liste » (`.sheet`) : `.field` « Titre de la liste » (`.input`, « <nom> (copie) », aucun curseur posé d'office), une `.card.list-options` avec une `.toggle-row` « Copier les articles » / « Copier les éléments » (`.switch`, `role="switch"`, état écrit « Activé · … » / « Désactivé · liste vide »), une aide (`.field__hint`) sur ce qui n'est pas copié, puis `.sheet__actions` : « Dupliquer » (`.btn--primary.btn--block`) et « Annuler » (`.btn--secondary.btn--block`).
- Après : message (`.toast`) « Liste « <nom> » créée » avec « Ouvrir » (`.toast__action`) ; sur « Mes listes », la nouvelle carte porte `.list-card--fresh` (brève mise en évidence, coupée avec `prefers-reduced-motion`).
- Confirmation « Quitter la liste « <nom> » ? » : le `.dialog` existant, texte « Vous ne la verrez plus. Le propriétaire pourra de nouveau la partager avec vous. », boutons « Annuler » (`.btn--secondary`) et « Quitter » (`.btn--danger`).

## Ajout : « Nouveau magasin… » / « Nouveau rayon… »

Styles : `public/css/app.css` (`.picker__new`) et composants existants. Balisage : « Choix du rayon avec « Nouveau rayon… » » et « Feuille « Nouveau rayon » / « Nouveau magasin » » dans `components.html`. Icône existante (`i-plus`).

- Dernière ligne d'un choix de rayon ou de magasin : un `.radio-row.picker__new` (bouton, `#i-plus` + « Nouveau rayon… » / « Nouveau magasin… », texte en couleur d'accent, trait au-dessus), hors du `role="radiogroup"` des choix, 44 px.
- Feuille de création, la même pour les deux (`public/js/create-reference.js`) : `.sheet` « Nouveau rayon » / « Nouveau magasin », un `.field` « Libellé du rayon » / « Libellé du magasin » (`.input`, attributs `LABEL_INPUT`, jamais « Nom », aucun curseur posé d'office), une `.note` d'erreur au besoin (doublon) avec un bouton `.btn--secondary.btn--block` « Choisir « … » », puis « Créer » (`.btn--primary.btn--block`).
- Une fenêtre ouverte par-dessus une autre passe au-dessus de son fond grisé (`.scrim`) : la fenêtre du dessous est grisée.

## Ajout : icône d'une liste

Styles : `public/css/app.css` (`.icon-grid`, `.icon-grid__opt`, `.icon-grid__check`, `.topbar__head`, `.topbar__icon`, `.list-card__icon`). Balisage : « Formulaire de liste : « Icône » » et « En-tête d'une liste avec son icône » dans `components.html`. Liste blanche et noms : `public/js/list-icons.js`.

- Grille sous « Type de liste » : boutons de 44 px au moins (`role="radio"`, `aria-label` et `title` en français) dans un `role="radiogroup"` relié au titre « Icône ». Sur un téléphone de 390 px : sept colonnes, cinq lignes.
- Choix : bord de 2 px d'accent, fond d'accent doux, couleur d'accent, ET une petite coche ronde dans le coin (`.icon-grid__check`) : jamais la couleur seule.
- Au départ, la case cochée est l'icône du type de la liste (`i-cart` pour les courses, `i-tasks` pour les tâches, `i-gift` pour les envies, prévues plus tard).
- Carte de « Mes listes » : l'icône (20 px, couleur d'accent) devant le titre. En-tête de la liste : la même, en couleur secondaire, juste avant le titre.
- **Nouvelles icônes** du sprite (même trait que les autres, couleur héritée), soit 71 icônes : `i-balloon`, `i-bag`, `i-basket`, `i-bike`, `i-book`, `i-briefcase`, `i-bulb`, `i-cake`, `i-car`, `i-cup`, `i-dumbbell`, `i-euro`, `i-gamepad`, `i-gift`, `i-hammer`, `i-health`, `i-heart`, `i-home`, `i-meal`, `i-music`, `i-paw`, `i-plane`, `i-plant`, `i-school`, `i-shirt`, `i-spray`, `i-star`, `i-stroller`, `i-suitcase`, `i-tv`, `i-wrench`. Réutilisées : `i-cart`, `i-store`, `i-tasks`, `i-calendar`.

## Ajout : carte compacte de « Mes listes »

Styles : `public/css/app.css` (`.list-card__left`, `.list-card__people`, `.list-card__link`, règles de `.list-card__head`). Balisage : « Carte compacte de « Mes listes » » dans `components.html` ; il remplace, pour la carte, la ligne `.list-card__meta` (catégorie, magasin, lien) des exemples plus anciens.

- Ligne 1 (`.list-card__head`) : `.list-card__icon`, `.list-card__name` (deux lignes au plus, puis « … »), `.list-card__time` ; le bouton ⋮ (`.list-card__menu`, 44 px) est posé à côté, hors du lien.
- Ligne 2 (`.list-card__foot`) : à gauche `.list-card__left` (compteur `.list-card__count`, `.chip--readonly` ; plus de `.badge-multi` sur la carte depuis le 19 octobre 2026 : il reste dans l'en-tête de la liste) ; à droite `.list-card__people` : le symbole du lien public (`.list-card__link`, `role="img"`, `aria-label="Lien public actif"`) juste avant `.avatars`, seulement si un lien est en cours.
- Ni catégorie ni magasin sur la carte. Aucune nouvelle icône.

## Ajout : compteur X/Y

Styles : `public/css/app.css` (`.list-card__count--progress`) et composants existants (`.aisle__count`, déjà en chiffres alignés). Balisage : « Carte compacte de « Mes listes » » et « En-têtes de groupe avec « X/Y » » dans `components.html`.

- Carte : `.list-card__count.list-card__count--progress` (`role="img"`, `aria-label` et `title` « 3 articles restants sur 8 ») contient « 3/8 » (`aria-hidden`). Tout coché : `+ .list-card__count--done`, « 0/8 » puis `#i-check` (vert ET coche). Liste vide : « Liste vide ».
- En-tête de groupe : `.aisle__count` « X/Y » à droite, ouvert comme replié ; le bouton `.aisle__toggle` a pour nom « Crèmerie, 1 article restant sur 2 » et la même infobulle (sans le nom). `.aisle__rest` n'est plus utilisé.
- Textes : `progressText` et `progressLabel` de `public/js/words.js`. Aucune nouvelle icône.

## Ajout : disquette « Enregistrer » de la fiche d'un article

Le bouton plein « Enregistrer » de l'en-tête de la fiche (ajout ou modification d'un article ou d'un élément) porte une disquette (`#i-disquette`) au lieu de la coche : la coche reste réservée à « coché » (articles, choix). Même bouton `.icon-btn.icon-btn--primary`, `aria-label="Enregistrer"`, 44 px ; la poubelle et la croix ne changent pas, les grands boutons « Enregistrer » des formulaires non plus. Balisage : « Feuille article » dans `components.html` (clair et sombre). **Nouvelle icône** du sprite, soit 72 icônes : `i-disquette` (même trait que les autres, couleur héritée ; aucune icône équivalente n'existait), aussi dans `icones/i-disquette.svg`.

## Ajout : choix de la source sur Android (photo et scan)

Sur Android seulement, les boutons photo et scan (photo d'un article, scan du champ Code-barres, « Scanner », « Réessayer ») ouvrent d'abord une petite feuille `.sheet` (même composant que les autres, par-dessus la fiche, fond grisé). Balisage : « Feuille « Prendre une photo / Choisir dans la galerie » (Android) » dans `components.html`. Aucun style nouveau.

- Titre : « Photo de l'article » (« de l'élément »), « Scanner un code-barres » ou « Scanner un produit ».
- `.stack.stack--sm` : `.btn.btn--secondary.btn--block` « Prendre une photo » (`#i-camera`), `.btn.btn--secondary.btn--block` « Choisir dans la galerie » (`#i-image`), `.btn.btn--ghost.btn--block` « Annuler ». 48 px de haut chacun, `aria-label` sur les deux choix.
- Aucun champ de saisie, aucun focus posé dans un champ. Ailleurs qu'Android : pas de feuille, un seul geste.

## Ajout : Administration, onglet « Articles » et « Modifier le rayon »

L'onglet « Noms » s'appelle « Articles ». Balisage : « Onglet « Articles » : ligne d'un article » et « Feuille « Rayon de … » » dans `components.html`. Aucune nouvelle icône (`i-store`).

- Ligne `.manage` : `.manage__name`, `.manage__sub` (rayon habituel s'il y en a un · utilisations · articles en liste), puis trois `.icon-btn` de 44 px : `#i-pencil` « Corriger … », `#i-store` « Modifier le rayon de … », `#i-trash` « Retirer … des suggestions ».
- Feuille : titre « Rayon de « … » », `.card.picker` avec un `role="radiogroup"` de `.radio-row` (rayons actifs, puis « Aucun rayon »), l'actuel avec `.radio.is-on` et `#i-check` (`.icon-end`), puis `.btn.btn--primary.btn--block` « Enregistrer ». Aucun champ de saisie.
- Barre `.tabs` de l'Administration : elle défile de côté quand l'écran est trop étroit (`public/css/app.css`), sans barre de défilement visible ; l'onglet actif est ramené en vue.

## Ajout : Administration en trois onglets (Comptes, Catégories, Courses)

Styles : `public/css/app.css` (`.tabs--sub`). Balisage : « Administration : onglet « Courses » » dans `components.html`. Aucune nouvelle icône.

- Onglets principaux `.tabs` / `.tab` : « Comptes », « Catégories », « Courses ». **Depuis le 1er novembre 2026** : « Comptes » et « Courses » seulement (les catégories sont remplacées par les types de liste).
- Sous « Courses », une seconde barre `.tabs.tabs--sub` (`role="tablist"`, `aria-label="Courses"`) : `.tab` « Magasins », « Rayons », « Articles », en plus petit (`--text-sm`), 44 px de haut ; choix actif `aria-selected="true"` : souligné de 3 px ET texte plus foncé. Le contenu de chaque choix est celui des anciens onglets, inchangé.

## Ajout : page « Aide »

Styles : `public/css/app.css` (`.help`, `.help-who__*`, `.help__*`). Balisage : « Page « Aide » » dans `components.html`. Aucune nouvelle icône (`i-book` pour la ligne des Réglages, `i-check` / `i-close` dans les pastilles).

- Réglages : une `.row` « Aide » (`#i-book`, sous-titre « Mode d'emploi de Listo »), sous un `.section-title` « Aide ».
- « Qui peut quoi » : `.section-title`, puis un `.group` de `.help-who__row` (l'action en gras, puis `ul.help-who__roles` de `.chip.help-who__role`). Oui : fond d'accent doux, `#i-check` ; non : fond transparent, bord pointillé, `#i-close`, texte secondaire. Le « oui » / « non » est aussi écrit pour les lecteurs d'écran (`.visually-hidden`). Note `.help__note` en dessous.
- Sections : `section.help__part` > `h2.aisle.aisle--fold` > `button.aisle__toggle` (`aria-expanded`, `aria-controls`, chevron qui tourne), puis `.help__section` (masqué replié) fait de `.card.help__topic` : `h3.help__title`, `p.help__text`, `ul.help__list` (puces).

## Ajout : tri d'une liste de courses

Styles : aucun nouveau (bouton « Trier la liste », `.menu`, `.aisle.aisle--fold` existants). Balisage : « Tri d'une liste de courses » et « Liste de courses en ordre alphabétique » dans `components.html`. Aucune nouvelle icône (`i-layers`, `i-store`, `i-az`).

- Le bouton « Trier la liste » apparaît aussi sur les listes de courses : « Par rayon » (`#i-layers`, par défaut ; « Par magasin », `#i-store`, pour une liste « multi ») et « Ordre alphabétique » (`#i-az`) ; option active : coche ET texte (`menuitemradio`).
- « Ordre alphabétique » : un seul en-tête repliable « À acheter » (même `.aisle__toggle`, compteur « X/Y »), les articles à plat, puis la zone « Dans le panier ». Le rayon de chaque article est gardé.
- Choix propre à chaque téléphone ; la page publique reste par rayon.

## Ajout : recherche (dans une liste et sur « Mes listes »)

Maquettes : `recherche/` (`captures/recherche-liste-*` et `recherche-accueil-*`, en `-clair` et `-sombre`). Styles : section 16.12 « Recherche » de `listo.css` (16.6 était déjà prise), comportement dans `public/css/app.css`. Balisage : « Recherche dans une liste » et « Recherche sur « Mes listes » » dans `components.html`. **Nouvelles icônes** du sprite, soit 74 icônes : `i-search` (loupe décorative du champ, état « Aucun résultat ») et `i-x-circle` (croix « Effacer la saisie »).

- Champ `.searchfield` (48 px de haut, cadre `--color-control`, anneau `--color-accent` quand il a le curseur) : `#i-search` décorative, `input.searchfield__input` (`type="search"`, `enterkeyhint="search"`, `aria-label` et texte d'exemple « Rechercher dans la liste » ou « Rechercher une liste »), puis, s'il y a du texte, `button.icon-btn` « Effacer la saisie » (`#i-x-circle`, 44 px).
- `.searchrow` : premier enfant de `.scroll`, masqué à l'ouverture (zone défilée de sa hauteur), révélé en tirant la liste vers le bas. **Aucune loupe dans la barre du haut**, ni dans une liste (variante B) ni sur « Mes listes » (écart avec la variante A des maquettes, choix du propriétaire : ni `.topbar--search`, ni bouton « Fermer », ni « Recherches récentes »).
- Résultats : texte trouvé dans `<mark class="hit">` (fond `--color-accent-soft`, gras ET souligné `--color-accent` : jamais la couleur seule), y compris sur un article coché (barré) ; nombre `.search-meta` (`role="status"`) : à droite de la pastille dans une liste (« 4 résultats », « 1 résultat », « 0 résultat »), sous le champ sur « Mes listes » (« 2 listes »).
- Pendant la recherche dans une liste : en-têtes de groupe sans bouton de repli (`h2.aisle` > nom + `.aisle__count` avec le nombre de résultats), zone des cochés ouverte sans ses actions, « Tout replier » et barre d'ajout masqués (la barre seulement tant que le champ a le curseur).
- Aucun résultat : `.empty` avec `.empty__icon` (`#i-search`), « Aucun résultat », « Aucun article ne correspond à « … ». » (« Aucune liste ne correspond… »), et `.btn.btn--secondary` « Effacer la recherche ».

## Ajout : nouveautés (pastille et halo)

Ce que les autres ont ajouté ou modifié depuis ma dernière visite. Pas de maquette : composé avec les variables du kit, **aucune couleur ni variable nouvelle**. Styles : section 16.13 « Nouveautés » de `listo.css`. Balisage : « Nouveautés sur « Mes listes » » et « Nouveautés dans une liste » dans `components.html` (clair et sombre).

- Pastille `.news-badge` (`role="img"`, `aria-label` « 3 nouveautés », « plus de 30 nouveautés ») : posée sur le coin haut gauche de `.list-card__icon` (qui devient `position: relative`), forme `--radius-pill`, fond `--color-accent`, chiffres `--color-on-accent` en gras, entourée de `--color-surface` pour se détacher de l'icône. Texte « 3 », ou « 30+ » quand la dernière visite est plus ancienne que le journal gardé. La carte ne grandit pas ; compteur X/Y, symbole du lien public et pastilles des personnes restent visibles.
- Halo `.item--news` sur la ligne `.item` : fond `--color-accent-soft`, statique (aucune animation), plus le repère texte `.item__news` sous le nom (`--text-sm`, gras, `--color-accent-ink`) : « Ajouté par Marie », « Modifié par Marie », « Coché par Marie », « Décoché par Marie » (jamais la couleur seule ; le repère est aussi lu avec le nom). Zones tactiles inchangées. Un article coché garde son nom barré.
- Liste en sourdine ou « Nouveautés » désactivé : ni pastille, ni halo.

## Ajout : écran « Autoriser Claude »

Écran de l'application (`#/autoriser/<id>`) où une personne accepte, ou refuse, que Claude accède à ses listes (autorisation OAuth, `docs/mcp-cadrage.md`). Pas de maquette : composé avec le kit seul, **aucune couleur ni variable nouvelle**. Balisage : « Autoriser Claude (claude.ai) » et « Autoriser Claude : Claude Code (retour local) » dans `components.html` (clair et sombre).

- Barre du haut sans bouton Retour (on sort par « Autoriser » ou « Refuser ») ; pas de panneau latéral sur ordinateur.
- Avertissement permanent `.note` (`#i-alert`) : « Ne continuez que si vous venez de lancer la connexion depuis Claude. »
- Carte de trois `.row` : l'application (hôte ; un nom déclaré par l'application elle-même est suivi de « (nom donné par l'application, non vérifié) », celui du document d'identification publié sur claude.ai de « (nom fourni par l'application) »), **l'hôte de retour** (« claude.ai », ou « une application sur cet ordinateur (localhost) »), le compte connecté. Retour local : `.note--danger` en plus.
- Choix exclusifs « Lecture seule » / « Lecture et ajout » et « Toutes mes listes » / « Certaines listes » : `.radio-row` dans une `.card` (rond plein ET texte en gras sur le choix actif ; une ligne par choix, lisible sur un téléphone de 320 px, là où `.segmented` coupait « Toutes mes listes » en deux). « Lecture seule » et « Toutes mes listes » sont présélectionnés. Sous « Accès », `.field__hint` dit ce que Claude pourra faire.
- « Certaines listes » : listes à cocher en `.tick-row` (icône de la liste, nom), comme le partage d'une liste.
- Mot de passe (`passwordInput`, avec l'œil) et, si la 2FA est activée, le champ « Code » ; erreurs en `.form-error`.
- `.footer` : la phrase « Vous venez de lancer cette connexion depuis Claude ? Si ce n'est pas le cas, refusez. » (texte simple, sans icône), puis `.btn--primary` « Autoriser » et `.btn--secondary` « Refuser » (44 px et plus).
- Seul ajout dans `public/css/app.css` : `.card--clip { overflow: hidden; }`, pour que le fond du choix actif ne dépasse pas des coins arrondis de la carte.

## Ajout : écran « Connexions Claude »

Écran de Mon compte (`#/reglages/claude`) où chaque personne voit et déconnecte ses connexions Claude. Pas de maquette : composé avec le kit seul, **aucune couleur ni variable nouvelle**.

- Texte d'introduction, puis section « Adresse à saisir dans Claude » : une `.group` avec l'adresse sur sa propre ligne (elle peut passer à la ligne) et `.btn--secondary.btn--block` « Copier l'adresse », puis une `.row` vers l'aide « Utiliser Listo avec Claude ».
- Section « Connexions (N) » : une `.row` par connexion (`#i-shield`) ; dans `.row__body` : l'hôte de l'application, le nom (« nom donné par l'application, non vérifié » ou « nom fourni par l'application »), « Réponse envoyée à : … », le droit en `.chip` (`.chip--accent` pour « Lecture et ajout »), les listes, la date de connexion, la dernière utilisation (« jamais »), puis `.btn--danger-outline.btn--sm` « Déconnecter » (44 px, `aria-label` « Déconnecter <hôte> »).
- En bas, `.btn--danger.btn--block` « Tout déconnecter ». Confirmations : la fenêtre `.dialog` habituelle (`confirmDialog`). Aucune connexion, hors ligne : `.empty`.
- Ajouts dans `public/css/app.css`, mise en place seulement : `.claude-connections__intro`, `.claude-connections__address`, `.claude-connections__url`, `.claude-connections__chips`, `.claude-connections__button`, `.claude-connections__all`, et `.claude-connections .row { align-items: flex-start; }`.

## Ajout : « Type de liste » dans le formulaire de liste

Aucune nouvelle classe, aucune nouvelle icône, aucune couleur nouvelle (1er novembre 2026). Le champ « Catégorie » du formulaire devient « Type de liste », avec le même composant de choix en cartes (`.choice.choice--wrap`, `.choice__opt`, `role="radio"`, coche `.icon-end` ET bord d'accent : jamais la couleur seule), et deux cartes seulement : « Courses » (`i-cart`) et « Tâches » (`i-tasks`). L'icône des envies (`i-gift`, déjà dans le sprite) servira à l'étape suivante.

- Pour une liste existante, quand le choix diffère du type enregistré, une ligne de texte d'aide du kit (`.field__hint`, `id="type-warning"`, `aria-live="polite"`, reliée au groupe par `aria-describedby`) s'affiche juste sous les cartes, avant l'enregistrement : « Les rayons, magasins et codes-barres ne s'affichent plus pour ce type ; ils sont conservés si vous revenez à Courses. » ou « La priorité et l'échéance ne s'affichent plus pour ce type ; elles sont conservées si vous revenez à Tâches. ».
- Sous-titre d'une liste sans magasin, et page du lien public : le nom du type (« Courses », « Tâches ») à la place du nom de la catégorie.
- Le balisage de référence reste celui de « Choix en cartes » dans `components.html` (l'exemple y garde son ancien libellé « Catégorie »).

## Ajout : listes d'envies

Aucune nouvelle classe, aucune nouvelle couleur, aucune nouvelle icône (2 novembre 2026) : `i-gift` (déjà dans le sprite) est l'icône par défaut d'une liste d'envies et celle de la pastille de réservation et du bouton « Réserver » ; `i-euro` celle du prix ; `i-link` celle de « Ouvrir le lien ».

- Formulaire : « Envies » est la troisième carte de « Type de liste » (`.choice__opt`) ; « Pour qui ? » est une carte de lignes à choix unique (`.card` + `.radio-row`, comme le choix du magasin), puis un champ « Prénom » (`.field`) pour « Une personne sans compte ». Dans « Partager avec », le destinataire est une ligne cochée et inactive (`.tick-row`, `aria-disabled`) avec `.share__hint` « Destinataire · Peut modifier ». Liste d'envies existante : une seule carte, inactive, et un `.field__hint`.
- Ligne d'un souhait : pastilles `.chip` de la priorité (celles des tâches), du prix et de la réservation (« Réservé par vous » ou « Réservé par vous et Marie » en `.chip--accent`, « Réservé par Marie, Paul et Léa » en `.chip`, puis « Ouvert à d'autres » en `.chip`), texte ET icône, jamais la couleur seule ; elles s'ajoutent au libellé lu par les lecteurs d'écran. Le bénéficiaire ne reçoit jamais ces données : la ligne est celle d'une liste de tâches sans option.
- Fiche d'un souhait : champs « Lien (facultatif) » et « Prix indicatif (facultatif) » (`.field`), bouton-lien « Ouvrir le lien » (`a.btn.btn--secondary.btn--sm`, `target="_blank"`, `rel="noopener noreferrer"`), bloc « Réservation » : `.field__value` (« Pas encore réservé » ou les participants), interrupteur « Ouvert à d'autres » dans une `.card` (`.toggle-row` + `.switch`, `role="switch"`, comme les options de liste), puis `.btn.btn--block` : `btn--primary` « Réserver » ou « Participer », `btn--secondary` « Quitter », `btn--danger-outline` « Libérer » ; pour le gestionnaire, une `.card.list-options` avec une ligne par participant et un `btn--danger-outline btn--sm` « Retirer » (`aria-label` « Retirer Marie ») ; 44 px au moins, avec `.field__hint` hors ligne et pour le rappel « Les réservations ne sont jamais montrées à … ».
- Zone du bas : « Reçus » (même composant que « Terminés »).

