// Guide de Listo en anglais : chapitre « Notifications » (voir public/js/help-content.js).
export default {
  id: 'notifications',
  title: 'Notifications',
  blocks: [
    "Listo tells you about what concerns you: a change in a shared list, a reservation, a share, every morning the tasks for the day, and a task's reminder. Everything shows up on the Notifications page (the bell on Home), even with no phone signed up. On top of that, Listo can let you know on your phone or computer, without opening it: it's optional, the feature is off by default on the server, and then everyone chooses, device by device.",
    "The Settings screen, “Notifications”, has two parts: “In the app” (what's new, badges and glow: [[nouveautes]]) and “On this device” (notifications, described here). The kinds (“Notifications you get”) apply both to the Notifications page and to your devices.",
  ],
  sections: [
    {
      id: 'notif-page',
      title: 'The Notifications page',
      blocks: [
        "The bell, at the top of Home (Home turned off: at the top of “Due”, “Lists” and “Notes”), opens the Notifications page; its badge gives the number of unread notifications (9+ above 9). The “Notifications” row of the “Account” tile leads there too. At the top right of the page, the settings button opens Settings, “Notifications”.",
        { ul: [
          "Notifications are grouped by day (“Today”, “Yesterday”, then the date), newest first. An unread notification is in bold, with a blue dot; “3 unread” says so at the top.",
          "Tapping a notification marks it as read and opens what it's about: the list, the task, the note or the due tasks. If the list was deleted or is no longer shared with you: “This list is no longer available”.",
          "Opening the page marks nothing as read: “Mark all as read” does. Opening a list, a note or the “Due” screen (from a phone notification, for example) marks the notifications about them as read. Read on one device means read on all of them.",
          "Marking as read without opening: swipe an unread notification to the right (green “Read” area); or its ⋮ button, “Mark as read”.",
          "Clearing: swipe a notification to the left, then “Clear”; or use its ⋮ button (keyboard, screen reader). “Clear all”, at the bottom, asks for confirmation.",
          "Notifications are kept for 30 days, 300 at most (the oldest ones go).",
          "Changes made close together in the same list or the same note fit on a single line, which updates (‘Léa added 4 items to “Shopping”’) and becomes unread again.",
        ] },
        "It fills up even without phone notifications (feature off on the server, device not signed up): nothing is sent anywhere but your server to fill it. Offline, it shows the last copy received; “Mark all as read” and “Clear” go out when the network is back.",
        "Same settings as the phone: a kind turned off in “Notifications you get”, or a list or a note whose notifications you turned off, doesn't show up on the page either. The page always gives the details (name of the task, of the wish); “Show details in the notification” only concerns the phone's screen. For a note, it only names the title, never the text.",
      ],
    },
    {
      id: 'notif-activer',
      title: 'Turning them on for a device',
      blocks: [
        "Settings, “Notifications”, “On this device” part, then the “Get notifications on this device” switch. The browser then asks for your permission: accept. It only asks at that moment, never on its own. “Send a test notification” checks that everything works.",
        { ul: [
          "Android: in Chrome (or another browser), or from Listo installed on the Home Screen ([[telephone]]).",
          "Computer: Chrome, Edge, Firefox or Safari. The notification appears in the corner of the screen or in the system's notification center.",
          "iPhone and iPad: first add Listo to the Home Screen ([[telephone]]), then open it from its icon. In a plain Safari tab, the screen explains this and the switch stays grayed out. You need iOS 16.4 or later.",
        ] },
        "Each device is turned on separately: a device where you sign out no longer gets anything. Tapping a notification opens Listo on the list in question.",
      ],
    },
    {
      id: 'notif-recevoir',
      title: 'What you get, and when',
      blocks: [
        "Four kinds of notifications, each turned on or off in Settings, “Notifications”, “Notifications you get” section. These settings apply to the Notifications page and to all your devices.",
        { table: {
          head: ['Kind', 'When', 'Example'],
          rows: [
            ['“Changes”', "Someone else adds, edits or checks something in a list shared with you, or assigns you a task. Changes made within a minute are grouped into a single notification per list. A shared note changed by someone else: at most one notification per note every quarter of an hour. Projects: new cards, a card assigned to you, comments and changes of a followed card ([[projets-notifications]]).", "‘Léa edited “Shopping”’, ‘Léa assigned you a task in “Home”’, ‘Léa edited the note “Travel”’"],
            ['“Wishes”', "Someone reserves a wish or chips in for a gift, in a wish list where you can see the reservations.", "‘Marc reserved a wish’"],
            ['“Sharing”', "You're added to a list, a note or a project, or your access changes.", "‘Léa added you to “Home”’, ‘Léa shared the note “Travel” with you’"],
            ['“Due”', "Every morning around 8 AM, a single summary of the tasks due today and overdue, if there are any. And a task's reminder, at the time chosen in its details ([[heure]]).", "‘3 tasks due today · 1 overdue’, ‘Reminder: a task today at 2:00 PM’"],
          ],
        } },
        "You're never notified about what you do yourself (or about what an AI assistant does for you: [[claude]]). Unchecking and deleting are not notified. The due-date summary only counts task lists where due dates are turned on, and never tasks assigned to someone else. A task's reminder goes to the person it's assigned to, otherwise to all the members of the list.",
      ],
    },
    {
      id: 'notif-detail',
      title: 'Details in the notification',
      blocks: [
        "“Content” section, “Show details in the notification”: off at first. When it's off, the notification only says who changed which list, or how many tasks are waiting for you. When it's on, it also names the items (‘Added: Milk, Bread · Checked: Milk’, ‘Marc reserved “Bike”’, the names of the first tasks of the day with their time, ‘Reminder: Dentist’). Best avoided if other people can see your phone's lock screen.",
      ],
    },
    {
      id: 'notif-silencer',
      title: 'Turning off notifications for a list',
      blocks: [
        "The list's ⋮ menu: “Turn off notifications”. It no longer sends you anything, neither on the Notifications page nor on your devices, whatever its kind (due-date summary included). “Turn notifications back on” brings them back. Everyone chooses for themselves; it's forgotten if you leave the list. A shared note has the same choice in its ⋮ menu.",
        "This is separate from “Hide what's new”, in the same menu (badges and glow, [[nouveautes]]): you can keep what's new for a list without getting its notifications, and the other way around.",
      ],
    },
    {
      id: 'notif-limites',
      title: 'Limits and wish lists',
      blocks: [{ ul: [
        "At most 30 phone notifications per person per hour (the due-date summary doesn't count); the Notifications page has no such cap.",
        "If you already have the list open on screen when someone changes it, you're not notified: you've seen it.",
        "Wish list: the person it's for never gets anything, neither on their devices nor on their Notifications page, about a reservation or a contribution, nor what others add to their list. The surprise is kept. A visitor using the public link, without an account, never gets notifications.",
      ] }],
    },
    {
      id: 'notif-confidentialite',
      title: 'What Apple, Google, Mozilla and Microsoft see',
      blocks: [
        "A notification goes through your device's service: Apple (iPhone, iPad, Safari on Mac), Google (Chrome, Android, Edge on Android), Mozilla (Firefox) or Microsoft (Edge on Windows). The text is encrypted for your device only: these services can't read it. They see the time, the size of the message, and the device that receives it.",
        "This is the third exception to the principle ‘no data sent anywhere but your server’, along with the version check and scan mode ([[limites]]). It only exists if the person who runs the server turns the feature on.",
      ],
    },
    {
      id: 'notif-serveur',
      title: 'Turning the feature on on the server',
      server: true,
      blocks: [
        "Off by default. To turn it on, uncomment the `- LISTO_PUSH=on` line in `docker-compose.yml`, then:",
        { code: 'docker compose up -d' },
        "The due-date summary goes out around 8 AM in the server's time zone: set `TZ` (for example `TZ=Europe/Paris`, already in the shipped file), otherwise it arrives at 8 AM universal time ([[variables]]).",
        "On first start, Listo creates its notification keys in `secrets/vapid.json`, next to the secret key. Keep a copy of it along with the key ([[cle]]). If this file is lost, Listo creates a new one: each device that already gave permission subscribes again by itself the next time it opens Listo; otherwise, just turn the switch back on.",
        "The server must be able to reach the notification services over HTTPS (fcm.googleapis.com, push.services.mozilla.com, push.apple.com, notify.windows.com). When the feature is off, no key is created and no request goes out to them; the Notifications page, the morning summary and reminders still work, in the app only ([[notif-page]]).",
      ],
    },
    {
      id: 'notif-depannage',
      title: 'Nothing shows up',
      blocks: [{ ul: [
        "The screen says notifications were blocked: allow them in your browser or phone settings (notifications for this site, or for the Listo app), then come back to Settings, “Notifications”.",
        "On iPhone: Listo must be installed on the Home Screen and opened from its icon, not from Safari.",
        "The list was already open on screen: nothing is sent for what you've seen.",
        "A change arrives about a minute later (grouping); the due-date summary, only around 8 AM.",
        "Firefox after an update: quit it completely and open it again, then “Send a test notification”.",
        "On a computer, the system must also allow the browser's notifications, in addition to Listo in the browser. On Mac: System Settings › Notifications › Firefox (or Chrome, Edge, Brave…), ‘Allow notifications’ turned on, style ‘Banners’ or ‘Alerts’; macOS keeps it off as long as you've never answered its request. On Windows: Settings › System › Notifications, notifications turned on and the browser allowed in the list. In Firefox, also check that ‘Pause notifications until Firefox restarts’ is not checked (Settings › Privacy & Security › Permissions › Notifications).",
        "On a computer, the screen says the browser couldn't register with its notification service: the browser must be able to reach this service over the Internet (Google for Chrome and Brave, Microsoft for Edge, Mozilla for Firefox). A DNS filter (AdGuard, Pi-hole…), an ad blocker (uBlock Origin…), a proxy, a firewall or a VPN can prevent it, even if other sites that are already registered keep getting their notifications. To find out what to unblock: open the filter's query log, turn on notifications in Listo, and allow the addresses refused at that moment; they are the ones of the browser's service, for example …googleapis.com or …google.com for Chrome and Brave, …notify.windows.com or …wns.windows.com for Edge, …push.services.mozilla.com for Firefox. With a blocker in the browser, turn it off for a moment on Listo to try. In Brave, you also need to turn on ‘Use Google services for push messaging’ in its settings (Privacy and security), then restart it. The message gives the details provided by the browser.",
        "Also check the phone's ‘Do Not Disturb’ or ‘Focus’ mode, the kind of notification in “Notifications you get”, and that the list's notifications aren't turned off. The screen says “Notifications on devices are turned off on this Listo server”: see [[notif-serveur]]. In any case, the Notifications page keeps what you would have received ([[notif-page]]).",
      ] }],
    },
  ],
};
