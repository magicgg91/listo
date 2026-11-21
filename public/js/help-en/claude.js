// Guide de Listo en anglais : chapitre « Assistants IA (MCP) » (voir public/js/help-content.js).
export default {
  id: 'claude',
  title: 'AI assistants (MCP)',
  sections: [
    {
      id: 'claude-quoi',
      title: 'What it\'s for',
      blocks: [
        'An AI assistant is a program you chat with, for example Claude (Anthropic\'s assistant: claude.ai, the mobile app, Claude Desktop, Claude Code). Listo follows the MCP standard: any AI assistant that accepts a custom connector (or MCP server) can plug into it, such as Claude, ChatGPT or Mistral\'s Le Chat, depending on their versions and plans. Once it\'s connected, it can read your lists and, if you allow it, add items to them, check them and edit them, just by asking.',
        'The assistant acts with your account and your rights, never more: what it adds shows up under your name, as if you had done it yourself, and it only sees the lists you allowed it to. Nothing happens without your approval, given on Listo\'s “Authorize an AI assistant” screen.',
        'This access only exists if the person who runs the server has turned it on ([[claude-activation]]). Otherwise, the “AI assistants” section doesn\'t appear in “My account”.',
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
          'Task that repeats ([[repeter]]): ‘Trash, every Monday and Thursday.’ ‘Rent, on the 5th of every month.’ ‘The meeting, on the first Monday of the month.’ ‘Stop repeating the watering.’ The assistant tells you the next date. If it checks a task that repeats, the task comes back on its next date, and the assistant tells you that date.',
          'Rename or add details: ‘Rename milk to 2% milk’, ‘Add the note organic to the apples.’',
          'Move to an aisle: ‘Put the milk in the dairy aisle.’',
          'Subtasks ([[sous-taches]]): ‘Add the steps Batch 1, Batch 2 and Batch 3 under the Authelia task.’ ‘Put Bitwarden under the Accounts task.’ ‘Take Mac out of its main task.’ ‘Put Check backups first under Authelia.’',
        ] },
        'The assistant first reads the list to learn its aisles or stores, and it must never make any up. If an item was left without an aisle or a store, it must tell you. Exactly how it behaves is up to the assistant itself: check in Listo.',
      ],
    },
    {
      id: 'claude-niveaux',
      title: 'Two levels of access',
      blocks: [
        'When you connect an assistant, Listo\'s “Authorize an AI assistant” screen lets you choose:',
        { ul: [
          '“Read only” (selected at first): the assistant can read your lists, without changing anything.',
          '“Read and write”: on top of that, the assistant can add items, check or uncheck them, and change their name, quantity, note, priority, due date (date, time, reminder), repeat, the person they\'re assigned to, their aisle or their store.',
        ] },
        'You also choose “All my lists” or “Some lists”. Even with “Read and write”, the assistant can only write in lists where you yourself can write: if you have the “Read only” right on a list, it can only read it.',
      ],
    },
    {
      id: 'claude-jamais',
      title: 'What an assistant can never do',
      blocks: [
        'Whatever the level of access, an AI assistant can never:',
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
      blocks: ['An AI assistant never receives any reservation data, for anyone: not who reserved, not even whether a wish is reserved. So the surprise is kept, even if the recipient asks their assistant. In a wish list, checking means ‘received’: only the recipient and the list\'s owner can do it, with or without an assistant.'],
    },
    {
      id: 'claude-limites',
      title: 'Limits',
      blocks: [{ ul: [
        '20 items at most per request.',
        'Per connection and per hour: 100 additions, 300 items checked or unchecked, 300 items edited. Beyond that, the assistant gets a refusal and nothing is written.',
        '120 calls per minute per connection.',
        '5 active AI assistant connections at most per account; a connection unused for 30 days frees itself up.',
        'The assistant doesn\'t create an item with the same name as one that\'s already there and not checked: it tells you instead.',
      ] }],
    },
    {
      id: 'claude-connecter',
      title: 'Connect an AI assistant',
      blocks: [
        'The steps are the same for every assistant:',
        { ol: [
          'In Listo: Settings, “My account”, “AI assistants” section, “AI assistants”. Under “Address to enter in your AI assistant”, tap “Copy address”. It looks like `https://listo.exemple.fr/mcp`.',
          'In your AI assistant: in its settings, add a custom connector (or MCP server) with this address. Menu names change from one assistant to another; see its help.',
          'The assistant opens Listo\'s “Authorize an AI assistant” screen. Check the website shown under “The response will be sent here” and that you\'re the one who just started the connection ([[assistant-site]]), choose the level and the lists, enter your password (and your two-factor authentication code), then “Authorize”.',
        ] },
        'Example with Claude (claude.ai, the mobile app or Claude Desktop): in its settings, add a custom connector with Listo\'s address, then connect it; on the “Authorize an AI assistant” screen, the website shown is `claude.ai`.',
        'With Claude Code, on a computer: `claude mcp add --transport http listo https://listo.exemple.fr/mcp`, then `/mcp` to authorize. The response then goes to “an app on this computer (localhost)”.',
        'Signed in with an identity provider ([[sso]]): no password at this step. The screen first asks “Confirm with …”: the provider asks you to sign in again, then you come back to choose the level and the lists, and “Authorize”.',
        'If you didn\'t start the connection yourself, tap “Deny”.',
      ],
    },
    {
      id: 'claude-connexions',
      title: 'See and disconnect an AI assistant',
      blocks: [
        'Settings, “My account”, “AI assistants”: every authorized connection appears there, with the app, its right (“Read only” or “Read and write”), its lists, its date and when it was last used.',
        { ul: [
          '“Disconnect” cuts a connection right away; “Disconnect all” cuts them all. No password is asked.',
          'Changing your password also disconnects all your AI assistant connections.',
          'To reconnect an assistant, you have to authorize it again.',
          'The Admin doesn\'t see other accounts\' AI assistant connections; but disabling an account or resetting its password cuts them all.',
        ] },
      ],
    },
    {
      id: 'assistant-site',
      title: 'Be careful: check the website',
      blocks: [
        { note: 'Any AI assistant that follows the standard can ask for access to Listo: you are the one who decides, on the “Authorize an AI assistant” screen. It shows in large type the website that will receive the response (for example `claude.ai` for Claude). Check that it really is your assistant\'s. If you didn\'t start the connection yourself, deny: someone may be trying to get into your lists.' },
        'When the app chooses its own name, it is followed by “name given by the app, not verified”: trust the website, not the name. The person who runs the server can also accept only some websites ([[mcp-serveur]]).',
      ],
    },
    {
      id: 'claude-prudence',
      title: 'Be careful: booby-trapped texts',
      blocks: [
        { note: 'A shared list can contain a booby-trapped text, written by someone else to trick the AI assistant (for example a note asking it to check everything). Listo always presents list content to the assistant as data, never as instructions, but only choose “Read and write” if you need it.' },
        'Only ask the assistant to change an item yourself; check in Listo what it did.',
      ],
    },
    {
      id: 'faq-claude',
      title: 'Troubleshooting',
      blocks: [{ ul: [
        'After a Listo update, the assistant may keep its old list of tools: start a new conversation, or disconnect and reconnect the connector in the assistant.',
        'A list is missing: the connection may only allow some lists, or you\'re no longer a member. Reconnect the assistant with “All my lists” ([[claude-connecter]]).',
        'The assistant refuses to write: the connection is “Read only”, or you only have the “Read only” right on this list.',
        'Nothing works anymore: the connection may have been cut (password changed, “Disconnect”). See “AI assistants” ([[claude-connexions]]).',
        'Listo shows a page saying the authorization request is invalid: the assistant\'s request couldn\'t be verified (return address refused, incomplete request), or its website isn\'t accepted by the server ([[mcp-serveur]]). Start the connection again from the assistant; if it happens again, tell the person who runs the server.',
        'The assistant says an aisle or a store is unknown: it doesn\'t exist, it\'s disabled, or this list doesn\'t offer it (an aisle from another store, or a store in a “Multi” list). Nothing was added; the assistant should list the valid aisles or stores for you. Choose one, or ask the Admin to create it (Settings, “Administration”, “Shopping” tab).',
        'The assistant says a store can\'t be chosen in this list: in a list with a “Single” store, the store is the list\'s own; you choose the aisle. The aisle, for its part, can\'t be chosen in a “Multi” list.',
      ] }],
    },
    {
      id: 'claude-activation',
      title: 'Access turned off at first',
      blocks: ['Access for AI assistants is turned off until the person who runs the server puts `LISTO_MCP=on` in `docker-compose.yml` ([[mcp-serveur]]). While it\'s off, all its addresses answer as if they didn\'t exist, and the “AI assistants” section of “My account” doesn\'t appear.'],
    },
    {
      id: 'mcp-serveur',
      title: 'Turn on access on the server',
      server: true,
      blocks: [
        'Access for AI assistants is turned off by default. To turn it on, add `- LISTO_MCP=on` in the `environment:` part of `docker-compose.yml`, then `docker compose up -d`. To turn it off: remove the line, then `docker compose up -d`; all its addresses then answer 404, and the connections already granted stop working (they come back if you turn it on again, as long as they haven\'t expired). No password or key is needed.',
        'Which assistants: by default, any AI assistant that follows the standard (MCP, with OAuth 2.1 authorization and PKCE) can ask for access, always after the person approves. To accept only some websites, add for example `- LISTO_MCP_SITES=claude.ai,claude.com` (website names separated by commas, without `https://` or a path): only those websites, and apps on the computer (`localhost`, like Claude Code), can then connect. Connections already granted to another website stop working (without being deleted: they come back if you put the website back). A badly written value keeps Listo from starting, with a message in `docker logs listo`. Listo only reads an app\'s identification document (CIMD) on a short list of websites (`claude.ai`, `claude.com`, or those in `LISTO_MCP_SITES`); other assistants register on their own.',
        'Proxy: nothing to set up, these addresses go through the same host. They must stay reachable from the Internet: an online assistant calls them from its servers, an app on the computer (Claude Code) from your computer. Claude as an example: the subdomain must have an IPv4 address (DNS ‘A’ record), because Claude doesn\'t use IPv6; if a firewall filters incoming connections, don\'t copy an address range found somewhere else: Anthropic publishes the up-to-date list of addresses these calls come from on its official [‘IP addresses’](https://platform.claude.com/docs/en/api/ip-addresses) page, section ‘Outbound IP addresses’, and may change it. For another assistant, see its documentation.',
        { table: {
          head: ['Address', 'Who calls it', 'Role'],
          rows: [
            ['`/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-protected-resource`', 'the AI assistant', 'Says where to ask for authorization.'],
            ['`/.well-known/oauth-authorization-server`', 'the AI assistant', 'Description of the authorization server.'],
            ['`/oauth/authorize`', 'your browser', 'Checks the request, then opens the “Authorize an AI assistant” screen.'],
            ['`/oauth/token`, `/oauth/revoke`, `/oauth/register`', 'the AI assistant', 'Tokens, revocation, automatic registration.'],
            ['`/mcp`', 'the AI assistant', 'The MCP server: requires a token obtained through authorization; without a valid token, refusal (401).'],
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
          'An AI assistant\'s token opens nothing but `/mcp`: not the app, not its other addresses.',
          'Return addresses: https on a website name (never an IP address), without a username or fragment, or the computer (`localhost`); with `LISTO_MCP_SITES`, only those websites. They are checked at registration and at every authorization. An error is only sent back without a screen to the computer or a known website (`claude.ai`, `claude.com`, or those in `LISTO_MCP_SITES`): otherwise, Listo shows its error page, so it never acts as a relay to another website.',
          'Changing your password, or an account that is disabled or whose password is reset (including with the recovery command): all its AI assistant connections are revoked.',
          'The caps ([[claude-limites]]) are counted in memory: they start again from zero when the container restarts.',
          'The Admin doesn\'t see other people\'s connections. In an emergency, they disable the account or reset its password. For everyone at once: remove `LISTO_MCP=on`.',
        ] },
        'Security log (never a token, a code or the content of a list; the names start with `claude.` for every assistant): `claude.connected`, `claude.refused`, `claude.revoked`, `claude.refresh`, `claude.registered`, `claude.client_refused`, `claude.tool` (one line per tool call, with the number of items, never a typed name), `claude.token_refused`, `claude.origin_refused`.',
      ],
    },
    {
      id: 'mcp-essai',
      title: 'First try',
      server: true,
      blocks: [
        'After turning it on, once, before any regular use (here with Claude):',
        { ol: [
          'In a browser: `https://listo.exemple.fr/.well-known/oauth-protected-resource/mcp` shows a short text with `"resource": "https://listo.exemple.fr/mcp"`.',
          'Connect the assistant ([[claude-connecter]]).',
          'Ask the assistant ‘What are my Listo lists?’, then ‘What\'s on the shopping list?’: the answers must match the app. With “Read and write”: ‘Add milk to the shopping list’, ‘Check off the bread’; on a phone open on the list, the changes show up live.',
          '`docker logs listo`: lines `claude.connected` and `claude.tool`, no errors. Report any `claude.origin_refused` or `claude.client_refused` lines.',
          'More than an hour later, ask another question: it must work without a new authorization.',
          'If there\'s a problem: remove `LISTO_MCP=on`, `docker compose up -d`, and pass on the `claude.` lines from the log (they contain neither tokens nor list content).',
        ] },
      ],
    },
  ],
};
