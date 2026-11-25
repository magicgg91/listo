// Guide de Listo en anglais : chapitre « Les comptes » (voir public/js/help-content.js).
export default {
  id: 'comptes',
  title: "Accounts",
  sections: [
    {
      id: 'premier-admin',
      title: "The first Admin",
      blocks: [
        "The very first time Listo is opened, the “Welcome to Listo” screen asks for:",
        { ul: [
          "“Username”: 2 to 50 characters (letters with no accents, numbers, . _ -);",
          "“Password”: at least 10 characters, then “Confirm password”;",
          "“Setup code”: the one shown in the server logs ([[demarrage]]).",
        ] },
        "Then “Create Admin account”. This account then creates all the others. A new installation has no stores or aisles: the Admin creates them in “Administration”, “Shopping” tab ([[role-admin]]), or everyone creates them as they go, with “New store…” and “New aisle…”.",
      ],
    },
    {
      id: 'creer-comptes',
      title: "Creating the other accounts",
      blocks: [
        "The Admin goes to Settings, “Administration”, “Accounts” tab, “Add account”.",
        { ul: [
          "“Role”: “User”, “Guest” or “Admin” ([[roles-comptes]]);",
          "“Allowed features”: what the account can use, ticked according to the role (everything for a user, nothing for a guest) ([[roles-comptes]]);",
          "“Username”: what the person will type to sign in;",
          "“Display name (optional)”: the first name shown to the others (‘Added by Marie’);",
          "“Sign-in” (only with an identity provider, [[sso-serveur]]): “Password or …” (the default, guests included) or “… only”: the person will get in through the provider, with the same username, without a Listo password;",
          "“Temporary password”: to give to the person; they'll replace it the first time they sign in. Not asked for an “… only” account.",
        ] },
      ],
    },
    {
      id: 'roles-comptes',
      title: "Account roles: Admin, User, Guest",
      blocks: [
        "Each account has a role, chosen by the Admin:",
        { ul: [
          "“Admin”: everything, Administration included ([[role-admin]]);",
          "“User”: the family, who use Listo normally;",
          "“Guest”: someone who helps you (on a project, for example). A guest is always discreet: only the Admin sees them in the list of people (“Share”, “For whom?”), with “Guest · discreet” under their name; the family doesn't see them, and they see nobody in that list.",
        ] },
        "In a list, a note or a project shared with a guest, the members see each other, as for everyone (people, assigned tasks and cards, comments, history). A family member who shares a project with a guest therefore sees them in that project, and only there.",
        "A guest never shares what they own: no people, no public link; they see “People” instead of “Share”. The Admin shares with them. They're never the person a wish list is meant for either.",
        "On their account, a guest sees the “Guest” badge (Settings, “My account”) and the “Guest account” box.",
        { sub: "What a guest sees" },
        { ul: [
          "Only the features the Admin allowed them. A guest who only has projects has a bottom bar with three buttons, “Home”, “Projects” and “Settings”, and four with “Due” when a project they see has the “Due dates” option enabled; on a computer, a menu on the left reduced the same way.",
          "As long as none of their features is enabled, Home greets them with a “Welcome” card: it names the feature to enable (for example ‘Enable projects in Settings › Features to see the ones shared with you’) and leads to Settings, “Features”; with no feature allowed at all, it says the Admin hasn't opened any for them yet.",
          "In “Share” and “For whom?”, they see nobody; they only see the members of what's shared with them.",
          "AI assistants only if the Admin allowed them ([[claude-connecter]]).",
        ] },
        { sub: "Allowed features" },
        "On an account's page (Administration, “Accounts” tab, ⋮ button), under “Role”, the Admin ticks what the person can use. The tick allows; the person then enables the feature in Settings, “Features” ([[echeances]]). Unticked, the feature disappears from their screens and Listo refuses it; nothing is erased, everything comes back if you tick it again.",
        { ul: [
          "“Lists”: for a guest only, first (a user and an Admin always have lists, without a tick). Without it, the guest sees nothing of lists: no “Lists”, no “To give”, none of the lists shared with them (they stay for the other members), and “Due” only if a project they see has the “Due” option on ([[projets-echeances]]). No list can be shared with them: “Doesn't use lists” under their name.",
          "“Notes” and “Projects”: for a user, ticked at first; they enable them themselves. For a guest, nothing is ticked at first; a ticked feature (“Lists”, “Notes” or “Projects”) is enabled for them right away, and they can disable it later.",
          "Unticking “Notes” also stops the public links of their notes, and unticking “Lists” those of their lists; the confirmation says so.",
          "“Can create their own projects” (under “Projects”): without it, neither “New project” nor “Duplicate project”; projects shared with them stay usable.",
          "“AI assistants”: without it, the person can't connect an AI assistant ([[claude-connecter]]), and their connections are disconnected right away.",
          "Note labels are shared by the household: a guest who has notes sees them.",
          "An Admin has access to everything: their page has no ticks.",
        ] },
        { sub: "Changing an account's role" },
        { ul: [
          "Administration, “Accounts” tab, the account's ⋮ button: its page opens (on a computer, to the right of the list). Tap “User”, “Guest” or “Admin”.",
          "From “User” to “Guest”: a confirmation says what changes, and what they keep (their allowed and enabled features don't change, lists included: untick what's needed afterwards). What's already shared with the person stays shared; their public links are stopped. Not possible while a wish list is meant for them.",
          "From “Guest” to “User”: a confirmation says they'll be visible to the whole family again, and will see all the accounts.",
          "A guest doesn't become an Admin directly, nor an Admin a guest: go through “User” first. Nobody changes their own role, and there's always at least one active Admin.",
        ] },
      ],
    },
    {
      id: 'premiere-connexion',
      title: "Signing in for the first time",
      blocks: [{ ol: [
        "Open Listo's address (for example `https://listo.exemple.fr`).",
        "Enter your “Username” and your “Password”, then “Sign in”.",
        "With a temporary password, the “New password” screen asks you to choose a new one (at least 10 characters), then “Save”.",
        "You stay signed in for 30 days on this phone (the person who runs the server can change this).",
      ] }],
    },
    {
      id: 'telephone',
      title: "Installing Listo on your phone",
      blocks: [
        "Open Listo's address and sign in, then:",
        { ul: [
          "iPhone (Safari): ‘Share’ button (square with an arrow), ‘Add to Home Screen’, then ‘Add’.",
          "Android (Chrome): ⋮ menu, ‘Install app’ (or ‘Add to Home screen’).",
        ] },
        "The Listo icon appears. When you open it from the home screen, Listo shows full screen and also works without a network. On iPhone, the installed app has its own sign-in, separate from Safari: you need to sign in to it once.",
      ],
    },
    {
      id: 'mot-de-passe',
      title: "Changing your password",
      blocks: ["Settings, “My account”, “Password”: “Current password”, “New password” (at least 10 characters), “Confirm password”, then “Save”. Your other devices are then signed out, and so are your AI assistant connections ([[claude-connexions]]). When you're signed in through an identity provider, or with an “… only” account, “My account” has neither “Password” nor “Two-factor authentication”: they're managed at the provider ([[sso]])."],
    },
    {
      id: 'double-auth',
      title: "Two-factor authentication and recovery codes",
      blocks: [
        "Recommended for the Admin. You need an authenticator app on your phone (Aegis, Google Authenticator, Microsoft Authenticator…).",
        { ol: [
          "Settings, “My account”, “Two-factor authentication”.",
          "“Step 1 of 2”: scan the QR code with the app (or copy the key shown under “Or enter this key”), enter the “6-digit code” it shows, then “Verify and enable”.",
          "“Step 2 of 2”: Listo shows 10 “Recovery codes”, only once. “Copy codes”, keep them in a password manager, then “I've saved my codes”.",
        ] },
        "After that, each sign-in asks for your password, then the code (“Two-factor authentication”). Without your phone, “Use a recovery code”: each code works only once.",
        "To turn it off: same screen, “Password” and “Code” (from the app, or a recovery code), then “Disable two-factor authentication”.",
      ],
    },
    {
      id: 'oubli',
      title: "Forgotten password, lost phone",
      blocks: [{ ul: [
        "Forgotten password: ask the Admin. In “Administration”, “Accounts”, the ⋮ button of your account, “Reset password”: they give you a temporary password, to change the next time you sign in. Nothing is sent by email.",
        "Lost the phone you use for two-factor authentication, and no recovery codes left: the Admin chooses “Disable two-factor authentication” on your account; you can turn it on again afterwards.",
        "Too many attempts: 5 wrong passwords block signing in for 15 minutes.",
        "The Admin has lost their own password: see [[secours]].",
      ] }],
    },
    {
      id: 'secours',
      title: "Lost Admin account",
      server: true,
      blocks: [
        "If there's another Admin, they use “Reset password” ([[role-admin]]). Otherwise, on the server (replace `identifiant` with the account's username):",
        { code: 'docker exec -u node listo node server/admin-secours.js identifiant' },
        "A temporary password is shown once: sign in with it, then choose a new one. If two-factor authentication can't be used either, add `--remove-2fa` at the end of the command. The account's AI assistant connections are cut off ([[claude-connexions]]). What the Admin can and can't do: [[role-admin]].",
      ],
    },
    {
      id: 'sso',
      title: "Signing in with an identity provider",
      blocks: [
        "If the server offers it, the sign-in screen also shows “Sign in with …”, followed by the name chosen by the Admin (Authelia, Authentik, Pocket ID…; “SSO” if they didn't choose one). Tap it and sign in with that provider: you come back to Listo, signed in. Your account with the provider opens the Listo account that has the same username. Your Listo username and password still work. If the Admin had given you a temporary password, it's erased the first time you sign in through the provider.",
        "When you're signed in through the provider, “My account” says so (“Signed in with …”): your password and two-factor authentication are changed with the provider, not in Listo. Authorizing an AI assistant is then also confirmed with the provider ([[claude-connecter]]).",
        "The Admin can reserve your account for the provider: “… only”. You then get in only with “Sign in with …”; with your Listo password, even the right one, the screen answers “This account signs in with” followed by the provider's name, and doesn't sign you in. “My account” has neither “Password” nor “Two-factor authentication”. If the provider is down, ask the Admin ([[sso-serveur]]).",
        "No Listo account yet: “Your account request has been sent to the Admin”. The Admin sees it in Settings, “Administration” (badge), “Accounts” tab, “Account request” section: “Accept” (they can correct the username and name, and choose the role), or “Decline”. Once it's accepted, sign in again through the provider. A declined request can't be made again for 30 days.",
      ],
    },
  ],
};
