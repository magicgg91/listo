# Listo — kit de design (HTML/CSS natifs)

Maquettes complètes : dans le canevas Design « Listo — maquettes ». Ce dossier contient ce qu'il faut pour les reprendre en code, sans framework ni bibliothèque d'icônes.

| Fichier | Rôle |
|---|---|
| `listo.css` | Variables de thème (clair, sombre, auto) et tous les composants. Les sections 1 à 16 (dont 16.5, zone des articles cochés) sont à reprendre telles quelles ; la section 17 (« Présentation des maquettes ») ne sert qu'aux planches et peut être supprimée. |
| `icons-sprite.html` | Sprite SVG de 40 icônes à coller une fois au début du `<body>`. Utilisation : `<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>`. |
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

## Ajout : bloc « À propos » (Réglages)

Une carte `.group` en deux zones `.row` séparées par un trait fin. Styles : section 16.6 de `listo.css` (variables existantes uniquement). Balisage : dernière partie de `components.html`. Aucune nouvelle icône. Aucune commande de serveur dans l'interface (elle reste dans `docs/exploitation.md`).

- `.row.about` (zone 1) : à gauche, `.row__title` « Version : » + lien `.about__link` sur les 7 caractères du commit (zone tactile de 44 px par marges négatives, sans agrandir la ligne) ; dessous, pour l'Admin, `.row__sub` « Vérifié il y a 15 min ». À droite, pour l'Admin, `.about__actions` : pastille d'état dans `.about__state` (`role="status"`) puis bouton-icône `.icon-btn.about__check` (`#i-sync`, `aria-label="Vérifier maintenant"`, 44 px ; pendant la vérification : `disabled` et `.is-busy`, l'icône tourne sauf mouvement réduit). Trop étroit (texte agrandi) : pastille et bouton passent sous la version, alignés à droite.
- Pastilles (`.chip` du kit) : `.chip--ok` « À jour » (`#i-check`) ; `.chip--accent` « Nouvelle : 7025130 » (`#i-alert`), toute la pastille est un lien `.about__chip-link` vers le commit (`aria-label="Nouvelle version disponible : 7025130, ouvrir sur GitHub"`, zone tactile étendue à 44 px) ; `.chip--neutral` « Vérification impossible » ou « Hors ligne ».
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
- La pastille reste un bouton « Actualiser » avec une zone tactile de 44 px de haut.

## Ajout : mode scan des listes de courses

Balisage : dernière partie de `components.html`. Aucun style nouveau : composants existants. **Nouvelle icône** du sprite : `i-barcode` (code-barres dans un cadre de visée, même trait que les autres), soit 40 icônes.

- Bouton « Scanner » : `.btn.btn--secondary.btn--icon` (52 px), `aria-label="Scanner un produit"`, entre le champ d'ajout et le bouton `+` de `.addbar`, dans les listes de courses seulement. Il ouvre une petite `.sheet` « Scanner un produit » avec deux `.btn--block` : « Prendre une photo » (`#i-camera`) et « Choisir une photo » (`#i-image`), les icônes de la photo d'un article.
- Feuille « Scanner un produit » (`.sheet`, qui défile si besoin) :
  - lecture et recherche : pastille `.sync.sync--busy` (« Lecture du code-barres… », « Recherche du produit… ») ;
  - produit trouvé : `.note` avec `#i-check`, champs `.field` « Nom » (modifiable) et « Note (facultative) » (« marque · format »), `.note` « Déjà dans la liste » (bouton « Ajouter quand même »), `.field__hint` « Données : Open Food Facts », `.sheet__actions` « Ajouter à la liste » / « Annuler » ;
  - code non lu, lecteur indisponible : `.note.note--danger`, « Prendre une photo » (`#i-camera`) et « Choisir une photo » (`#i-image`), « Saisir le code à la main » qui fait apparaître un champ `inputmode="numeric"` ;
  - nom introuvable : `.note`, « Taper le nom » ;
  - produit connu (déjà dans une de mes listes) : `.note` « Produit connu : <nom>. Vous pouvez corriger le nom avant de l'ajouter. » (`#i-check`), mêmes champs et boutons, sans la mention Open Food Facts ;
  - scan pour cocher : `.note` « Déjà dans la liste : <nom> » (`#i-alert`) puis `.sheet__actions` « Cocher (je l'ai pris) » (`.btn--primary`, `#i-check`), « Ajouter quand même », « Annuler » ; article coché : `.note` « Déjà coché : <nom> » (`#i-check`) et « Le remettre dans la liste » ;
  - après un ajout : la feuille se ferme, toast « Ajouté : … » ; l'article ajouté est brièvement mis en évidence dans la liste (`.item--added`, fond `--color-accent-soft` qui s'efface, dans `public/css/app.css`).

## Ajout : code-barres des articles (listes de courses)

Balisage : dernière partie de `components.html`. Aucun style nouveau, aucune nouvelle icône (`i-barcode` existe).

- Feuille de l'article, sous la note : `.field` « Code-barres » (`inputmode="numeric"`, aide « Chiffres sous les barres (8, 12 ou 13) »), puis `.photo-actions` avec « Scanner » (`#i-barcode` ; même feuille de choix « Prendre une photo » / « Choisir une photo » que le mode scan) et « Effacer » (grisé quand le champ est vide). Code invalide : `.field__error` « Code invalide : vérifiez les chiffres ». Un autre article de la liste porte le même code : `.note` d'avertissement (on prévient, on n'interdit pas).
- Mode scan : « Déjà dans la liste : « Lait demi-écrémé » a ce code-barres. » (même `.note`, bouton « Ajouter quand même »).
- La ligne de la liste ne change pas : le code n'y est pas affiché.

