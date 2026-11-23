// Guide de Listo en anglais : tableau « Qui peut quoi » et mention des
// chapitres pour le serveur (voir ROLES, PERMISSIONS, PERMISSIONS_NOTE et
// SERVER_NOTE dans public/js/help-content.js : mêmes clés, même ordre).

// Colonnes : les rôles sur une liste (l'Admin : sur les listes des autres)
export const ROLES = [
  { key: 'owner', label: 'Owner' },
  { key: 'contributor', label: 'Contributor' },
  { key: 'reader', label: 'Read only' },
  { key: 'visitor', label: 'Visitor' },
  { key: 'admin', label: 'Admin' },
];

// Lignes : une action, et les rôles qui peuvent la faire
export const PERMISSIONS = [
  { action: 'See the list and its items', roles: ['owner', 'contributor', 'reader', 'visitor'] },
  { action: 'Check, add, edit or delete items, add a photo', roles: ['owner', 'contributor'] },
  { action: 'Create a missing store or aisle', roles: ['owner', 'contributor', 'admin'] },
  { action: 'Duplicate the list', roles: ['owner', 'contributor'] },
  { action: 'Reserve a wish or chip in on a gift (wish list), except the person the list is for', roles: ['owner', 'contributor', 'reader', 'visitor'] },
  { action: 'Edit the list (title, type, store, icon, options)', roles: ['owner'] },
  { action: 'Share the list and choose each person\'s permission', roles: ['owner'] },
  { action: 'Create a public link', roles: ['owner'] },
  { action: 'Delete the list, restore it or erase it for good from the trash (30 days)', roles: ['owner'] },
  { action: 'Leave the list', roles: ['contributor', 'reader'] },
  { action: 'Manage accounts, stores, aisles and items', roles: ['admin'] },
];

export const PERMISSIONS_NOTE = 'Contributor: an account with the “Can edit” permission on the list. Read only: an account with the “Read only” permission. Visitor: a person without an account who opens the public link (they can only read, except to reserve or chip in on a wish list). Admin: what the Admin can do on other people\'s lists; for their own lists, they\'re the owner like everyone else. In a wish list, the person the list is for never sees the reservations, even if they\'re its owner.';

// Mention placée sous le titre des chapitres et sections server: true
export const SERVER_NOTE = 'For the person who runs the server';
