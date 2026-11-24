// Guide de Listo en anglais : chapitre « Rôle par rôle » (voir public/js/help-content.js).
export default {
  id: 'roles',
  title: "Role by role",
  blocks: [
    "On each list, everyone has a role: owner, contributor (“Can edit”), read only, or visitor through the public link. The Admin, for their part, manages the accounts. The table below sums up who can do what; the sections that follow go into detail. A shared note has the same permissions, in a simpler form: [[notes-partage]].",
    { who: true },
  ],
  sections: [
    {
      id: 'role-admin',
      title: "Admin",
      blocks: [
        "Settings, “Administration” (visible only to an Admin).",
        { sub: "“Accounts” tab" },
        { ul: [
          "“Add account” ([[creer-comptes]]).",
          "An account's ⋮ button: “Reset password”, “Disable two-factor authentication”, “Disable account” or “Re-enable account”, “Delete account” if it has never been used.",
          "Role: “User” or “Admin”. There's always at least one active Admin.",
        ] },
        { sub: "“Shopping” tab" },
        { ul: [
          "“Stores”: add a “Single” store or a “Multi” store (which groups other stores), rename, disable, delete if it has never been used.",
          "“Aisles”: grouped by store, “All stores” first. Add (choosing its store), rename, change the store, disable, delete if it has never been used. Two stores can each have an aisle with the same name; an “All stores” aisle has a name of its own. An aisle only goes to a store if no list from another store, or without a store, uses it.",
          "“Items”: the memory of names typed in shopping lists. “Correct” changes a name everywhere, “Change aisle” changes the usual aisle, “Remove” takes it out of the suggestions.",
        ] },
        { sub: "“Labels” tab" },
        { ul: [
          "Note labels, shared by the whole household ([[notes]]), with the number of notes that carry each one (never which ones). It stays there even if you turned notes off for yourself.",
          "The pencil renames the label and changes its color; a name already taken by another label (ignoring capitals and accents) is refused.",
          "The trash can deletes the label, after confirmation: it is removed from its notes, without touching the notes.",
          "Labels are created from a note, by any account.",
        ] },
        { sub: "Can / can't" },
        { ul: [
          "Can: manage accounts, stores, aisles, items and note labels; see whether a new version exists (Settings › “About”).",
          "Can't: see the content, the name or the members of other people's lists. An Admin sees a list only if it's shared with them, with the permission chosen by its owner. The same goes for notes ([[notes]]).",
          "Other accounts' AI assistant connections: see [[claude-connexions]].",
          "Finding out that a new version exists: [[version]].",
        ] },
      ],
    },
    {
      id: 'creer',
      title: "Owner: creating a list",
      blocks: [
        "On “Lists”, tap “+” at the top right (on a computer: “New list”). Give it a title, choose the type of list (“Shopping”, “Tasks” or “Wishes”) and an icon.",
        { ul: [
          "Shopping list: also choose the store. Items are sorted by aisle, or by store for a “Multi” store.",
          "Task list: “Options for items” turns on priority, due date and assignment.",
          "“After adding” (all lists): “Stay on the list” to keep adding, or “Open item details” to fill in what you just added right away. To start with: “Stay on the list” for a shopping list, “Open item details” for the others.",
          "If the store or aisle is missing, “New store…” or “New aisle…” creates it (network connection needed). An aisle created this way belongs to the list's store (to “All stores” for a list without a store).",
        ] },
      ],
    },
    {
      id: 'modifier',
      title: "Owner: editing the list",
      blocks: [
        "The list's ⋮ menu, “Edit”: the title, the type, the store, the icon. For a task list, “Options for items” turns priority, due date, assignment and subtasks on or off ([[sous-taches]]); for a wish list, “Priority”. “After adding” chooses between “Stay on the list” and “Open item details”. Only the owner edits the list.",
        { ul: [
          "Changing the type doesn't erase anything. A shopping list that becomes a task list hides its aisles, its store and its barcodes; a task list that becomes a shopping list hides priority and due date. Everything comes back if the list goes back to its original type. The form reminds you of this before saving.",
          "Changing the store: each item keeps its aisle if it's also used in the new store, otherwise it goes to the aisle with the same name; failing that, it goes to “No aisle”. The “Put items in aisles” window then opens so you can choose an aisle right away (or later, from the item's details).",
          "Priority (low, normal, high) is off to start with, for a task list as well as for a wish list. Everyone sees it. Due dates exist only for task lists.",
          "Becoming a wish list, on the other hand, is permanent ([[envies]]).",
        ] },
      ],
    },
    {
      id: 'partager',
      title: "Owner: sharing and choosing permissions",
      blocks: [
        "“Edit list”, “Share with” row: a window opens with one row per person. Check a person, then choose their permission at the end of their row. “OK” closes the window; the sharing is saved with “Save”.",
        { ul: [
          "“Edit” (“Can edit” permission): the person is a contributor ([[role-contributeur]]).",
          "“View” (“Read only” permission): the person can only read ([[role-lecture]]). This is the starting choice.",
          "You can change the permission or remove a person at any time.",
        ] },
      ],
    },
    {
      id: 'envies',
      title: "Owner: wish list",
      blocks: [
        "A wish list gathers gift ideas for one person, the recipient. The people close to them can reserve a wish ([[reserver]]). The surprise is kept: the recipient never sees that a wish is reserved, nor by whom, nor how many people are chipping in, even if they created the list themselves ([[role-beneficiaire]]).",
        { ul: [
          "“Who is it for?” is chosen when the list is created: “Me”, another account, or “Someone without an account” (a child, for example). It can't be changed afterwards, and the list can't change type anymore.",
          "A shopping or task list can become a wish list: in “Edit list”, choose “Wishes”, then “Who is it for?”. This is permanent, it needs a network connection, and nothing is erased: quantities and due dates are kept without being shown, checked items become “Received”, and an active public link is stopped.",
          "If the list is for another account, that person is automatically part of it, with “Can edit”: they add their wishes themselves.",
          "A wish has a name and, if you want, a link (“Open link”), an “Approximate price” (in the currency set on the server, euros by default), a note and a photo.",
          "Checking a wish moves it to “Received”: only the recipient and the owner can do this; reservations are no longer shown there.",
          "When the list is for someone else, its owner sees who's chipping in and can “Remove” a participant or “Release” the wish (for example if someone has left the list). On a list for yourself (“Me”), nobody can remove a participant who has left ([[faq-orphelin]]).",
          "A wish list can't be copied (“Duplicate” isn't offered in its menu).",
        ] },
      ],
    },
    {
      id: 'lien-public',
      title: "Owner: the public link",
      blocks: [
        "“Share by link” (⋮ menu) creates an address that you send to a person without an account. They see the list as read only ([[role-visiteur]]). A note has its own public link too, with the same rules: “Public link” in its ⋮ menu ([[notes-partage]]).",
        { ul: [
          "Duration: 1 hour, 24 hours, 7 days, 30 days, “Custom” or “Unlimited”. “Change duration” changes it.",
          "“Protect with a password”: the password is shown only once. Write it down.",
          "“Stop sharing” makes the link unusable right away.",
          "Wish list: the visitor can also reserve a wish or chip in on a gift. A reservation made through the link shows with the first name given, followed by ‘(public link)’; the owner can remove it, just like a reservation by someone close.",
        ] },
        { note: "Don't give a wish list's link to its recipient: if they open it without being signed in to Listo, they'll see which wishes are reserved (never by whom). Signed in, they see nothing about reservations." },
      ],
    },
    {
      id: 'corbeille',
      title: "Owner: duplicating, deleting, restoring",
      blocks: [
        { ul: [
          "“Duplicate” (the list's ⋮ menu) creates a copy in your name, with or without its items (all unchecked). The copy is private: the people the list is shared with, the public link and the photos are not copied.",
          "The list's ⋮ menu, “Delete”: a confirmation first reminds you what the list contains and who it's shared with. The list then disappears for everyone, and its public link stops.",
          "A deleted list stays in your “List trash” (Settings) for 30 days, then it's erased for good. Only its owner sees it there; each row shows its type, its number of items, the day it was deleted and the number of days left.",
          "“Restore” puts it back the way it was, for everyone it was shared with: items, each person's permission, settings, photos, reservations. It needs a network connection. Its public link doesn't come back: create it again if needed.",
          "“Delete for good” (a row's red trash can) erases the list right away, with its items and photos; “Empty the trash”, at the top, erases all the lists shown. Both ask for confirmation and need a network connection, and nothing comes back afterwards: the list can no longer be restored.",
          "The owner doesn't leave their list: they delete it, or keep it.",
        ] },
      ],
    },
    {
      id: 'role-contributeur',
      title: "Contributor (“Can edit”)",
      blocks: [
        { ul: [
          "Can: check, add, edit and delete items and their photo ([[quotidien]]); create a missing store or aisle; “Duplicate” the list (the copy belongs to them); reserve on a wish list (unless they're its recipient).",
          "Can't: change the title, the type or the options, share, create a public link, delete the list.",
        ] },
        "Leaving: the list's ⋮ menu, “Leave”. The list disappears from your lists; your items stay in it. The owner can share it with you again. It needs a network connection.",
      ],
    },
    {
      id: 'role-lecture',
      title: "Read only",
      blocks: [
        "The list's card and the top of the list show “Read only”.",
        { ul: [
          "Can: read the list, its items and their photos (tapping a row opens its details); sort and search; reserve a wish on a wish list; leave the list (⋮ menu, “Leave”).",
          "Can't: add, check, edit or delete anything.",
        ] },
      ],
    },
    {
      id: 'role-visiteur',
      title: "Public link visitor",
      blocks: [
        "A person without an account opens the link they were sent, without installing anything.",
        { ul: [
          "Can: read the list; tap an item to open its details (quantity, full note, aisle or store, checked or not, barcode, photo to enlarge, priority and due date if they're turned on, and a task's repeat).",
          "Wish list: see the wishes (name, note, link, price, priority, photo) and those already received; “Reserve” a free wish, “Chip in” on a gift open to others, cancel their participation. They're asked for their first name once. They only see whether a wish is reserved, never by whom or how many.",
          "Can't: edit the list, see who else has reserved.",
          "The link may ask for a password, and it stops working when it expires or when the owner stops sharing ([[faq-lien]]).",
        ] },
      ],
    },
    {
      id: 'role-beneficiaire',
      title: "Recipient of a wish list",
      blocks: [
        "The person the wish list is for adds their wishes (if they have an account) and marks them “Received”.",
        { ul: [
          "Never sees: that a wish is reserved, by whom, how many people are chipping in, or “Open to others”. Not in the list, not in What's new, not through an AI assistant ([[claude-envies]]), and not on the public link page when signed in.",
          "Can't reserve their own wishes.",
          "Only someone with access to the server (database files, backups) could read a reservation: don't give this access to the recipient if the surprise matters.",
        ] },
      ],
    },
  ],
};
