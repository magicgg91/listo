// Contenu de la page « Aide » (écran help.js). Tout le texte d'aide est ici,
// et seulement ici : sections, titres, paragraphes, rôles concernés. Une
// évolution qui change un droit ou un écran met ce fichier à jour (voir
// docs/developpement.md).
//
// Vocabulaire (le même que dans l'application) :
// - propriétaire : la personne qui a créé la liste ;
// - contributeur : un compte avec le droit « Peut modifier » sur la liste ;
// - invité : une personne qui ne peut que lire (un compte « Lecture seule »,
//   ou une personne sans compte qui ouvre le lien public) ;
// - Admin : compte administrateur.
//
// Ce module ne touche pas à l'écran : il est testé automatiquement
// (test/help.test.js). Les libellés de boutons cités entre « » existent
// dans l'interface (le test le vérifie).

// Colonnes du tableau « Qui peut quoi »
export const ROLES = [
  { key: 'owner', label: 'Propriétaire' },
  { key: 'contributor', label: 'Contributeur' },
  { key: 'guest', label: 'Invité' },
  { key: 'admin', label: 'Admin' },
];

// Lignes du tableau : une action principale, et les rôles qui peuvent la faire
export const PERMISSIONS = [
  { action: 'Voir la liste et ses articles', roles: ['owner', 'contributor', 'guest'] },
  { action: 'Cocher, ajouter, modifier ou supprimer des articles, ajouter une photo', roles: ['owner', 'contributor'] },
  { action: 'Créer un magasin ou un rayon manquant', roles: ['owner', 'contributor', 'admin'] },
  { action: 'Dupliquer la liste', roles: ['owner', 'contributor'] },
  { action: 'Réserver un souhait (liste d\'envies), sauf la personne à qui la liste est destinée', roles: ['owner', 'contributor', 'guest'] },
  { action: 'Modifier la liste (titre, type, magasin, icône, options)', roles: ['owner'] },
  { action: 'Partager la liste et choisir le droit de chaque personne', roles: ['owner'] },
  { action: 'Créer un lien public', roles: ['owner'] },
  { action: 'Supprimer la liste', roles: ['owner'] },
  { action: 'Quitter la liste', roles: ['contributor', 'guest'] },
  { action: 'Gérer les comptes, les magasins, les rayons et les articles', roles: ['admin'] },
];

export const PERMISSIONS_NOTE = 'Un invité peut avoir un compte (droit « Lecture seule » sur la liste) ou ouvrir le lien public sans compte : dans les deux cas, il ne fait que lire. « Quitter la liste » demande un compte. L\'Admin ne voit pas le contenu des listes des autres. Dans une liste d\'envies, la personne à qui la liste est destinée ne voit jamais les réservations, même si elle en est la propriétaire.';

// Sections, dans l'ordre de la page. adminOnly : affichée aux seuls comptes
// Admin. Chaque section a des sujets : un titre, des paragraphes, une liste
// à puces facultative, puis des paragraphes de fin facultatifs (after).
export const SECTIONS = [
  {
    id: 'tous',
    title: 'Pour tout le monde',
    topics: [
      {
        title: 'Articles et éléments',
        paragraphs: ['Dans une liste de courses, chaque ligne est un « article ». Dans une liste de tâches, c\'est un « élément ». Dans une liste d\'envies, c\'est un « souhait ». Le fonctionnement est le même.'],
      },
      {
        title: 'Créer une liste',
        paragraphs: ['Sur « Mes listes », touchez « Nouvelle liste ». Donnez un titre, choisissez le type de liste (« Courses », « Tâches » ou « Envies ») et une icône.'],
        items: [
          'Liste de courses : choisissez aussi le magasin. Les articles sont classés par rayon, ou par magasin pour un magasin « Multi ».',
          'Liste de tâches : « Options des éléments » active la priorité et l\'échéance.',
          '« Après l\'ajout » (toutes les listes) : « Rester sur la liste » pour enchaîner les ajouts, ou « Ouvrir la fiche » pour compléter aussitôt ce qui vient d\'être ajouté. Au départ : « Rester sur la liste » pour une liste de courses, « Ouvrir la fiche » pour les autres.',
          'Si le magasin ou le rayon manque, « Nouveau magasin… » ou « Nouveau rayon… » le crée (connexion nécessaire).',
        ],
      },
      {
        title: 'Listes d\'envies et réservations',
        paragraphs: ['Une liste d\'envies rassemble des idées de cadeaux pour une personne. Ses proches peuvent réserver un souhait pour éviter d\'offrir deux fois la même chose. La surprise est préservée : la personne à qui la liste est destinée ne voit jamais qu\'un souhait est réservé, ni par qui, ni combien.'],
        items: [
          '« Pour qui ? » se choisit à la création : « Moi », un autre compte, ou « Une personne sans compte » (un enfant, par exemple). Il ne change plus ensuite, et la liste ne change pas de type.',
          'Si la liste est pour un autre compte, cette personne en fait partie d\'office, avec « Peut modifier » : elle ajoute ses souhaits elle-même.',
          'Un souhait a un nom, et si l\'on veut un lien (« Ouvrir le lien »), un « Prix indicatif » en euros, une note et une photo.',
          'Pour réserver : touchez le souhait, puis « Réserver ». La ligne affiche « Réservé par vous » ; « Annuler ma réservation » la libère. Il faut du réseau.',
          'Tout membre peut réserver, même en « Lecture seule ». Un seul proche par souhait : si quelqu\'un vient de le réserver, Listo le dit.',
          'Quand la liste est pour quelqu\'un d\'autre, son propriétaire voit les réservations et peut « Libérer » celle d\'un proche (par exemple d\'une personne qui a quitté la liste).',
          'Cocher un souhait le range dans « Reçus » : seuls la personne à qui la liste est destinée et le propriétaire le peuvent. Cela n\'a aucun lien avec la réservation.',
          'Une liste d\'envies n\'a ni lien public, ni copie (« Dupliquer la liste » n\'est pas proposé).',
        ],
      },
      {
        title: 'Ajouter, modifier, cocher, supprimer',
        items: [
          'Ajouter : tapez le nom dans le champ en bas de la liste, puis touchez « + ». Des suggestions s\'affichent pendant la saisie. Dans une liste de courses, pour un nouvel article, Listo demande son rayon, puis s\'en souvient.',
          'Après l\'ajout, le clavier se replie. Si la liste est réglée sur « Ouvrir la fiche », la fiche de ce qui vient d\'être ajouté s\'ouvre (sans clavier) : réglez quantité, note, priorité ou échéance, puis la disquette ; la croix la referme sans rien changer, la ligne reste ajoutée.',
          'Modifier : touchez la ligne. La fiche s\'ouvre ; la disquette enregistre.',
          'Cocher : touchez la case. Un article coché est barré et passe dans « Dans le panier » (« Terminés » dans une liste de tâches), en bas de la liste.',
          'Supprimer : faites glisser la ligne vers la gauche, puis touchez « Supprimer ». « Annuler » remet la ligne pendant quelques secondes.',
        ],
      },
      {
        title: 'Scanner un code-barres',
        paragraphs: ['Dans une liste de courses, le bouton code-barres à côté du champ d\'ajout (« Scanner un produit ») lit le code-barres sur une photo. Listo cherche le nom du produit ; vous pouvez le corriger avant d\'ajouter l\'article. Un produit déjà dans la liste peut être coché. Ce bouton n\'existe que si le mode scan est activé sur votre serveur.'],
      },
      {
        title: 'Ajouter une photo',
        paragraphs: ['Dans la fiche d\'un article, « Ajouter une photo » prend une photo ou en choisit une. Elle est réduite sur le téléphone avant l\'envoi. La photo est facultative.'],
      },
      {
        title: 'Groupes, tri et compteur',
        items: [
          'Touchez l\'en-tête d\'un rayon (ou d\'un magasin, ou d\'une priorité) pour le replier ou le déplier. « Tout replier » agit sur tous les groupes.',
          '« Mes listes » se trie par date ou par ordre alphabétique (bouton en haut).',
          'Dans une liste de courses, « Trier la liste » propose « Par rayon » (« Par magasin » pour un magasin « Multi ») ou « Ordre alphabétique » : les articles sont alors à plat, sous « À acheter ». Le rayon de chaque article est gardé.',
          'Dans une liste de tâches, « Trier la liste » propose « Ordre alphabétique », « Par priorité » et « Par échéance », selon les options de la liste.',
          'Le tri choisi ne vaut que pour vous, sur ce téléphone : il ne change rien pour les autres, et il est permis en lecture seule.',
          '« X/Y » donne le nombre d\'articles restants sur le total, sur chaque carte et en tête de chaque groupe.',
        ],
      },
      {
        title: 'Rechercher',
        items: [
          'Dans une liste, tirez la liste vers le bas (ou remontez tout en haut) : le champ « Rechercher dans la liste » apparaît au-dessus du premier groupe. Il cherche dans le nom des articles, pas dans les notes.',
          'Sur « Mes listes », de la même façon, le champ « Rechercher une liste » cherche dans le titre des listes, celles partagées avec vous comprises.',
          'Majuscules et accents ne comptent pas : « eclair » trouve « Éclair ». Le texte trouvé est surligné, et le nombre de résultats s\'affiche.',
          'Les articles cochés trouvés restent visibles, barrés, dans « Dans le panier ». Vous pouvez cocher, ouvrir ou supprimer un article depuis les résultats.',
          'La touche « rechercher » du clavier ferme le clavier et garde la recherche ; la croix ou « Effacer la recherche » la vide. Changer de liste ou quitter l\'écran la vide aussi.',
          'La recherche ne change rien à la liste ni pour les autres. Elle marche hors ligne, et aussi en lecture seule.',
        ],
      },
      {
        title: 'Nouveautés',
        items: [
          'Dans une liste partagée, Listo signale ce que les autres ont ajouté ou modifié depuis votre dernière visite. Vos propres actions et les suppressions ne sont jamais signalées.',
          'Sur « Mes listes », une pastille sur l\'icône de la carte donne le nombre de nouveautés (« 30+ » après plus d\'un mois d\'absence).',
          'Dans la liste, chaque nouveauté est surlignée, avec qui l\'a faite : « Ajouté par Marie », « Modifié par Marie ». Elle le reste pendant la visite, jusqu\'à ce que vous touchiez la ligne ; en quittant la liste, tout est considéré comme vu, sur tous vos appareils.',
          'Menu ⋮ de la liste : « Ne plus me signaler cette liste », puis « Signaler cette liste » pour revenir. Chacun choisit pour lui, invité en lecture seule compris.',
          '« Mon compte » › « Nouveautés » : désactive tout signalement ; « Signaler les éléments cochés » (visible seulement quand « Nouveautés » est activé) ajoute ce que les autres cochent ou décochent.',
          'Il n\'y a pas de notification : les nouveautés se voient en ouvrant Listo. Sur certains téléphones, l\'icône de l\'application installée montre aussi leur total.',
        ],
      },
      {
        title: 'Hors ligne et synchronisation',
        paragraphs: [
          'Sans réseau, vous pouvez continuer à ajouter, modifier et cocher. Les changements sont envoyés au retour du réseau.',
          'La pastille en haut indique l\'état : « À jour », « Synchronisation… » ou « Hors ligne », avec le nombre de changements en attente. Touchez-la pour synchroniser.',
          'Le partage, le lien public, la duplication, « Quitter la liste », la création d\'un magasin ou d\'un rayon et l\'Administration demandent une connexion.',
        ],
      },
      {
        title: 'Thème clair ou sombre',
        paragraphs: ['Réglages, puis « Mon compte », section « Apparence » : « Clair », « Sombre » ou « Auto » (comme le téléphone).'],
      },
    ],
  },
  {
    id: 'proprietaire',
    title: 'Propriétaire d\'une liste',
    topics: [
      {
        title: 'Partager la liste',
        paragraphs: ['Menu de la liste, « Modifier la liste », section « Partager avec » : cochez une personne, puis choisissez son droit.'],
        items: [
          '« Peut modifier » : la personne est contributeur. Elle coche, ajoute, modifie et supprime des articles.',
          '« Lecture seule » : la personne est invitée. Elle consulte seulement. C\'est le choix de départ.',
          'Vous pouvez changer le droit ou retirer une personne à tout moment.',
        ],
      },
      {
        title: 'Modifier la liste',
        paragraphs: ['« Modifier la liste » change le titre, le type, le magasin et l\'icône. Pour une liste de tâches, « Options des éléments » active ou non la priorité et l\'échéance. « Après l\'ajout » choisit entre « Rester sur la liste » et « Ouvrir la fiche », pour toutes les listes. Seul le propriétaire modifie la liste.'],
        items: [
          'Changer le type n\'efface rien. Une liste de courses devenue liste de tâches cache ses rayons, son magasin et ses codes-barres ; une liste de tâches devenue liste de courses cache la priorité et l\'échéance. Tout revient si la liste reprend son type d\'origine. Le formulaire le rappelle avant l\'enregistrement.',
        ],
      },
      {
        title: 'Dupliquer la liste',
        paragraphs: ['« Dupliquer la liste » crée une copie à votre nom, avec ou sans ses articles (tous décochés). La copie est privée : ni les personnes avec qui la liste est partagée, ni le lien public, ni les photos ne sont copiés.'],
      },
      {
        title: 'Lien public',
        paragraphs: ['« Partager par lien » crée une adresse que vous envoyez à une personne sans compte. Elle voit la liste en lecture seule.'],
        items: [
          'Durée : 1 heure, 24 heures, 7 jours, 30 jours, personnalisée ou illimitée. « Changer la durée » la modifie.',
          '« Protéger par mot de passe » : le mot de passe n\'est affiché qu\'une fois. Notez-le.',
          '« Arrêter le partage » rend le lien inutilisable tout de suite.',
        ],
      },
      {
        title: 'Supprimer la liste',
        paragraphs: ['« Supprimer la liste », après confirmation, retire la liste pour toutes les personnes. Il n\'y a pas d\'annulation.'],
      },
    ],
  },
  {
    id: 'contributeur',
    title: 'Contributeur',
    topics: [
      {
        title: 'Ce que permet « Peut modifier »',
        paragraphs: ['Avec ce droit, vous pouvez :'],
        items: [
          'Cocher, ajouter, modifier et supprimer des articles, et leur photo.',
          'Créer un magasin ou un rayon manquant.',
          '« Dupliquer la liste » : la copie vous appartient.',
        ],
        after: ['Le titre, le partage, le lien public et la suppression de la liste restent au propriétaire.'],
      },
      {
        title: 'Quitter une liste',
        paragraphs: ['Menu de la liste, « Quitter la liste » : la liste disparaît de vos listes. Vos articles y restent. Le propriétaire pourra de nouveau la partager avec vous.'],
      },
    ],
  },
  {
    id: 'invite',
    title: 'Invité',
    topics: [
      {
        title: 'Avec un compte',
        paragraphs: ['Avec le droit « Lecture seule », la carte de la liste et le haut de la liste portent la mention « Lecture seule ». Vous consultez la liste, ses articles et leurs photos ; toucher une ligne ouvre son détail. Vous ne pouvez rien ajouter, cocher ni modifier. « Quitter la liste » la retire de vos listes.'],
      },
      {
        title: 'Sans compte',
        paragraphs: [
          'Le lien public ouvre la liste en lecture seule, sans compte. Il peut demander un mot de passe, et il cesse de fonctionner à son expiration ou quand le propriétaire arrête le partage.',
          'Toucher un article ouvre sa fiche, en lecture seule : quantité, note en entier, rayon (ou magasin), état coché, code-barres, photo à agrandir, et pour une liste de tâches la priorité et l\'échéance si elles sont activées. Le bouton Retour du téléphone ou la croix la referment.',
        ],
      },
    ],
  },
  {
    id: 'admin',
    title: 'Administrateur',
    adminOnly: true,
    topics: [
      {
        title: 'Comptes',
        paragraphs: ['Réglages, « Administration », onglet « Comptes » : « Ajouter un compte » avec un mot de passe provisoire, à changer à la première connexion.'],
        items: [
          'Rôle : « Utilisateur » ou « Admin ».',
          '« Réinitialiser le mot de passe » et « Désactiver la double authentification ».',
          '« Désactiver le compte » ou « Réactiver le compte » ; « Supprimer le compte » s\'il n\'a jamais été utilisé.',
          'Il reste toujours au moins un Admin actif.',
        ],
      },
      {
        title: 'Courses : magasins, rayons, articles',
        items: [
          '« Magasins » : ajouter un magasin « Simple » ou « Multi » (qui regroupe d\'autres magasins), renommer, désactiver, supprimer s\'il n\'a jamais été utilisé.',
          '« Rayons » : ajouter, renommer, désactiver, supprimer s\'il n\'a jamais été utilisé.',
          '« Articles » : la mémoire des noms saisis dans les listes de courses. « Corriger » change un nom partout, « Modifier le rayon » change le rayon habituel, « Retirer » l\'enlève des suggestions.',
        ],
      },
      {
        title: 'Ce que l\'Admin ne voit pas',
        paragraphs: ['L\'Administration ne montre ni le contenu des listes des autres, ni leurs noms, ni les personnes avec qui elles sont partagées. Un Admin voit une liste seulement si elle est partagée avec lui.'],
      },
    ],
  },
];

// Sections montrées à ce compte : la section Administrateur seulement à un
// Admin (pour les autres, elle n'est même pas passée à l'écran)
// « Utiliser Listo avec Claude » : seulement si l'accès depuis Claude est
// activé sur le serveur (user.claudeUrl). {adresse} est remplacé par
// l'adresse du serveur (jamais écrite ici en dur).
export const CLAUDE_TOPIC = {
  title: 'Utiliser Listo avec Claude',
  items: [
    'Adresse à saisir dans Claude : {adresse}',
    'Sur claude.ai, l\'application mobile ou Claude Desktop : dans les réglages de Claude, ajoutez un connecteur personnalisé avec cette adresse, puis suivez l\'écran « Autoriser Claude » de Listo (votre mot de passe est redemandé).',
    'Avec Claude Code : claude mcp add --transport http listo {adresse}, puis /mcp pour autoriser.',
    'À l\'autorisation, « Lecture seule » est proposé par défaut. Avec « Lecture et ajout », Claude peut aussi ajouter des éléments et en cocher ou décocher. Il ne peut jamais supprimer, renommer ni modifier un élément, ni partager une liste.',
    'Ce que Claude ajoute apparaît à votre nom, comme si vous l\'aviez fait vous-même. Le contenu des listes autorisées est envoyé à Claude quand vous l\'interrogez.',
    'Pour arrêter : Réglages, « Mon compte », « Connexions Claude », puis « Déconnecter » (ou « Tout déconnecter »).',
  ],
};

export function helpSections(user) {
  const admin = user?.role === 'admin';
  const sections = SECTIONS.filter((section) => !section.adminOnly || admin);
  if (!user?.claudeUrl) return sections;
  // Accès depuis Claude activé : la rubrique s'ajoute à « Pour tout le monde »
  const claude = { ...CLAUDE_TOPIC, items: CLAUDE_TOPIC.items.map((line) => line.replaceAll('{adresse}', user.claudeUrl)) };
  return sections.map((section) => (section.id === 'tous' ? { ...section, topics: [...section.topics, claude] } : section));
}
