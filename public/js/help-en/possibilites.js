// Guide de Listo en anglais : chapitre « Les possibilités » (voir public/js/help-content.js).
export default {
  id: 'possibilites',
  title: "What you can do",
  blocks: ["What Listo offers today, by topic. Each point links to the section that explains it."],
  sections: [
    {
      id: 'p-partage',
      title: "Lists shared live",
      blocks: [{ ul: [
        "A list can be shared with other accounts, each with their own permission: “Can edit” or “Read only” ([[partager]]).",
        "Changes reach the other phones within a few seconds. Checked items move to the bottom, crossed out.",
        "What's new: Listo shows what the others have added or changed since your last visit ([[nouveautes]]).",
        "Notifications, optional: changes (by others), reservations, sharing and the due-date summary, on your phone or your computer ([[notifications]]).",
        "An icon of your choice for each list, and a count of what's left on each card and each group ([[tri]]).",
      ] }],
    },
    {
      id: 'p-courses',
      title: "Shopping: aisles and stores",
      blocks: [{ ul: [
        "Items sorted by aisle; Listo remembers the usual aisle of each item, suggests names you've already typed and “Often added” items ([[ajouter]]).",
        "“Multi” store: a trip to several shops, where each item has its store instead of an aisle ([[creer]]).",
        "An aisle is used in every store (“All stores”), or in a single one: each list offers the aisles of its store and those of all stores.",
        "Anyone can create a missing store or aisle; the Admin manages them ([[role-admin]]).",
      ] }],
    },
    {
      id: 'p-taches',
      title: "Tasks: priority, due date, time, reminder, repeat, assignment",
      blocks: [{ ul: [
        "Priority (low, normal, high) and due date, turned on list by list ([[modifier]]).",
        "A time, and a reminder chosen task by task ([[heure]]).",
        "Tasks that repeat: every day, on certain days of the week, every month, every year ([[repeter]]).",
        "Assign a task to a person on the list, and see “Mine” ([[attribuer]]).",
        "Put subtasks under a main task ([[sous-taches]]).",
        "Sort by priority or by due date ([[tri]]).",
      ] }],
    },
    {
      id: 'p-envies',
      title: "Wishes: reserving and chipping in",
      blocks: [{ ul: [
        "For yourself, for another account or for someone without an account; link, approximate price, priority and photo ([[envies]]).",
        "The people close to the recipient reserve a wish, possibly several of them together (chipping in) ([[reserver]]).",
        "The person the list is for never sees the reservations ([[role-beneficiaire]]).",
        "Through the public link, a visitor without an account can also reserve or chip in ([[role-visiteur]]).",
      ] }],
    },
    {
      id: 'p-saisie',
      title: "Quick entry",
      blocks: [{ ul: [
        "Several items at once, separated by commas or line breaks ([[plusieurs]]).",
        "Quantity read from the name: ‘6 eggs’ or ‘eggs x6’ ([[quantite]]).",
        "Scan mode: a photo of a product's barcode gives its name ([[scan]]).",
        "A photo of an item ([[photo]]).",
      ] }],
    },
    {
      id: 'p-notes',
      title: "Notes",
      blocks: [{ ul: [
        "Notes in free text, that save themselves, with clickable links, a pin and their own trash ([[notes]]).",
        "A note is shared like a list (“Can edit” or “Read only”), or through a read-only public link ([[notes-partage]]).",
        "A quick note from Home, even offline ([[echeances]]).",
      ] }],
    },
    {
      id: 'p-securite',
      title: "Offline, trash, public link",
      blocks: [{ ul: [
        "Offline: Listo opens and works without a network; changes are sent when the network comes back ([[hors-ligne]]).",
        "Trash: a deleted list can be restored for 30 days ([[corbeille]]).",
        "Public link: show a list to someone without an account, for a length of time you choose, with a password if needed ([[lien-public]]).",
      ] }],
    },
    {
      id: 'p-confort',
      title: "Security and convenience",
      blocks: [{ ul: [
        "Two-factor authentication, with recovery codes ([[double-auth]]).",
        "Automatic backup every night ([[sauvegardes]]).",
        "Light, dark or automatic theme ([[theme]]).",
        "Install it on your phone's home screen, like an app ([[telephone]]).",
        "An AI assistant, for example Claude, can read your lists and, if you allow it, write to them ([[claude]]).",
      ] }],
    },
  ],
};
