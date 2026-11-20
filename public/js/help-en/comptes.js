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
        "Then “Create Admin account”. This account then creates all the others.",
      ],
    },
    {
      id: 'creer-comptes',
      title: "Creating the other accounts",
      blocks: [
        "The Admin goes to Settings, “Administration”, “Accounts” tab, “Add account”.",
        { ul: [
          "“Username”: what the person will type to sign in;",
          "“Display name (optional)”: the first name shown to the others (‘Added by Marie’);",
          "“Temporary password”: to give to the person; they'll replace it the first time they sign in;",
          "“Role”: “User” or “Admin”.",
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
      blocks: ["Settings, “My account”, “Password”: “Current password”, “New password” (at least 10 characters), “Confirm password”, then “Save”. Your other devices are then signed out, and so are your Claude connections ([[claude-connexions]])."],
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
        "A temporary password is shown once: sign in with it, then choose a new one. If two-factor authentication can't be used either, add `--retirer-2fa` at the end of the command. The account's Claude connections are cut off ([[claude-connexions]]). What the Admin can and can't do: [[role-admin]].",
      ],
    },
    {
      id: 'sso',
      title: "Signing in with an identity provider",
      blocks: [
        "If the server offers it, the sign-in screen also shows “Sign in with …”, followed by the name chosen by the Admin (Authelia, Authentik, Pocket ID…; “SSO” if they didn't choose one). Tap it and sign in with that provider: you come back to Listo, signed in. Your account with the provider opens the Listo account that has the same username. Your Listo username and password still work. If the Admin had given you a temporary password, it's erased the first time you sign in through the provider.",
        "When you're signed in through the provider, “My account” says so (“Signed in with …”): your password and two-factor authentication are changed with the provider, not in Listo. Authorizing Claude is then also confirmed with the provider ([[claude-connecter]]).",
        "No Listo account yet: “Your account request has been sent to the Admin”. The Admin sees it in Settings, “Administration” (badge), “Accounts” tab, “Account request” section: “Accept” (they can correct the username and name, and choose the role), or “Decline”. Once it's accepted, sign in again through the provider. A declined request can't be made again for 30 days.",
      ],
    },
  ],
};
