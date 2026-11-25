// Guide de Listo en anglais : chapitre « Projets » (voir public/js/help-content.js).
export default {
  id: 'projets',
  title: 'Projects',
  blocks: [
    'A project sorts cards into columns, like a board of ideas: ‘Ideas’, ‘Drafts’, ‘Review’, ‘Published’… Each project has a single board: its columns (a name and a color, in the order you choose), and in each column its cards, in the order you choose. For several boards, create several projects. A project is shared with Listo people, each with their role ([[projets-roles]]); it has no public link.',
    'The feature is disabled at first, for each account: nothing changes until you enable it.',
  ],
  sections: [
    {
      id: 'projets-activer',
      title: 'Enabling projects',
      blocks: [
        'Settings, “Features”, “Projects”: enable the switch. The choice is yours alone, on all your devices, and also works offline. Disabled again, projects disappear from your screens without deleting anything: your projects and the ones shared with you come back when you enable them again.',
        { ul: [
          'On the phone, the bottom bar then has six buttons: “Home”, “Due”, “Lists”, “Notes”, “Projects” and “Settings” (five if Home or notes are disabled). With text enlarged by the phone, a label can be cut short (‘Du…’): the name read by the screen reader stays complete.',
          'Home gets a “Projects” tile, at the bottom, across the full width: the number of your cards (assigned to you, not done), and the three most urgent (overdue first, then by due date); below, the project, the column and the due date (‘Overdue’ in red). A row opens the card; with no card for you, “No cards for you”. The title opens the “Projects” screen. Like the other tiles, it can be hidden and moved in Settings, “Home”; “Projects” can also become your first screen when Home is disabled.',
          'The “Trash” in Settings gets a “Projects” tab ([[projets-corbeilles]]).',
        ] },
      ],
    },
    {
      id: 'projets-creer',
      title: 'Create, duplicate, delete a project',
      blocks: [
        { ul: [
          '“Projects” screen: one card per project, the most recently changed at the top, with its columns (colored dot, name, number of cards), the people\'s badges, the “Read only” eye or “Contributor” depending on your role, ‘2 cards for you · 1 overdue’ (your cards not done), and a dot when someone else did something there since your last visit. The magnifier searches for a project by its name.',
          '“+”, at the top right (“New project” when you have none): give a name (80 characters at most), then “Create”. The project starts with three columns, “To do”, “In progress” and “Done”, which you can rename as you like; it opens right away.',
          'A project\'s ⋮ menu: “Open”, “Share” (your projects) or “People”, “Project settings” (owner and “Can edit”, [[projets-colonnes]]), “Duplicate project”, “Deleted cards” ([[projets-corbeilles]]), “Turn off notifications” ([[projets-notifications]]), “Hide new activity” (shared project), “Show in Due” (when the project\'s “Due dates” option is enabled, [[projets-echeances]]), then “Delete” (your projects) or “Leave project”. In an open project, the ⋮ menu at the top is the same, without “Open”.',
          '“Duplicate project” (any member, even “Read only”): a new project of yours, not shared, whose name ends with ‘(copy)’, with the same columns, the same labels and the same “Priority” and “Due dates” options, but without any cards. Handy to make a template. It also works offline.',
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
          'The magnifier searches the whole project (titles, descriptions, label names and link titles); while searching, the results are sorted by column.',
          '“Filter” opens “Filter cards”: check people (“Me”, each member, or “Nobody” for unassigned cards) and labels, then the ‘Show 3 cards’ button; a card remains if it belongs to one of the checked people AND has one of the checked labels. “Clear” removes the filter. The filter is kept for this project, on this device; the number of filters is written on the button, and the tabs count the cards shown.',
          'Move a card: a long press lifts it, then drag it to its new place in the column, or drop it on a tab: it goes to the top of that column. Without dragging, the open card has, in its ⋮ menu, “Move to…” (choose the column, then “At the top” or “At the bottom”, then “Move”), “Move up” and “Move down”.',
          'Tapping a card opens it ([[projets-carte]]): its title (tap it to edit it, 200 characters at most), its column (the button in its color opens “Move to…”), its people, due date, labels, description and links. Its ⋮ menu: “Move to…”, “Move up”, “Move down”, “Duplicate” (a copy right below, yours), “Follow” or “Unfollow” ([[projets-commentaires]]) and “Delete”. Everything saves on its own, offline included.',
          'A card your role doesn\'t let you edit says so (‘Read only’, or ‘You can read it, not edit it.’): it has no “+”, no typing, and no button that wouldn\'t work.',
        ] },
      ],
    },
    {
      id: 'projets-carte',
      title: 'An open card',
      blocks: [
        'Each field of a card is always there, with its “+” or, when empty, a line to fill it (“Assign”, “Add a due date”…): there is only one place to fill it. Everything saves on its own, offline included. What your role doesn\'t allow has no button ([[projets-roles]]).',
        { ul: [
          'People: the badges and first names of the assigned people; “+” (or “Assign”) opens the choice, with “Assign to me” at the top. A card can be assigned to the owner, a “Can edit” or a “Contributor”, never to a person with “Read only” (10 at most). A person who leaves the project, is removed from it or becomes “Read only” is removed from their cards.',
          'Due (when the project\'s “Due dates” option is enabled, which it is at first), on a single line: the “Done” box, then the date and time (tap them to change them). Without a due date: “Add a due date”. The time is optional; with a time, a reminder can be chosen (at the time, 15 min, 30 min, 1 h, 2 h before, or the day before), written small below. “Remove due date” removes it, with the “Done” box.',
          'The “Done” box is the only mark of a done card: the due date stays, in green, with a check mark. A done card is no longer overdue and has no reminder; it doesn\'t change column: put it away yourself (in ‘Published’, for example), or delete it. An overdue card has its date in red, with a triangle.',
          'Labels: “Label” (or its “+”) adds or removes the project\'s labels (10 at most per card).',
          'Priority (when the project\'s “Priority” option is enabled): “Low”, “Normal” or “High”. Disabled, the priority is kept without being shown.',
          'Description: tap the text to write it (“Add a description” when it is empty); the same formatting as notes, with the formatting bar while typing ([[notes]]). Checkboxes make a task list: ‘2/3’ above (boxes checked out of boxes), and a box is checked with one tap, without typing, even if someone checks another one at the same moment.',
          'If someone changed the description while you were writing, nothing is overwritten: the card is “To check” and you choose “Keep mine”, “Take theirs”, “Keep both” (your text is added below theirs, after a ‘Version by Guillaume, Nov 25 9:04 PM’ line) or “Decide later”.',
          'Links: a title (optional) and an address starting with http:// or https:// (20 links at most). Tap the title to open it in a new tab; ⋮: “Edit link”, “Copy address”, “Remove”. Listo never opens these addresses itself.',
          'A Contributor on someone else\'s card assigned to them: they can edit everything on it and move it, and “Remove me” from the people; they can neither assign anyone nor delete it. Once removed, they can only read it.',
        ] },
        'On the card, in the column: its labels, then the due date (green and ‘Done’ when it is done, red with a triangle when overdue), the priority, an icon when it has a description, ‘2/3’ for its boxes, the number of links, the number of comments, the people\'s badges, and a blue dot when someone else changed it since your last visit. The screen reader reads all this with the title. Below the open card: the comments and the history ([[projets-commentaires]]).',
      ],
    },
    {
      id: 'projets-commentaires',
      title: 'Comments, history, following a card',
      blocks: [
        'Below an open card\'s links, two tabs: “Comments” (with their number) and “History”.',
        { ul: [
          'Write: “Write a comment…”, at the bottom of the screen on the phone (below the comments on a computer, Ctrl+Enter sends), then the arrow. The owner, “Can edit” and Contributors comment on every card; “Read only” reads the comments without being able to write any. A comment is plain text (4,000 characters at most); addresses starting with http:// or https:// become links. Offline included.',
          'Your comments have “Edit” (‘edited’ is then written next to the date) and “Delete” (with confirmation). The project\'s owner can delete someone else\'s comment, never edit it.',
          'A comment imported by an AI assistant (from another tool) is in a dashed bubble, with its original author\'s name and ‘imported by …’: it isn\'t linked to any Listo account ([[claude-projets]]).',
          'History: what happened to the card, the most recent at the top, with who and when: created, moved (from one column to another), renamed, description changed, box checked, assigned, due date, “Done”, labels, links, comment added (without its text), deleted, restored; ‘(AI assistant)’ when the action comes from an assistant ([[claude-projets]]). It can only be read with the network; 300 lines at most per card.',
          'Follow: you follow a card you created, that is assigned to you or that you commented on; its ⋮ menu (right column on a computer) has “Follow” for the others, and “Unfollow”, kept even if the card is assigned to you later. Following a card means getting its notifications ([[projets-notifications]]).',
        ] },
      ],
    },
    {
      id: 'projets-notifications',
      title: 'Projects\' new activity and notifications',
      blocks: [
        { ul: [
          'New activity: when someone else created, changed, moved or commented on a card since your last visit, a blue dot says so on the project\'s card (“Projects” screen), on Home\'s “Projects” tile, in the menu on the left on a computer, and on each card concerned. Opening the project marks it as seen, on all your devices; the cards\' dots stay during this visit. Project ⋮ menu: “Hide new activity”.',
          'Notifications (Notifications page, and the phone when they are turned on there: [[notifications]]): a project\'s new cards (‘Léa added 3 cards to DomoPi Articles’, one line per project that updates), a card assigned to you, the comments and changes (moved, due date, “Done”, description) of a card you follow, grouped once per quarter of an hour, a card\'s reminder (with the “Due” notifications, to the assigned people, otherwise to everyone; never for a done card), and a project being shared.',
          'Never what you do yourself. Without “Show details in the notification”, the phone doesn\'t name the card (‘a card’); a comment\'s text is never in a notification.',
          'Project ⋮ menu: “Turn off notifications” (page and phone, reminders included), independent of “Hide new activity”.',
          'Projects disabled (Settings, “Features”): no new activity or notifications from projects, except when a project is shared with you: the notification then invites you to enable projects, and tapping it opens Settings, “Features”.',
        ] },
      ],
    },
    {
      id: 'projets-echeances',
      title: 'A project\'s cards in “Due”',
      blocks: [
        'A project\'s ⋮ menu: “Show in Due”, a switch, disabled at first (a check mark says when it is enabled); it is only there when the project\'s “Due dates” option is enabled ([[projets-colonnes]]). It is your choice for this project only: Léa may want ‘Home repairs’ in her Due screen, and Guillaume not. Nobody else sees it; it also works offline, whatever your role.',
        { ul: [
          'When it is enabled, this project\'s dated cards that are not done appear on the “Due” screen ([[echeances]]), mixed with the tasks, in the same groups (“Overdue”, “Today”, “Tomorrow”, “This week”, “Later”), with the projects icon and ‘DomoPi Articles · Review’ (the project and the column) instead of the list\'s name, then the priority (if the project\'s option is enabled), the date and time, and the people.',
          'Tapping the row opens the card. The box checks “Done” if you can edit the card ([[projets-roles]]): the card leaves the screen, and “Undo” brings it back. Otherwise, the row has no box.',
          '“Mine” keeps the cards assigned to you and the ones assigned to no one; “All”, all the dated cards of these projects.',
          'The numbers on “Due” (bottom bar, menu on the left), Home\'s “Due” tile and the morning summary count them too (the summary then says ‘2 items due today · 1 overdue’ and opens “Due”). A project whose notifications you turned off stays on the screen, but is not in the summary.',
          'A card\'s reminder doesn\'t depend on this choice ([[projets-notifications]]). Projects disabled (Settings, “Features”): no cards in “Due”; the choice is kept for when you enable them again.',
        ] },
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
          '“Priority” (the owner): a project option, disabled at first. Enabled, each card has a priority, “Low”, “Normal” or “High” ([[projets-carte]]); disabled again, priorities are kept without being shown.',
          '“Due dates” (the owner and “Can edit”): a project option, enabled at first: a date, a time and a reminder on cards, and the “Done” box ([[projets-carte]]). Disabled, nothing is erased, but cards no longer have a due date, a reminder or a “Done” box: they are never overdue, no longer go to “Due” or the morning summary, and “Show in Due” leaves the ⋮ menu. Enabled again, everything comes back as it was.',
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
          ['“Can edit” (“Edit” access)', 'the columns, the project\'s labels, the “Due dates” option and all the cards; never rename, share or delete the project'],
          ['“Contributor” (“Contribute” access)', 'create cards; edit and move the ones they created or that are assigned to them; assign people on their own cards, and only remove themselves from someone else\'s card; delete and restore only the ones they created; never the columns or the project\'s labels'],
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
          'An open project takes the full width: at the top, its name, ‘Project · 5 columns · 55 cards’, “Share” (P key) and the search (/ key); below, the filters by person (“All”, “Me”, each member, “Nobody”) and by label (several choices; ‘+ 2’ shows the others; “Clear filters”); then the columns side by side, which scroll sideways.',
          'Each column has its ⋮ menu (owner and “Can edit”): rename and change the color, move left or right, “Delete column”. “Add a card”, at the bottom of a column, opens a field (Enter adds, Escape closes); “Add a column” is at the end.',
          'Drag and drop: hold a card with the mouse and drop it in the same column or another one; a dashed place shows where it will land. With the keyboard: the arrows go from card to card (up and down in a column, left and right from one column to the next), Enter opens the card, M opens “Move to…”. Right-click on a card: its menu.',
          'A card opens in a window in the middle, over the project: on the left the title and ‘in Review · DomoPi Articles · created by Guillaume on October 2’, its description, its links, then the comments and the history; on the right, in this order, the column, the people, the labels, the due date (“Done” box and date on one line, reminder below), the priority (option enabled) and the actions (“Move to…”, “Duplicate”, “Follow” or “Unfollow”, “Delete”). The address is the card\'s: you can send it or come back to it. Escape or the cross close it.',
        ] },
      ],
    },
  ],
};
