// Guide de Listo en anglais : chapitre « Questions fréquentes et dépannage » (voir public/js/help-content.js).
export default {
  id: 'faq',
  title: 'FAQ and troubleshooting',
  sections: [
    {
      id: 'faq-hors-ligne',
      title: 'I have no network',
      blocks: ['Keep going: adding, editing and checking work offline, and the badge at the top counts the pending changes ([[hors-ligne]]). They go out on their own when the network comes back. Sharing, the public link, the trash and reservations wait for the network.'],
    },
    {
      id: 'faq-photo',
      title: 'A photo won\'t upload',
      blocks: [{ ul: [
        'With no network, the photo waits for the network to come back.',
        'The message “Photo too large.”: the proxy refuses uploads over 2 MB ([[proxy]]). With nginx or Nginx Proxy Manager, the line `client_max_body_size 5m;` is missing ([[npm]]).',
      ] }],
    },
    {
      id: 'faq-lien',
      title: 'A public link doesn\'t work anymore',
      blocks: ['It has expired, or its owner stopped it, or the list was deleted (restoring a list doesn\'t bring its link back), or the note is in the trash. Ask the owner for a new link ([[lien-public]]). If it asks for a password, it\'s the one the owner wrote down when creating it.'],
    },
    {
      id: 'faq-retard',
      title: 'Changes arrive a minute late',
      blocks: ['The proxy is holding back the real-time messages ([[proxy]]). With nginx or Nginx Proxy Manager, the lines `proxy_buffering off;`, `proxy_cache off;` and `proxy_read_timeout 3600s;` are missing ([[npm]]).'],
    },
    {
      id: 'faq-blanc',
      title: 'Blank screen or frozen app',
      blocks: [{ ul: [
        'Close Listo and open it again with a network connection: it picks up the latest version. If the “New version available” banner stays on screen, tap “Reload”.',
        'Otherwise: Settings, “My account”, “Reset this phone\'s data” (on a computer: “Reset this device\'s data”); pending changes are kept.',
        'As a last resort, clear the site\'s data in the browser (Chrome: padlock to the left of the address, ‘Site settings’, ‘Delete data’; iPhone: Settings, Safari, Advanced, Website Data), then sign in again.',
        'Android, installed app, bottom of the screen hidden by the navigation bar: close the app completely, then open it again; otherwise uninstall it and install it again (wait for “Up to date” first, so you don\'t lose anything).',
        'Every phone is affected: the person who runs the server checks `docker logs listo` and `https://listo.exemple.fr/healthz` ([operations guide, in the repository, in French](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#depannage-serveur)).',
      ] }],
    },
    {
      id: 'faq-connexion',
      title: 'I can\'t sign in',
      blocks: [{ ul: [
        '“Too many attempts”: 5 wrong passwords block signing in for 15 minutes. Wait, or the person who runs the server restarts Listo (`docker compose restart`).',
        '“Request rejected: unknown origin.”: the address you typed isn\'t exactly the one in `LISTO_PUBLIC_URL` (another subdomain, `http` instead of `https`) ([[dossier]]).',
        'Forgotten password, lost phone: [[oubli]].',
        '“This account signs in with” followed by the provider\'s name: the Admin chose “… only” for your account; use “Sign in with …” ([[sso]]).',
        'Offline mode or installing on the home screen doesn\'t work: Listo isn\'t opened over HTTPS. Always go through `https://listo.exemple.fr`, never through `http://IP:13300`.',
      ] }],
    },
    {
      id: 'faq-double-auth',
      title: 'Two-factor authentication: locked out',
      blocks: [{ ul: [
        'Phone changed or lost: sign in with one of your “Recovery codes” (“Use a recovery code”), then turn two-factor authentication back on with the new phone ([[double-auth]]).',
        'No phone and no recovery codes left: the Admin chooses “Disable two-factor authentication” on your account (“Administration”, “Accounts”, ⋮ button). You sign in with just your password, then turn it back on.',
        'It\'s the Admin who is locked out: see [[secours]] (recovery command with `--remove-2fa`).',
        'The 6-digit code is always refused: the phone\'s clock may be wrong; set it to automatic.',
        'Nobody can get their codes accepted anymore after a server failure: the secret key may have been lost ([[cle-perdue]]).',
      ] }],
    },
    {
      id: 'cle-perdue',
      title: 'The secret key was lost',
      server: true,
      blocks: [
        'Without a copy of `secrets/secret.key`, Listo creates a new key at startup. Lists, items, photos and passwords aren\'t affected, but:',
        { ul: [
          'two-factor authentication can no longer be read: the Admin disables it for the other accounts (“Disable two-factor authentication”), for themselves with the recovery command and `--remove-2fa` ([[secours]]), then everyone turns it back on;',
          'public links already created still work, but their address can no longer be shown again: stop them and create new ones;',
          'this time, keep a copy of the new key ([[cle]]).',
        ] },
      ],
    },
    {
      id: 'version',
      title: 'Knowing a new version exists',
      blocks: [
        'In Settings, the “About” line shows the installed version, or the “Update” badge when a newer version exists. Tap it: on the “About” page, on the version line, the Admin sees the status of the check:',
        { ul: [
          '“Up to date”: the installed image is the latest one built;',
          '‘Checked 15 min ago’, with a “New version” badge followed by its number (for example ‘New version: 9f8e7d6’): a newer image exists; to get it: [operations guide, in the repository, in French](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#mises-a-jour);',
          '“Couldn\'t check”: GitHub didn\'t answer. No consequence: Listo works normally;',
          'the refresh button, at the end of the line, asks again right away (once a minute at most).',
        ] },
        'It\'s the server (not the phone) that asks GitHub, at most once an hour, with no account or token, which is the latest commit whose image was built. Listo never updates itself. Other accounts only see the version. To disable the check: `LISTO_UPDATE_CHECK=off` in `docker-compose.yml` (the line is already there, commented out), then `docker compose up -d`.',
      ],
    },
    {
      id: 'faq-suggestion',
      title: 'A typo keeps coming back in the suggestions',
      blocks: ['The Admin: Settings, “Administration”, “Shopping” tab, “Items”. Search for the name and “Correct”: Listo says how many items and in how many shopping lists it will be corrected, then corrects it everywhere (if it already exists, the two are merged). “Remove” only takes it out of the suggestions, without touching the lists. A corrected or removed name can come back if someone types it again.'],
    },
    {
      id: 'faq-orphelin',
      title: 'Wish list: a participant has left',
      blocks: ['A relative reserved, then left the list or had their account disabled: they remain a participant. On a list created for someone else, the owner sees them and can “Remove” them, or “Release” the whole wish. On a ‘for me’ list, nobody can (the owner is the recipient and doesn\'t see reservations, that\'s on purpose): the other participants can only open or close the reservation. If the relative was only disabled, the Admin can turn their account back on long enough for them to “Leave”; otherwise, delete the wish and create it again.'],
    },
  ],
};
