// Guide de Listo en anglais : chapitre « MCP Claude » (voir public/js/help-content.js).
export default {
  id: 'claude',
  title: 'Claude MCP',
  sections: [
    {
      id: 'claude-quoi',
      title: 'What it\'s for',
      blocks: [
        'Claude is Anthropic\'s assistant (claude.ai, the mobile app, Claude Desktop, Claude Code). Once it\'s connected to Listo, it can read your lists and, if you allow it, add items to them, check them and edit them, just by asking.',
        'Claude acts with your account and your rights, never more: what it adds shows up under your name, as if you had done it yourself, and it only sees the lists you allowed it to.',
        'This access only exists if the person who runs the server has turned it on ([[claude-activation]]). Otherwise, the “Claude” section doesn\'t appear in “My account”.',
      ],
    },
    {
      id: 'claude-phrases',
      title: 'Example sentences',
      blocks: [
        { ul: [
          'Read: ‘What are my Listo lists?’, ‘What\'s on the Groceries list?’.',
          'Add, with an aisle: ‘Add tomatoes to the produce aisle in Groceries.’',
          'Add, with a store (“Multi” list): ‘Add milk at Costco to the Saturday list.’',
          'Check: ‘Check off the bread and the butter.’ Uncheck: ‘Uncheck the milk.’',
          'Priority and due date (task list): ‘Make the Light bulb task high priority, due Friday.’',
          'Time and reminder ([[heure]]): ‘Dentist Thursday at 2 pm, remind me an hour before.’ ‘No more reminder for the dentist.’',
          'Assign ([[attribuer]]): ‘Give the light bulb task to Léa.’ ‘What do I have to do this week?’ ‘The garage, for Léa and Marc.’ ‘Trash every Monday, taking turns: Léa, Marc, Zoé.’',
          'Task that repeats ([[repeter]]): ‘Trash, every Monday and Thursday.’ ‘Rent, on the 5th of every month.’ ‘The meeting, on the first Monday of the month.’ ‘Stop repeating the watering.’ Claude tells you the next date. If it checks a task that repeats, the task comes back on its next date, and Claude tells you that date.',
          'Rename or add details: ‘Rename milk to 2% milk’, ‘Add the note organic to the apples.’',
          'Move to an aisle: ‘Put the milk in the dairy aisle.’',
          'Subtasks ([[sous-taches]]): ‘Add the steps Batch 1, Batch 2 and Batch 3 under the Authelia task.’ ‘Put Bitwarden under the Accounts task.’ ‘Take Mac out of its main task.’ ‘Put Check backups first under Authelia.’',
        ] },
        'Claude first reads the list to learn its aisles or stores, and it must never make any up. If an item was left without an aisle or a store, it must tell you. Exactly how Claude behaves is up to Claude: check in Listo.',
      ],
    },
    {
      id: 'claude-niveaux',
      title: 'Two levels of access',
      blocks: [
        'When you connect Claude, Listo\'s “Authorize Claude” screen lets you choose:',
        { ul: [
          '“Read only” (selected at first): Claude can read your lists, without changing anything.',
          '“Read and write”: on top of that, Claude can add items, check or uncheck them, and change their name, quantity, note, priority, due date (date, time, reminder), repeat, the person they\'re assigned to, their aisle or their store.',
        ] },
        'You also choose “All my lists” or “Some lists”. Even with “Read and write”, Claude can only write in lists where you yourself can write: if you have the “Read only” right on a list, it can only read it.',
      ],
    },
    {
      id: 'claude-jamais',
      title: 'What Claude can never do',
      blocks: [
        'Whatever the level of access, Claude can never:',
        { ul: [
          'delete an item, or change its link or its price;',
          'create, rename, delete or share a list;',
          'manage people, the public link or the trash;',
          'see photos, or who added what.',
        ] },
      ],
    },
    {
      id: 'claude-envies',
      title: 'Wish lists: no reservations',
      blocks: ['Claude never receives any reservation data, for anyone: not who reserved, not even whether a wish is reserved. So the surprise is kept, even if the recipient asks Claude. In a wish list, checking means ‘received’: only the recipient and the list\'s owner can do it, with or without Claude.'],
    },
    {
      id: 'claude-limites',
      title: 'Limits',
      blocks: [{ ul: [
        '20 items at most per request.',
        'Per connection and per hour: 100 additions, 300 items checked or unchecked, 300 items edited. Beyond that, Claude gets a refusal and nothing is written.',
        '120 calls per minute per connection.',
        '5 active Claude connections at most per account; a connection unused for 30 days frees itself up.',
        'Claude doesn\'t create an item with the same name as one that\'s already there and not checked: it tells you instead.',
      ] }],
    },
    {
      id: 'claude-connecter',
      title: 'Connect Claude',
      blocks: [
        { ol: [
          'In Listo: Settings, “My account”, “Claude” section, “Claude connections”. Under “Address to enter in Claude”, tap “Copy address”. It looks like `https://listo.exemple.fr/mcp`.',
          'In Claude (claude.ai, the mobile app or Claude Desktop): in its settings, add a custom connector with this address.',
          'Claude opens Listo\'s “Authorize Claude” screen. Check that you\'re the one who just started the connection, choose the level and the lists, enter your password (and your two-factor authentication code), then “Authorize”.',
        ] },
        'Signed in with an identity provider ([[sso]]): no password at this step. The screen first asks “Confirm with …”: the provider asks you to sign in again, then you come back to choose the level and the lists, and “Authorize”.',
        'With Claude Code, on a computer: `claude mcp add --transport http listo https://listo.exemple.fr/mcp`, then `/mcp` to authorize.',
        'If you didn\'t start the connection yourself, tap “Deny”.',
      ],
    },
    {
      id: 'claude-connexions',
      title: 'See and disconnect Claude',
      blocks: [
        'Settings, “My account”, “Claude connections”: every authorized connection appears there, with the app, its right (“Read only” or “Read and write”), its lists, its date and when it was last used.',
        { ul: [
          '“Disconnect” cuts a connection right away; “Disconnect all” cuts them all. No password is asked.',
          'Changing your password also disconnects all your Claude connections.',
          'To reconnect Claude, you have to authorize it again.',
          'The Admin doesn\'t see other accounts\' Claude connections; but disabling an account or resetting its password cuts them all.',
        ] },
      ],
    },
    {
      id: 'claude-prudence',
      title: 'Be careful: booby-trapped texts',
      blocks: [
        { note: 'A shared list can contain a booby-trapped text, written by someone else to trick Claude (for example a note asking it to check everything). Listo always presents list content to Claude as data, never as instructions, but only choose “Read and write” if you need it.' },
        'Only ask Claude to change an item yourself; check in Listo what it did.',
      ],
    },
    {
      id: 'faq-claude',
      title: 'Troubleshooting',
      blocks: [{ ul: [
        'After a Listo update, Claude may keep its old list of tools: start a new conversation, or disconnect and reconnect the connector in Claude.',
        'A list is missing: the connection may only allow some lists, or you\'re no longer a member. Reconnect Claude with “All my lists” ([[claude-connecter]]).',
        'Claude refuses to write: the connection is “Read only”, or you only have the “Read only” right on this list.',
        'Nothing works anymore: the connection may have been cut (password changed, “Disconnect”). See “Claude connections” ([[claude-connexions]]).',
        'Claude says an aisle or a store is unknown: it doesn\'t exist, it\'s disabled, or this list doesn\'t offer it (an aisle from another store, or a store in a “Multi” list). Nothing was added; Claude should list the valid aisles or stores for you. Choose one, or ask the Admin to create it (Settings, “Administration”, “Shopping” tab).',
        'Claude says a store can\'t be chosen in this list: in a list with a “Single” store, the store is the list\'s own; you choose the aisle. The aisle, for its part, can\'t be chosen in a “Multi” list.',
      ] }],
    },
    {
      id: 'claude-activation',
      title: 'Access turned off at first',
      blocks: ['Access from Claude is turned off until the person who runs the server puts `LISTO_MCP=on` in `docker-compose.yml` ([[mcp-serveur]]). While it\'s off, all its addresses answer as if they didn\'t exist, and the “Claude” section of “My account” doesn\'t appear.'],
    },
    {
      id: 'mcp-serveur',
      title: 'Turn on access on the server',
      server: true,
      blocks: [
        'Access from Claude is turned off by default. To turn it on, add `- LISTO_MCP=on` in the `environment:` part of `docker-compose.yml`, then `docker compose up -d`. To turn it off: remove the line, then `docker compose up -d`; all its addresses then answer 404, and the connections already granted stop working (they come back if you turn it on again, as long as they haven\'t expired). No password or key is needed.',
        'Proxy: nothing to set up, these addresses go through the same host. The subdomain must have an IPv4 address (DNS ‘A’ record): Claude doesn\'t use IPv6. These addresses must stay reachable from the Internet: Claude calls them from Anthropic\'s servers, Claude Code from your computer. If a firewall filters incoming connections, don\'t copy an address range found somewhere else: Anthropic publishes the up-to-date list of addresses these calls come from on its official [‘IP addresses’](https://platform.claude.com/docs/en/api/ip-addresses) page, section ‘Outbound IP addresses’, and may change it.',
        { table: {
          head: ['Address', 'Who calls it', 'Role'],
          rows: [
            ['`/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-protected-resource`', 'Claude', 'Says where to ask for authorization.'],
            ['`/.well-known/oauth-authorization-server`', 'Claude', 'Description of the authorization server.'],
            ['`/oauth/authorize`', 'your browser', 'Checks the request, then opens the “Authorize Claude” screen.'],
            ['`/oauth/token`, `/oauth/revoke`, `/oauth/register`', 'Claude', 'Tokens, revocation, automatic registration.'],
            ['`/mcp`', 'Claude', 'The MCP server: requires a token obtained through authorization; without a valid token, refusal (401).'],
          ],
        } },
      ],
    },
    {
      id: 'mcp-regles',
      title: 'Rules and log',
      server: true,
      blocks: [
        { ul: [
          'Access token: 1 hour; refresh token: 30 rolling days, replaced at each use; an old token presented again brings down the whole connection. The database only keeps a fingerprint of the tokens, never the tokens themselves.',
          'A Claude token opens nothing but `/mcp`: not the app, not its other addresses.',
          'Changing your password, or an account that is disabled or whose password is reset (including with the recovery command): all its Claude connections are revoked.',
          'The caps ([[claude-limites]]) are counted in memory: they start again from zero when the container restarts.',
          'The Admin doesn\'t see other people\'s connections. In an emergency, they disable the account or reset its password. For everyone at once: remove `LISTO_MCP=on`.',
        ] },
        'Security log (never a token, a code or the content of a list): `claude.connected`, `claude.refused`, `claude.revoked`, `claude.refresh`, `claude.registered`, `claude.client_refused`, `claude.tool` (one line per tool call, with the number of items, never a typed name), `claude.token_refused`, `claude.origin_refused`.',
      ],
    },
    {
      id: 'mcp-essai',
      title: 'First try',
      server: true,
      blocks: [
        'After turning it on, once, before any regular use:',
        { ol: [
          'In a browser: `https://listo.exemple.fr/.well-known/oauth-protected-resource/mcp` shows a short text with `"resource": "https://listo.exemple.fr/mcp"`.',
          'Connect Claude ([[claude-connecter]]).',
          'Ask Claude ‘What are my Listo lists?’, then ‘What\'s on the shopping list?’: the answers must match the app. With “Read and write”: ‘Add milk to the shopping list’, ‘Check off the bread’; on a phone open on the list, the changes show up live.',
          '`docker logs listo`: lines `claude.connected` and `claude.tool`, no errors. Report any `claude.origin_refused` or `claude.client_refused` lines.',
          'More than an hour later, ask another question: it must work without a new authorization.',
          'If there\'s a problem: remove `LISTO_MCP=on`, `docker compose up -d`, and pass on the `claude.` lines from the log (they contain neither tokens nor list content).',
        ] },
      ],
    },
  ],
};
