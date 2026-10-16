# Listo — kit de design (HTML/CSS natifs)

Maquettes complètes : dans le canevas Design « Listo — maquettes ». Ce dossier contient ce qu'il faut pour les reprendre en code, sans framework ni bibliothèque d'icônes.

| Fichier | Rôle |
|---|---|
| `listo.css` | Variables de thème (clair, sombre, auto) et tous les composants. Les sections 1 à 15 sont à reprendre telles quelles ; la section 16 (« Présentation des maquettes ») ne sert qu'aux planches et peut être supprimée. |
| `icons-sprite.html` | Sprite SVG de 28 icônes à coller une fois au début du `<body>`. Utilisation : `<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>`. |
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
