// Guide de Listo en anglais : chapitre « Présentation » (voir public/js/help-content.js).
export default {
  id: 'presentation',
  title: "Introduction",
  sections: [
    {
      id: 'listo',
      title: "What Listo is",
      blocks: [
        "Listo is an app for shared lists: shopping, tasks and gift ideas. It's designed for a family or a small group of people close to each other, and it's mostly used on a phone.",
        "When someone checks an item, the others see it checked within a few seconds. Listo is free, with no ads and no tracking.",
        "Listo also keeps notes ([[notes]]) and, for those who enable them, projects: boards of cards sorted into columns ([[projets]]).",
        "Accounts are created by the Admin, the person who manages Listo: there's no public sign-up.",
      ],
    },
    {
      id: 'limites',
      title: "What Listo doesn't do",
      blocks: [
        { ul: [
          "No online version: you install Listo on your own server (a computer that's always on, at home for example). See [[installation]].",
          "In French or English, as each person chooses in “My account” ([[langue]]); this help is available in both languages too.",
          "The Notifications page (the bell on Home) keeps what Listo tells you about. Notifications on your phone or computer are optional: disabled by default on the server, then enabled by each person on their own devices ([[notifications]]).",
          "No payments: for a group gift, Listo shows who's chipping in, never how much.",
          "No data is sent anywhere other than your server, with three exceptions you can disable: checking for a new version (GitHub, [[version]]), the name of a scanned product (Open Food Facts, [operations guide in the repository, in French](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#scan-serveur)) and notifications, turned off by default (the device's notification service sees the time, the size and the device, never the text: [[notif-confidentialite]]). If you connect an AI assistant (Claude, for example), the content of the lists and notes you allow is sent to it when you ask it something ([[claude]]).",
        ] },
      ],
    },
    {
      id: 'types',
      title: "Three types of list",
      blocks: [
        { ul: [
          "“Shopping”: items are sorted by aisle (‘Produce’, ‘Dairy’…), or by store for a trip to several shops (“Multi” store). Listo remembers the usual aisle of each item.",
          "“Tasks”: things to do, with a priority and a due date if needed.",
          "“Wishes”: gift ideas for one person. The people close to them reserve a wish so the same thing isn't given twice, without that person knowing.",
        ] },
        "You choose the type when you create the list. A shopping list can become a task list, and the other way around, without losing anything. Becoming a wish list is permanent.",
      ],
    },
    {
      id: 'vocabulaire',
      title: "Vocabulary",
      blocks: [
        { ul: [
          "Item: a line in a shopping list or a task list. Wish: a line in a wish list. They all work the same way.",
          "Owner: the person who created the list.",
          "Contributor: a person who has the “Can edit” permission on the list.",
          "Read only: a person who can only read the list.",
          "Visitor: a person without an account who opens a list's public link.",
          "Recipient: the person a wish list is for.",
          "Note: free text, separate from the lists, yours alone at first; it can be shared like a list ([[notes]]).",
          "Project: a board of cards sorted into columns, shared with people on Listo; in a project, “Contributor” is a role of its own ([[projets-roles]]).",
          "Admin: the account that manages accounts, stores and aisles.",
          "User: a family account, for using Listo normally. Guest: a discreet account, for someone who helps you (on a project, for example); only the Admin sees it ([[roles-comptes]]).",
        ] },
      ],
    },
  ],
};
