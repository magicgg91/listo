# Listo — kit de design (HTML/CSS natifs)

Maquettes complètes : dans le canevas Design « Listo — maquettes ». Ce dossier contient ce qu'il faut pour les reprendre en code, sans framework ni bibliothèque d'icônes.

| Fichier | Rôle |
|---|---|
| `listo.css` | Variables de thème (clair, sombre, auto) et tous les composants. Les sections 1 à 16 (dont 16.5, zone des articles cochés) sont à reprendre telles quelles ; la section 17 (« Présentation des maquettes ») ne sert qu'aux planches et peut être supprimée. |
| `icons-sprite.html` | Sprite SVG de 35 icônes à coller une fois au début du `<body>`. Utilisation : `<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>`. |
| `maquettes/` | Captures PNG de tous les écrans et variantes, en clair et en sombre (`liste-1-clair.png`, `reglages-3-sombre.png`, etc.). Référence visuelle à comparer au rendu. |
| `components.html` | Référence : chaque composant en HTML, en thème clair puis sombre. Le balisage est celui des écrans. |
| `icones/icon.svg`, `icones/icon-maskable.svg` | Icône 512 × 512, fond plein cadre, logo entièrement dans la zone de sécurité de 80 %. |
| `icones/icon-512.png`, `icones/icon-192.png` | Exports PNG pour le manifeste PWA. |

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
- Boutons-icônes : `aria-label` obligatoire. Indicateur de synchro : `role="status"`.
- Pas de survol ni de geste caché : les actions secondaires passent par le menu « ⋮ ».

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

- Photo : `.item__photo` (miniature 48 px dans `.item`, bouton avec `aria-label="Agrandir la photo de …"`), `.photo` (image qui remplit son cadre), `.photo-actions` (Appareil photo / Galerie), `.photo-block` + `__thumb` + `__actions` (aperçu, Remplacer, Retirer), `.lightbox` + `__bar | __title | __stage | __img | __cap | __foot` (photo plein écran, fond sombre dans les deux thèmes), `.sheet--scroll`.
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
