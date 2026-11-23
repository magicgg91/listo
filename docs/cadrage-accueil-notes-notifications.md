# Listo : Accueil, Notes et page Notifications (cadrage, sans code)

Document de conception rédigé le 23 novembre 2026, à partir des demandes et des choix du propriétaire. Il ne contient aucun code et ne change rien à l'application : il sert à décider. Rien ne sera construit avant sa validation et celle des maquettes (`design/accueil-notes/`). Une fois construit, chaque point rejoindra le texte du cahier des charges (Fonctionnalités, Écrans, Modèle de données, Sécurité).

**Choix du propriétaire (23 novembre 2026)**

- Bandeau du bas à cinq boutons : Accueil · Échéances · Listes · Notes · Réglages, sur tous les écrans qui l'ont aujourd'hui, **sauf l'Accueil** : ses tuiles mènent déjà partout.
- Catégories des notes propres à chaque personne : chacun range toutes les notes qu'il voit (les siennes et celles qu'on lui partage) dans ses propres catégories.
- Une note supprimée garde sa catégorie : dans la corbeille, elle n'apparaît plus et n'est plus comptée dans sa catégorie ; restaurée, elle retrouve sa catégorie.
- « Listes » partout, jamais « Mes listes » (bandeau, menu de gauche, titre de l'écran, aide) ; ordre Accueil, Échéances, Listes, Notes partout (bandeau du téléphone, menu de l'ordinateur).
- Sur ordinateur, le menu de gauche suit l'écran : les entrées fixes seules sur l'Accueil, Échéances et Réglages ; les types de listes sur les écrans des listes ; les catégories sur les écrans des notes.
- Le nombre de notifications non lues n'est que sur la cloche (pas dans la tuile Compte).
- Page Notifications : ce qui m'est adressé (jamais ce que mes actions ont envoyé aux autres).
- Texte des notes : texte simple (retours à la ligne gardés, adresses web cliquables), sans mise en forme.

## Sommaire

1. [Navigation](#1-navigation)
2. [Accueil](#2-accueil)
3. [Notes](#3-notes)
4. [Page Notifications](#4-page-notifications)
5. [Modèle de données](#5-modèle-de-données)
6. [Sécurité et menaces](#6-sécurité-et-menaces)
7. [Tests prévus](#7-tests-prévus)
8. [Découpage en étapes](#8-découpage-en-étapes)
9. [Maquettes](#9-maquettes)
10. [Décisions qui restent](#10-décisions-qui-restent)

## 1. Navigation

- **Téléphone** : le bandeau du bas en verre (décision du 11 novembre 2026) passe de trois à cinq boutons, toujours à la même place, toute la largeur, dans cet ordre : **Accueil** (icône maison), **Échéances**, **Listes**, **Notes** (nouvelle icône « note »), **Réglages**. **« Listes » partout** (choix du propriétaire du 23 novembre 2026) : l'écran « Mes listes » s'appelle désormais « Listes » (titre, bandeau, menu de l'ordinateur, aide, en anglais « Lists »). Libellés courts sous chaque icône, zones tactiles d'au moins 44 px, bouton de l'écran ouvert mis en avant comme aujourd'hui. **Pas de bandeau sur l'Accueil** (choix du propriétaire du 23 novembre 2026) : ses tuiles mènent déjà à tout (Listes, Notes, Échéances, Notifications, Mon compte, Réglages) ; on revient à l'Accueil par le bouton « Accueil » du bandeau des autres écrans.
- **Premier écran** : l'Accueil (`#/accueil`) à l'ouverture de l'application et après la connexion ; une adresse vide ou inconnue mène à l'Accueil (aujourd'hui « Mes listes »). Un lien direct (liste, note, autorisation d'un assistant IA, notification touchée) ouvre toujours directement son écran.
- **Loupe ronde** : sur Listes, Notes et Échéances comme aujourd'hui pour les écrans qui ont une recherche ; jamais sur l'Accueil (rien à chercher) ni sur la page Notifications.
- **Ordinateur** (à partir de 1 024 px) : le menu de gauche commence par quatre entrées fixes, dans le même ordre que le bandeau : « Accueil », « Échéances » (pastille), « Listes » (nombre de listes), « Notes » (nombre de notes). **Dessous, le menu suit l'écran** (choix du propriétaire du 23 novembre 2026) : sur les écrans des notes (Notes, une note, corbeille des notes), seulement « Catégories » : mes catégories avec leur nombre de notes (« Sans catégorie » en dernier, point des nouveautés), et le bouton du bas devient « Nouvelle note » (touche N) ; sur les écrans des listes (Listes, une liste), **même règle** : seulement « Types » (Courses, Tâches, Envies, avec leur nombre de listes et le point des nouveautés), le type choisi montrant au centre seulement ses listes (titre « Courses », « 3 listes · 2 partagées »), **sans le filtre Toutes / Courses / Tâches / Envies** en haut sur ordinateur, avec le seul bouton « Nouvelle liste » en bas du menu ; une liste ouverte met en avant son type. Les listes ne sont donc plus nommées une à une dans le menu (on passe d'une liste à l'autre par son type). Sur les autres écrans (Accueil, Échéances, Réglages…) : **seulement les quatre entrées fixes** (choix du propriétaire du 23 novembre 2026), avec « Nouvelle liste » en bas. Toucher une catégorie montre au centre **seulement les notes de cette catégorie** (titre : son nom, « 2 notes · 1 partagée » ; la recherche cherche dans cette catégorie ; une nouvelle note y est rangée) ; l'entrée fixe « Notes » montre toutes les notes. **Pas de pastilles de catégories au-dessus des cartes sur ordinateur** (elles restent sur le téléphone), ni de second bouton « Nouvelle note » en haut : celui du bas du menu suffit. La cloche des notifications est dans l'en-tête de l'Accueil, comme sur le téléphone. Le téléphone ne change pas au-delà de ce qui est décrit ici (captures avant/après expliquées).

## 2. Accueil

**But** : voir d'un coup d'œil ce qui attend, sans arriver directement sur les listes.

**En-tête** (fixe, seule la zone en dessous défile)

- « Bonjour <prénom> » en grand et, dessous, la date du jour (« Lundi 23 novembre »), dans la langue du compte.
- À droite : la pastille d'état habituelle (« À jour », « Synchronisation… », « Hors ligne · N en attente » ; un appui synchronise), puis la cloche (bouton-icône « Notifications », avec une pastille du nombre non lu, « 9+ » au-delà de 9 ; `aria-label` « Notifications, 3 non lues »).

**Tuiles** (cartes du kit de design, deux colonnes sur le téléphone, de même hauteur dans une rangée ; une colonne sous 340 px de large)

| Tuile | Contenu | Au toucher |
| --- | --- | --- |
| **Échéances** (icône calendrier) | Trois lignes : « En retard » (pastille rouge), « Aujourd'hui » (pastille verte), « Plus tard » (pastille grise), chacune avec son nombre de tâches. Mêmes tâches et même filtre (« Toutes » / « Les miennes ») que l'écran Échéances. Aucune tâche avec échéance : « Aucune échéance ». | Une ligne ouvre Échéances à la bonne section ; le titre ouvre Échéances. |
| **Listes** (icône des listes) | Une ligne par type que la personne a (Courses, Tâches, Envies), avec le nombre de listes ; un point de couleur si une liste de ce type a des nouveautés. Aucune liste : « Aucune liste » et « Nouvelle liste ». | Une ligne ouvre « Listes » filtrée sur ce type (filtre retenu comme aujourd'hui). |
| **Notes** (icône note) | Le nombre de notes (« 12 notes »), les titres des deux dernières modifiées, et le bouton « Nouvelle note » (« + »). Aucune note : « Aucune note ». | Une note l'ouvre ; « Nouvelle note » ouvre la saisie rapide ; le titre ouvre l'écran Notes. |
| **Compte** (icône personne) | « Mon compte », « Notifications », « Réglages » (le nombre non lu n'est que sur la cloche, pour ne pas le répéter) ; pour l'Admin seulement, « Demandes de compte » avec leur nombre quand il y en a en attente (LISTO_OIDC=on). | Ouvre l'écran correspondant. |

- Ordre fixe : Échéances et Listes en haut, Notes et Compte dessous (comme l'exemple montré par le propriétaire). Pas de tuile cachée ni déplaçable pour l'instant (voir « Décisions qui restent »).
- Les nombres viennent de la copie locale (aucune demande de plus au serveur) : l'Accueil s'affiche hors ligne et se met à jour en temps réel comme le reste.
- Rien qui vienne d'Internet (pas de météo) : la règle « aucune donnée envoyée ailleurs que sur votre serveur » ne change pas.
- Une ligne de tuile est un vrai bouton (44 px), lue par VoiceOver avec son nombre (« En retard, 13 tâches »).

**Saisie rapide d'une note** (bouton « Nouvelle note » de la tuile)

- Feuille qui monte du bas (fenêtre centrée sur ordinateur) : titre « Nouvelle note », champ « Titre (facultatif) », grand champ de texte, choix de la catégorie en pastilles (« Sans catégorie » par défaut), boutons « Enregistrer » et « Annuler ».
- Proposé : le curseur va dans le champ de texte à l'ouverture, car le geste a pour but d'écrire (même exception que la loupe ; voir « Décisions qui restent »).
- « Enregistrer » est grisé tant que le titre et le texte sont vides. Hors ligne : la note est créée sur le téléphone et envoyée au retour du réseau.

**Ordinateur** : mêmes tuiles sur trois colonnes (quatre au-delà de 1 440 px), la tuile Notes montrant jusqu'à quatre notes.

## 3. Notes

### 3.1 Ce qu'est une note

- Un type à part entière, à côté des listes, avec son écran « Notes » (`#/notes`) et son écran de note (`#/notes/<id>`).
- Une note a : un titre facultatif (120 caractères au plus), un texte (20 000 caractères au plus), un propriétaire, des personnes avec qui elle est partagée, et, **pour chaque personne qui la voit**, une catégorie et une épingle.
- Texte simple : affiché tel quel, retours à la ligne gardés ; les adresses `https://…` et `http://…` deviennent des liens (ouverts dans un nouvel onglet, `rel="noopener noreferrer"`), construits par `textContent` et des éléments `<a>`, jamais par `innerHTML`.
- Sans titre, la carte et l'écran montrent la première ligne du texte (« Note sans titre » si le texte est vide).

### 3.2 Écran « Notes »

- **Barre du haut** : titre « Notes », pastille d'état, bouton « Corbeille » (icône poubelle, avec le nombre de notes dans la corbeille s'il y en a), menu ⋮ (« Catégories », « Trier »).
- **Pastilles de catégories** sous la barre, qui défilent de côté : « Toutes » (par défaut), chaque catégorie avec son nombre, « Sans catégorie ». Le choix est retenu sur l'appareil.
- **Recherche** : la loupe ronde ouvre le champ sous le titre ; elle cherche dans les titres et les textes de la catégorie choisie (« Rechercher dans les notes »).
- **Cartes** : les notes épinglées d'abord (petite épingle), puis les autres, les plus récemment modifiées d'abord (« Trier » propose aussi « Ordre alphabétique »). Chaque carte : titre (ou première ligne), deux ou trois lignes du texte, catégorie, « il y a 2 h », pastilles des personnes si elle est partagée, œil « Lecture seule » si je ne peux pas la modifier (comme les cartes de listes), et la pastille des nouveautés si quelqu'un d'autre l'a modifiée depuis ma dernière lecture.
- **« + » dans la barre du haut** pour « Nouvelle note », comme le « + » de « Listes » (bouton rond plein, à droite ; pas de gros bouton en bas : choix du propriétaire du 23 novembre 2026).
- **Menu d'une carte** (⋮, appui long, clic droit sur ordinateur) : Épingler / Désépingler, Catégorie…, Partager (propriétaire) ou Personnes, Dupliquer, Quitter la note (si on me l'a partagée), Supprimer (propriétaire).
- **Vide** : « Aucune note » avec une phrase d'aide et « Nouvelle note » ; catégorie vide : « Aucune note dans « Recettes » ».

### 3.3 Écran d'une note

- Barre du haut : retour, catégorie (bouton qui ouvre le choix), « Partager » (propriétaire) ou « Personnes », menu ⋮ (Épingler, Dupliquer, Lien public, Quitter, Supprimer).
- Champ titre puis grand champ de texte, sans cadre, qui occupe l'écran ; aucun curseur mis tout seul à l'ouverture d'une note existante.
- **Enregistrement automatique** : une seconde après la dernière frappe, en quittant l'écran, et quand l'application passe en arrière-plan. Une mention discrète sous la barre dit « Enregistré », « Enregistrement… » ou « Hors ligne · enregistrée sur ce téléphone ». Pas de bouton « Enregistrer ».
- **Lecture seule** (droit « Lecture seule » ou note d'un autre dans la corbeille) : texte non modifiable, liens cliquables ; on peut quand même choisir sa catégorie et épingler (ce sont mes réglages à moi).
- **Bas de la note** : « Modifiée par Léa · il y a 5 min » (jamais l'identité d'un visiteur, il n'y en a pas : le lien public est en lecture seule).

### 3.4 Deux personnes qui écrivent en même temps

Une note est un seul bloc de texte : on ne peut pas fusionner deux textes sans risquer de perdre des mots. Règle proposée :

- Chaque note a un numéro de version. Chaque enregistrement envoie le texte complet et la version sur laquelle il a été écrit.
- Si le serveur a déjà une version plus récente (quelqu'un d'autre a enregistré entre-temps), il **n'écrase rien** : il refuse et renvoie la version actuelle.
- Le téléphone garde mon texte et montre un choix : « Garder la mienne » (elle remplace la leur), « Prendre la leur » (la mienne est abandonnée, avec confirmation), « Garder les deux » (la mienne devient une nouvelle note à moi, « <titre> (copie) », dans ma catégorie). Tant que je n'ai pas choisi, mon texte reste sur le téléphone et la note est marquée « À vérifier ».
- Hors ligne : mes enregistrements attendent dans la file habituelle ; si la note a changé entre-temps, le même choix apparaît au retour du réseau, la prochaine fois que j'ouvre la note (et la pastille d'état le signale).
- Si je lis la note sans l'avoir modifiée, elle se met à jour en direct (temps réel). Si je suis en train d'écrire quand quelqu'un d'autre enregistre, un bandeau « Léa vient de modifier cette note » prévient tout de suite ; le choix se fait à mon prochain enregistrement.
- Les modifications de catégorie et d'épingle ne sont jamais en conflit : elles sont à moi seul.

### 3.5 Catégories

- **À chaque personne** : je crée mes catégories (40 caractères au plus, 50 catégories au plus, noms uniques chez moi sans tenir compte des majuscules) et j'y range toutes les notes que je vois. Les autres ne voient jamais mes catégories, ni comment j'ai rangé une note partagée.
- **Une catégorie par note**, ou « Sans catégorie ». Une note qu'on vient de me partager arrive « Sans catégorie ».
- **Gérer** (menu ⋮ › « Catégories ») : liste de mes catégories avec leur nombre de notes, « Nouvelle catégorie », renommer, changer l'ordre (même composant « Réordonner » que les sous-tâches), supprimer avec confirmation (« Les 4 notes de « Recettes » passent dans « Sans catégorie ». Aucune note n'est supprimée. »).
- **Corbeille** : une note supprimée **garde sa catégorie** (chez chacun) ; tant qu'elle est dans la corbeille, elle n'apparaît plus dans cette catégorie et n'y est plus comptée ; restaurée, elle y retrouve sa place. Si la catégorie a été supprimée entre-temps, la note restaurée revient « Sans catégorie ».
- Hors ligne : créer, renommer, classer fonctionne et attend la file comme le reste.

### 3.6 Partage

Identique aux listes, avec les mêmes écrans et les mêmes mots :

- Le **propriétaire** partage avec des comptes existants, en « Peut modifier » ou « Lecture seule », change ce droit, retire une personne. Une personne qui perd l'accès perd aussi son rangement (catégorie, épingle) de cette note.
- « **Peut modifier** » : modifier le titre et le texte. Jamais supprimer la note, la partager ni gérer son lien public.
- « **Lecture seule** » : lire, classer, épingler pour soi.
- Chacun, sauf le propriétaire, peut **Quitter la note**.
- **Dupliquer** : crée une note à moi, non partagée, avec le même titre (« (copie) ») et le même texte, dans ma catégorie.
- Notification de la catégorie « Partage » à la personne ajoutée (« Léa a partagé la note « Vacances » avec vous »).

### 3.7 Lien public d'une note

Mêmes possibilités et mêmes règles que le lien public d'une liste (étape 10) :

- créé, changé et arrêté par le propriétaire seulement ; durée en heures, en jours ou illimitée ; mot de passe généré facultatif, affiché une seule fois ; 5 essais au plus ;
- jeton jamais écrit en clair en base ni dans les journaux ; expiration contrôlée par le serveur à chaque demande ;
- page publique en **lecture seule** : titre, texte (liens cliquables) et date de modification ; jamais les catégories, les épingles, les noms des personnes ni le propriétaire ; réponse construite champ par champ ;
- note mise à la corbeille ou supprimée : le lien ne mène plus à rien (« Lien expiré ou inexistant », la même page que pour une liste, quelle que soit la raison) ; restaurée, le lien remarche s'il n'a pas expiré.

### 3.8 Corbeille des notes

- **Ouverte depuis l'écran Notes** (bouton poubelle de la barre du haut), et non depuis les Réglages comme celle des listes ; adresse `#/notes/corbeille`.
- Chacun n'y voit **que ses notes** (dont il est propriétaire), supprimées depuis moins de 30 jours ; jamais celles des autres, pas même l'Admin.
- Chaque ligne : titre (ou première ligne), catégorie gardée, « Supprimée le 21 novembre · encore 28 jours », « partagée avec 2 personnes » s'il y a lieu ; « Restaurer » et « Supprimer définitivement » (confirmation) ; en haut, « Vider la corbeille » (confirmation avec le nombre).
- Supprimer une note (propriétaire) : confirmation « Supprimer la note « Vacances » ? Elle disparaît pour tout le monde. Vous pourrez la restaurer pendant 30 jours depuis la corbeille des notes. » La note disparaît pour tous ses membres ; restaurée, elle revient pour eux, avec leur rangement.
- Au-delà de 30 jours, effacement définitif par le ménage nocturne (comme les listes). Hors ligne : supprimer et restaurer passent par la file d'attente.

### 3.9 Nouveautés et notifications

- **Nouveautés** : une note partagée modifiée par quelqu'un d'autre depuis ma dernière lecture porte une pastille sur sa carte (et sur la tuile Notes de l'Accueil, et dans le menu de gauche sur ordinateur). L'ouvrir vaut « lue » sur tous mes appareils. Même réglage « Nouveautés » que les listes ; sourdine par note dans son menu (« Masquer les nouveautés de cette note »).
- **Notifications** : catégorie « Modifications » (« Léa a modifié la note « Vacances » », regroupées : une seule notification par note et par quart d'heure), catégorie « Partage » ; « Couper les notifications de cette note » dans son menu. Les réglages, le contenu neutre par défaut et le plafond de 30 par heure ne changent pas.

### 3.10 Limites et hors périmètre

- 20 000 caractères par note, 120 pour le titre ; 2 000 notes par personne (corbeille comprise) ; 50 catégories par personne.
- Pas de mise en forme, pas de photo, pas de case à cocher dans une note (une liste de tâches sert à cela).
- **Assistants IA (MCP)** : les notes ne leur sont pas ouvertes pour l'instant (à décider plus tard, avec ses règles : données et jamais consignes).
- L'Admin ne voit jamais les notes des autres. Un compte supprimé (seul cas permis : compte jamais utilisé) n'a pas de note.
- Les notes sont dans la base : la sauvegarde nocturne les couvre déjà.

## 4. Page Notifications

**But** : retrouver tout ce que Listo m'a signalé, même si je n'ai pas vu (ou pas reçu) la notification du téléphone.

**Ouverture** : la cloche de l'Accueil, la ligne « Notifications » de la tuile Compte, ou le raccourci `#/notifications` (la page des réglages reste « Réglages › Notifications », `#/reglages/notifications`).

**Ce qu'elle montre** : ce qui m'est adressé, dans les mêmes catégories que les notifications push :

| Catégorie | Exemples |
| --- | --- |
| Échéances | résumé du matin (« 3 tâches à faire aujourd'hui · 1 en retard »), rappel d'une tâche (« Dentiste à 9:15 ») |
| Modifications | « Léa a ajouté 4 articles dans Courses », « Léa vous a attribué « Tondre » », « C'est votre tour : Poubelles », « Léa a modifié la note « Vacances » » |
| Envies | ce que la catégorie « Envies » signale aujourd'hui (jamais au bénéficiaire, voir plus bas) |
| Partage | « Léa a partagé la liste « Courses » avec vous », « … la note « Vacances » … » |

- **Indépendante des notifications du téléphone** : elle se remplit même sans appareil inscrit et même si le serveur n'envoie aucune notification push (LISTO_PUSH absent) ; rien n'est envoyé ailleurs que sur votre serveur pour la remplir. Le résumé du matin et les rappels sont donc calculés aussi sans LISTO_PUSH.
- **Même filtre que les notifications push** : une catégorie coupée dans Réglages › Notifications, ou une liste (ou une note) dont j'ai coupé les notifications, n'apparaît pas non plus dans la page. Proposé : un seul jeu de réglages pour les deux, pour ne pas multiplier les interrupteurs.
- **Toujours le détail** dans la page (nom de la liste, de la tâche, de la personne), puisqu'on est connecté ; le contenu neutre par défaut ne concerne que l'écran verrouillé du téléphone.
- **Regroupées par jour** (« Aujourd'hui », « Hier », puis « Lundi 16 novembre »), la plus récente en haut. Chaque ligne : icône de la catégorie, texte, heure, point de couleur si non lue. Les modifications rapprochées d'une même liste se regroupent en une ligne qui se met à jour (« Léa a ajouté 4 articles dans Courses »), comme les notifications push.
- **Toucher une ligne** ouvre la liste, la tâche (fiche), la note ou l'écran concerné, et la marque lue. Une cible qui n'existe plus (liste supprimée, partage retiré) : « Cette liste n'est plus disponible ».
- **Lu / non lu** : la pastille de la cloche compte les non lues ; ouvrir la page ne marque rien tout seul (sauf choix contraire, voir « Décisions qui restent ») ; « Tout marquer comme lu » en haut ; lu sur un appareil = lu sur tous.
- **Effacer** : glisser une ligne vers la gauche (raccourci) ou son menu, et « Tout effacer » (confirmation). Gardées **30 jours**, 300 au plus par personne (les plus anciennes partent).
- **Envies (règle critique)** : le bénéficiaire ne reçoit jamais, dans la page non plus, rien d'une réservation, d'une participation, ni des ajouts des autres dans sa liste ; les destinataires viennent toujours de `server/reservations.js` ; le test « identique avec ou sans réservation » compare aussi la page.
- **Hors ligne** : la page montre la dernière copie reçue ; « Tout marquer comme lu » et « Effacer » attendent la file.
- **Langue** : chaque ligne est gardée comme un nom de texte et ses valeurs, et affichée dans la langue du compte au moment de la lecture (changer de langue traduit aussi l'historique).

## 5. Modèle de données

Une migration par étape (numéros donnés à la construction). Mêmes conventions que l'existant (UUID pour les objets créés hors ligne, dates ISO, `ON DELETE CASCADE` vers users).

| Table | Colonnes proposées |
| --- | --- |
| notes | id (UUID), owner_id, title (120 au plus), body (20 000 au plus), version (entier, +1 à chaque enregistrement du texte), created_at, updated_at, updated_by, deleted_at, deleted_by |
| note_members | note_id, user_id, access ('modification' ou 'lecture', comme list_members) ; le propriétaire n'y figure pas |
| note_categories | id (UUID), user_id, name (40 au plus, unique par personne sans tenir compte des majuscules), position |
| note_user_state | note_id, user_id, category_id (facultatif, gardé pendant la corbeille), pinned, last_read_version, muted_news, muted_push ; une ligne par personne qui voit la note |
| note_public_shares | comme public_shares (empreinte du jeton, mot de passe haché, expiration, essais), pour une note |
| inbox | id, user_id, category, text_key, params (JSON construit champ par champ), target_type ('list', 'item', 'note', 'deadlines', 'share'), target_id, group_key, count, created_at, updated_at, read_at ; 30 jours, 300 par personne |

Les opérations hors ligne (`note.create`, `note.update` avec la version de départ, `note.delete`, `note.restore`, `note.classify`, `note.pin`, `category.*`) suivent la file d'attente actuelle (applied_ops, sans doublon).

## 6. Sécurité et menaces

- **Droits vérifiés par le serveur à chaque demande** : propriétaire, « Peut modifier », « Lecture seule », non-membre (404, comme une note inconnue), note dans la corbeille (seul le propriétaire la voit, dans la corbeille).
- **Catégories et rangement** : jamais transmis à une autre personne ; une demande qui vise la catégorie d'un autre répond comme une catégorie inconnue.
- **Texte** : affiché par `textContent` ; liens limités à `http:` et `https:` (jamais `javascript:` ni `data:`), reconnus par une règle simple et testée ; CSP inchangée.
- **Lien public** : mêmes règles que les listes (voir 3.7) ; la réponse ne contient que le titre, le texte et la date.
- **Page Notifications** : textes construits côté serveur par nom de texte et valeurs relues au moment de l'envoi (jamais une valeur que l'utilisateur n'a pas le droit de voir) ; une cible ouverte est revérifiée par les droits habituels.
- **Envies** : voir 4 ; aucune trace d'une réservation dans `inbox` du bénéficiaire.
- **Taille** : refus au-delà des limites (413 ou 400 nommé), plafond de débit des enregistrements (une note tapée vite envoie au plus un enregistrement par seconde et par appareil).
- **Journal de sécurité** (en anglais) : partage et lien public d'une note (`note_shared`, `note_link_created`…), jamais le texte d'une note.

## 7. Tests prévus

- Droits des notes : propriétaire, « Peut modifier », « Lecture seule », non-membre, Admin, corbeille, quitter, retrait d'une personne.
- Catégories : propres à chaque personne (Léa ne voit jamais celles de Guillaume), suppression d'une catégorie, note supprimée gardant sa catégorie puis restaurée à sa place, nombre par catégorie sans les notes de la corbeille.
- Conflit : deux enregistrements sur la même version, l'un gagne, l'autre reçoit la version actuelle ; « Garder les deux » ; hors ligne puis retour du réseau sans perte ni doublon.
- Lien public d'une note : expiré, mot de passe, 5 essais, corbeille, réponse champ par champ.
- Liens dans le texte : `javascript:`, `data:`, adresses mal formées jamais cliquables.
- Page Notifications : remplie sans LISTO_PUSH, filtre des catégories et sourdines, regroupement, lu sur tous les appareils, 30 jours / 300, langue du compte, « identique avec ou sans réservation » pour le bénéficiaire.
- Accueil : nombres égaux à ceux des écrans Échéances, Listes et Notes ; hors ligne ; Admin seulement pour « Demandes de compte ».
- Bandeau à cinq boutons (absent de l'Accueil), premier écran, ancien lien `#/listes` intact ; curseur automatique (`test/focus.test.js`) ; textes en français et en anglais, aide dans les deux langues.

## 8. Découpage en étapes

Chaque étape est validée avant la suivante. **Livraison** (choix du propriétaire du 23 novembre 2026) : les quatre étapes sont poussées sur `dev` sans PR, validées sur les captures envoyées (et, si le propriétaire le veut, avec `docker-compose.dev.yml`) ; une seule PR `dev` → `main` à la fin, quand il le dira.

1. **Accueil et navigation** : écran Accueil (tuiles Échéances, Listes, Compte ; tuile Notes prévue mais masquée ; cloche masquée jusqu'à l'étape 4), bandeau dans l'ordre Accueil, Échéances, Listes, Réglages (Notes ajouté à l'étape 2), absent de l'Accueil ; « Mes listes » devient « Listes » ; premier écran ; menu de gauche de l'ordinateur qui suit l'écran (sans le filtre des types).
2. **Notes, socle** (migration 36) : notes, écran Notes et écran d'une note, enregistrement automatique, conflits, hors ligne, temps réel, catégories, corbeille ; tuile Notes et bouton Notes du bandeau.
3. **Notes, partage** (migration 37) : partage, droits, Nouveautés, notifications, lien public et page publique.
4. **Page Notifications** (migration 38) : historique, cloche, regroupement, lu / non lu, résumé et rappels sans LISTO_PUSH.
5. **Aide et documents** : chapitres de l'aide en français et en anglais, guide, site, README, cahier des charges (à chaque étape pour ce qui la concerne).

## 9. Maquettes

Dans `design/accueil-notes/` (`README.md`, pages de référence, styles des nouveaux composants, `captures/`), en clair et en sombre, au format des maquettes existantes (téléphone 390 px de large ; ordinateur 1 440 px) :

| Fichier | Écran |
| --- | --- |
| accueil-1 | Accueil, avec des échéances, des listes, des notes et des notifications non lues |
| accueil-2 | Accueil d'un nouveau compte (tuiles vides) |
| accueil-3 | Saisie rapide « Nouvelle note » |
| notes-1 | Écran Notes : pastilles de catégories, notes épinglées et autres, une partagée en lecture seule, nouveautés |
| notes-2 | Catégories (gérer) |
| notes-3 | Corbeille des notes |
| note-1 | Écran d'une note (enregistrée, partagée) |
| note-2 | Conflit : « Léa a modifié cette note » et le choix Garder la mienne / Prendre la leur / Garder les deux |
| notifications-1 | Page Notifications (Aujourd'hui, Hier, non lues) |
| notifications-2 | Page Notifications vide |
| pc-accueil-1 | Accueil sur ordinateur, menu de gauche avec Accueil et Notes |
| pc-notes-1 | Notes sur ordinateur (menu de gauche : les catégories et leur nombre à la place des listes, « Voyages » choisie, « Nouvelle note » en bas ; au centre, seulement les notes de « Voyages », sans pastilles de catégories ; note ouverte) |
| pc-listes-1 | Listes sur ordinateur, mêmes règles (menu de gauche : les types et leur nombre, « Courses » choisi ; au centre, seulement les listes de courses, sans filtre ; « Nouvelle liste » seulement en bas du menu) |

Les nouveaux composants (tuile, ligne de tuile avec nombre, carte de note, pastilles de catégories, ligne de notification, cloche avec pastille) sont dans `design/accueil-notes/listo-accueil-notes.css` (sections 16.19 à 16.27) et les icônes manquantes (« note », « épingle ») dans `design/accueil-notes/icons-nouvelles.svg.html` ; ils rejoindront `design/listo.css`, `design/components.html` et le sprite à la construction. Les choix faits en dessinant (en-tête, boutons, emplacement de « Nouvelle note »…) et les points à trancher sont dans `design/accueil-notes/README.md`.

## 10. Décisions prises le 23 novembre 2026

Le propriétaire a validé les propositions :

1. **Curseur dans « Nouvelle note »** : oui, le curseur va dans le texte quand on touche « Nouvelle note » (geste fait pour écrire, comme la loupe) ; ajouté aux exceptions de `test/focus.test.js`.
2. **Ouvrir la page Notifications** ne marque rien comme lu : on marque en touchant une ligne ou « Tout marquer comme lu ».
3. **Réglages communs** à la page et au téléphone : une catégorie coupée, ou une liste ou une note dont on a coupé les notifications, disparaît des deux.
4. **Tuiles** : ni cachables ni déplaçables pour l'instant.
5. **Notes et assistants IA (MCP)** : plus tard.
