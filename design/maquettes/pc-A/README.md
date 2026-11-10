# Listo : interface PC, disposition A (deux zones)

Commencer par `PROMPT.md`. Les écrans sont dans `captures/` (50 PNG, clair et sombre). Pour coller les styles dans le projet : `listo-pc-A.css` (section 16.8 de `design/listo.css`) et `icons-pc.svg.html` (sprite). `reference-A.html` montre le balisage de tous les écrans ; `shortcuts.example.js` donne la logique des raccourcis. `mockup-only.css` et les classes `.stage__*`, `.desk` ne vont pas en production. La version téléphone n'est pas modifiée.

## Correction du 10 novembre 2026 (Réglages)

Décision du propriétaire : sur ordinateur, les Réglages suivent le rangement du téléphone. Le thème (Clair, Sombre, Auto) et « Connexions Claude » sont seulement dans « Mon compte ». Dans `reference-A.html` (planche Réglages, clair et sombre), la section « Connexions Claude » et la ligne « Thème » sont retirées, et « Apparence et clavier » devient « Clavier » (« Raccourcis à une touche »). Même jour, deux autres décisions alignent les Réglages sur le téléphone : la ligne « Guide d'utilisation » de la rubrique « Aide » s'appelle « Aide », avec le sous-titre du téléphone (« Mode d'emploi de Listo »), et la phrase « Visible seulement pour les comptes Admin. » sous « Administration » est retirée. Les captures `captures/pc-A-08a-reglages-*.png`, dessinées avant, montrent encore l'ancien rangement : `reference-A.html` fait foi.
