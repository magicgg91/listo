// Guide de Listo en anglais : chapitre « Projets » (voir public/js/help-content.js).
export default {
  id: 'projets',
  title: 'Projects',
  blocks: [
    'A project sorts cards into columns, like a board of ideas: ‘Ideas’, ‘Drafts’, ‘Review’, ‘Published’… Each project has a single board: its columns (a name and a color, in the order you choose), and in each column its cards, in the order you choose. For several boards, create several projects. A project is shared with Listo people, each with their role ([[projets-roles]]); it has no public link.',
    'The feature is off at first, for each account: nothing changes until you turn it on.',
  ],
  sections: [
    {
      id: 'projets-allumer',
      title: 'Turning projects on',
      blocks: [
        'Settings, “Features”, “Projects”: turn the switch on. The choice is yours alone, on all your devices, and also works offline. Turned off again, projects disappear from your screens without deleting anything: your projects and the ones shared with you come back when you turn them on again.',
        { ul: [
          'On the phone, the bottom bar then has six buttons: “Home”, “Due”, “Lists”, “Notes”, “Projects” and “Settings” (five if Home or notes are turned off). With text enlarged by the phone, a label can be cut short (‘Du…’): the name read by the screen reader stays complete.',
          'Home gets a “Projects” tile, at the bottom, across the full width: the number of your projects, and the three most recently changed (with their number of cards, and a dot when there is new activity). The title opens the “Projects” screen. Like the other tiles, it can be hidden and moved in Settings, “Home”; “Projects” can also become your first screen when Home is turned off.',
          'The “Trash” in Settings gets a “Projects” tab ([[projets-corbeilles]]).',
        ] },
      ],
    },
    {
      id: 'projets-creer',
      title: 'Create, duplicate, delete a project',
      blocks: [
        { ul: [
          '“Projects” screen: one card per project, the most recently changed at the top, with its columns (colored dot, name, number of cards), the people\'s badges, the “Read only” eye or “Contributor” depending on your role, and a dot when someone else did something there since your last visit. The magnifier searches for a project by its name.',
          '“+”, at the top right (“New project” when you have none): give a name (80 characters at most), then “Create”. The project starts with three columns, “To do”, “In progress” and “Done”, which you can rename as you like; it opens right away.',
          'A project\'s ⋮ menu: “Open”, “Share” (your projects) or “People”, “Duplicate project”, “Hide new activity” (shared project), then “Delete” (your projects) or “Leave project”. In an open project, the same menu also has “Project settings” and “Deleted cards”.',
          '“Duplicate project” (any member, even “Read only”): a new project of yours, not shared, whose name ends with ‘(copy)’, with the same columns, the same labels and the same “Priority” option, but without any cards. Handy to make a template. It also works offline.',
          '“Delete” (owner): the project goes to the “Trash” in Settings for 30 days, with its cards; it also disappears for the people it is shared with. “Cancel”, in the message that follows, puts it back right away.',
        ] },
      ],
    },
    {
      id: 'projets-cartes',
      title: 'Cards',
      blocks: [
        'On the phone, a project shows one column at a time. At the top, the column tabs (colored dot, name, number of cards): the chosen column has its color as background, an outline and a bold name. Tap a tab, or swipe the screen sideways (starting from the middle, not the left edge) to go to the next column. Listo remembers, on this device, the last column opened in each project.',
        { ul: [
          'Add a card: type its title in the bar at the bottom (it names the column), then “+”; the card goes to the bottom of the column, and the field stays ready for the next one. No bar with “Read only”.',
          'The magnifier searches the whole project (titles and label names); while searching, the results are sorted by column.',
          '“Filter” (when the project has labels) opens “Filter cards”: check one or more labels, then the ‘Show 3 cards’ button; only the cards with one of the checked labels remain. “Clear” removes the filter. The filter is kept for this project, on this device; the number of filters is written on the button, and the tabs count the cards shown.',
          'Move a card: a long press lifts it, then drag it to its new place in the column, or drop it on a tab: it goes to the top of that column. Without dragging, the open card has, in its ⋮ menu, “Move to…” (choose the column, then “At the top” or “At the bottom”, then “Move”), “Move up” and “Move down”.',
          'Tapping a card opens it: its title (tap it to edit it, 200 characters at most), its column (the button in its color opens “Move to…”) and its labels (“Label”, with its “+”, to add or remove some, 10 at most). Its ⋮ menu: “Move to…”, “Move up”, “Move down”, “Duplicate” (a copy right below, yours) and “Delete”. Everything saves on its own, offline included.',
          'A card your role doesn\'t let you edit says so (‘Read only’, or ‘You can read it, not edit it.’): it has no “+”, no typing, and no button that wouldn\'t work.',
        ] },
        'A card\'s assigned people, its due date with the ‘Done’ box, description, links, comments and history will come with the next steps of projects.',
      ],
    },
    {
      id: 'projets-colonnes',
      title: 'The project\'s columns and labels',
      blocks: [
        '“Project settings” (⋮ menu of an open project; owner and “Can edit”):',
        { ul: [
          'Project name (the owner only).',
          'Columns: one row per column, with its number of cards. Drag the handle on the left to change the order, or tap the pencil: name (40 characters at most, only once in the project), color among eight, position (before or after its neighbors) and “Delete column”. “Add a column” adds one at the end (20 at most).',
          'Deleting an empty column: it goes right away. A column with cards: choose to move its cards to another column, or to delete them with it (they go to the project\'s “Deleted cards”). A deleted column can\'t be restored; a project always keeps at least one column.',
          'Project labels: specific to this project (the notes\' labels don\'t mix in), a given label existing only once (upper case and accents count the same). “New label”; the pencil renames, changes the color or deletes (the label is then removed from its cards). 50 labels at most per project.',
          '“Priority” (the owner): a project option, off at first; it will be used with the cards\' details.',
          '“Delete project” (the owner).',
        ] },
      ],
    },
    {
      id: 'projets-roles',
      title: 'Sharing a project, the four roles',
      blocks: [
        'In one of your projects, “Share” (the people button at the top, or the ⋮ menu) opens the list of Listo accounts directly: a project has no public link. Check a person, then choose their access under their name, “Edit”, “Contribute” or “View”; uncheck them to remove them; then “OK”. A person you add starts with “View”. It needs the network.',
        { table: { head: ['Role', 'What it allows'], rows: [
          ['“Owner”', 'everything: rename, share, delete the project, the “Priority” option, erase deleted cards for good'],
          ['“Can edit” (“Edit” access)', 'the columns, the project\'s labels and all the cards; never rename, share or delete the project'],
          ['“Contributor” (“Contribute” access)', 'create cards; edit and move the ones they created or that are assigned to them; delete and restore only the ones they created; never the columns or the project\'s labels'],
          ['“Read only” (“View” access)', 'see the project, its columns and its cards, without changing anything'],
        ] } },
        { ul: [
          'Any member can duplicate the project, see “People” (who, and with which role) and leave the project (⋮ menu, “Leave project”; except the owner, who deletes it). What belongs to each person (hidden new activity, open column, filters) is never shown to the others.',
          'Nobody else, not even the Admin, sees a project that isn\'t shared with them.',
          'A changed role takes effect right away; an action made offline then refused by the server (the role changed in the meantime) is reported, and the screen goes back to the server\'s state.',
        ] },
      ],
    },
    {
      id: 'projets-corbeilles',
      title: 'Project trash',
      blocks: [
        { ul: [
          'Deleted projects: “Trash” in Settings, “Projects” tab (the owner only). Each row says when the project was deleted, how many days it has left, its number of cards and how many people it was shared with. “Restore” brings it back for everyone, with its columns and cards; “Delete for good” and “Empty the trash” ask for confirmation and need the network. After 30 days, it is erased for good.',
          'Deleted cards: in each project (⋮ menu, “Deleted cards”), because anyone can delete cards. Each row: title, original column, who deleted it and when. “Restore”: the owner and “Can edit” for all of them, a Contributor for the ones they created; the card comes back at the bottom of its column (or of the first one, if its own no longer exists). “Delete for good” and “Empty the trash”: the owner, with the network. With “Read only”, the list can be seen, without buttons.',
        ] },
      ],
    },
    {
      id: 'projets-ordinateur',
      title: 'On a computer',
      blocks: [
        '“Projects” is in the menu on the left (after “Notes”), with the number of projects; on the projects\' screens, your projects are listed below it (number of cards, new-activity dot), and the bottom button becomes “New project”, or “New card” in a project (N key).',
        { ul: [
          'An open project takes the full width: at the top, its name, ‘Project · 5 columns · 55 cards’, “Share” (P key) and the search (/ key); below, the label filters (several choices; ‘+ 2’ shows the others; “Clear filters”); then the columns side by side, which scroll sideways.',
          'Each column has its ⋮ menu (owner and “Can edit”): rename and change the color, move left or right, “Delete column”. “Add a card”, at the bottom of a column, opens a field (Enter adds, Escape closes); “Add a column” is at the end.',
          'Drag and drop: hold a card with the mouse and drop it in the same column or another one; a dashed place shows where it will land. With the keyboard: the arrows go from card to card (up and down in a column, left and right from one column to the next), Enter opens the card, M opens “Move to…”. Right-click on a card: its menu.',
          'A card opens in a window in the middle, over the project: on the left the title and ‘in Review · DomoPi Articles · created by Guillaume on October 2’, on the right the column, the labels and the actions. The address is the card\'s: you can send it or come back to it. Escape or the cross close it.',
        ] },
      ],
    },
  ],
};
