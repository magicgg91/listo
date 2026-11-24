# Listo: the guide

<!-- Fichier fabriqué par scripts/guide.js à partir de public/js/help-content-en.js : ne pas le modifier à la main. -->

The complete Listo manual, the same as the app's “Help” page (Settings › “Help”) and the online page [https://magicgg91.github.io/listo/](https://magicgg91.github.io/listo/). Parts marked “For the person who runs the server” only concern installing the server; its upkeep (restoring, updates, logs) is described in the operations guide, [docs/exploitation.md](exploitation.md) (in French). French version: [docs/guide.md](guide.md).

## Contents

<details>
<summary>1. Introduction</summary>

- [Go to chapter](#presentation)
- [1.1 What Listo is](#listo)
- [1.2 What Listo doesn't do](#limites)
- [1.3 Three types of list](#types)
- [1.4 Vocabulary](#vocabulaire)

</details>

<details>
<summary>2. What you can do</summary>

- [Go to chapter](#possibilites)
- [2.1 Lists shared live](#p-partage)
- [2.2 Shopping: aisles and stores](#p-courses)
- [2.3 Tasks: priority, due date, time, reminder, repeat, assignment](#p-taches)
- [2.4 Wishes: reserving and chipping in](#p-envies)
- [2.5 Quick entry](#p-saisie)
- [2.6 Notes](#p-notes)
- [2.7 Offline, trash, public link](#p-securite)
- [2.8 Security and convenience](#p-confort)

</details>

<details>
<summary>3. Installation</summary>

- [Go to chapter](#installation)
- [3.1 What you need](#prerequis)
- [3.2 The folder and docker-compose.yml](#dossier)
- [3.3 Settings (variables)](#variables)
- [3.4 What the proxy must do](#proxy)
- [3.5 Example with Nginx Proxy Manager](#npm)
- [3.6 First start and setup code](#demarrage)
- [3.7 Keep the secret key safe](#cle)
- [3.8 Backups](#sauvegardes)
- [3.9 Checks once in production](#verifications)
- [3.10 Sign-in with an identity provider (optional)](#sso-serveur)

</details>

<details>
<summary>4. Accounts</summary>

- [Go to chapter](#comptes)
- [4.1 The first Admin](#premier-admin)
- [4.2 Creating the other accounts](#creer-comptes)
- [4.3 Signing in for the first time](#premiere-connexion)
- [4.4 Installing Listo on your phone](#telephone)
- [4.5 Changing your password](#mot-de-passe)
- [4.6 Two-factor authentication and recovery codes](#double-auth)
- [4.7 Forgotten password, lost phone](#oubli)
- [4.8 Lost Admin account](#secours)
- [4.9 Signing in with an identity provider](#sso)

</details>

<details>
<summary>5. Everyday use</summary>

- [Go to chapter](#quotidien)
- [5.1 Add, edit, check, delete](#ajouter)
- [5.2 Time and reminder](#heure)
- [5.3 Repeating tasks](#repeter)
- [5.4 Assign a task](#attribuer)
- [5.5 Type the quantity with the name](#quantite)
- [5.6 Add several items at once](#plusieurs)
- [5.7 Scan a barcode](#scan)
- [5.8 Add a photo](#photo)
- [5.9 Groups, sorting and counter](#tri)
- [5.10 Search](#recherche)
- [5.11 Getting around: Home, Due](#echeances)
- [5.12 Notes](#notes)
- [5.13 Sharing a note](#notes-partage)
- [5.14 Reserve a wish, chip in](#reserver)
- [5.15 To give: your gifts](#a-offrir)
- [5.16 What's new](#nouveautes)
- [5.17 Offline and sync](#hors-ligne)
- [5.18 Light or dark theme](#theme)
- [5.19 Language: French or English](#langue)
- [5.20 On a computer](#ordinateur)
- [5.21 Subtasks](#sous-taches)

</details>

<details>
<summary>6. Notifications</summary>

- [Go to chapter](#notifications)
- [6.1 The Notifications page](#notif-page)
- [6.2 Turning them on for a device](#notif-activer)
- [6.3 What you get, and when](#notif-recevoir)
- [6.4 Details in the notification](#notif-detail)
- [6.5 Turning off notifications for a list](#notif-silencer)
- [6.6 Limits and wish lists](#notif-limites)
- [6.7 What Apple, Google, Mozilla and Microsoft see](#notif-confidentialite)
- [6.8 Turning the feature on on the server](#notif-serveur)
- [6.9 Nothing shows up](#notif-depannage)

</details>

<details>
<summary>7. Role by role</summary>

- [Go to chapter](#roles)
- [7.1 Admin](#role-admin)
- [7.2 Owner: creating a list](#creer)
- [7.3 Owner: editing the list](#modifier)
- [7.4 Owner: sharing and choosing permissions](#partager)
- [7.5 Owner: wish list](#envies)
- [7.6 Owner: the public link](#lien-public)
- [7.7 Owner: duplicating, deleting, restoring](#corbeille)
- [7.8 Contributor (“Can edit”)](#role-contributeur)
- [7.9 Read only](#role-lecture)
- [7.10 Public link visitor](#role-visiteur)
- [7.11 Recipient of a wish list](#role-beneficiaire)

</details>

<details>
<summary>8. AI assistants (MCP)</summary>

- [Go to chapter](#claude)
- [8.1 What it's for](#claude-quoi)
- [8.2 Example sentences](#claude-phrases)
- [8.3 Two levels of access](#claude-niveaux)
- [8.4 What an assistant can never do](#claude-jamais)
- [8.5 Wish lists: no reservations](#claude-envies)
- [8.6 Limits](#claude-limites)
- [8.7 Connect an AI assistant](#claude-connecter)
- [8.8 See and disconnect an AI assistant](#claude-connexions)
- [8.9 Be careful: check the website](#assistant-site)
- [8.10 Be careful: booby-trapped texts](#claude-prudence)
- [8.11 Troubleshooting](#faq-claude)
- [8.12 Access turned off at first](#claude-activation)
- [8.13 Turn on access on the server](#mcp-serveur)
- [8.14 Rules and log](#mcp-regles)
- [8.15 First try](#mcp-essai)

</details>

<details>
<summary>9. FAQ and troubleshooting</summary>

- [Go to chapter](#faq)
- [9.1 I have no network](#faq-hors-ligne)
- [9.2 A photo won't upload](#faq-photo)
- [9.3 A public link doesn't work anymore](#faq-lien)
- [9.4 Changes arrive a minute late](#faq-retard)
- [9.5 Blank screen or frozen app](#faq-blanc)
- [9.6 I can't sign in](#faq-connexion)
- [9.7 Two-factor authentication: locked out](#faq-double-auth)
- [9.8 The secret key was lost](#cle-perdue)
- [9.9 Knowing a new version exists](#version)
- [9.10 A typo keeps coming back in the suggestions](#faq-suggestion)
- [9.11 Wish list: a participant has left](#faq-orphelin)

</details>


<a id="presentation"></a>

## 1. Introduction

<a id="listo"></a>

### 1.1 What Listo is

Listo is an app for shared lists: shopping, tasks and gift ideas. It's designed for a family or a small group of people close to each other, and it's mostly used on a phone.

When someone checks an item, the others see it checked within a few seconds. Listo is free, with no ads and no tracking.

Accounts are created by the Admin, the person who manages Listo: there's no public sign-up.

<a id="limites"></a>

### 1.2 What Listo doesn't do

- No online version: you install Listo on your own server (a computer that's always on, at home for example). See [3. Installation](#installation).
- In French or English, as each person chooses in “My account” ([5.19 Language: French or English](#langue)); this help is available in both languages too.
- The Notifications page (the bell on Home) keeps what Listo tells you about. Notifications on your phone or computer are optional: turned off by default on the server, then turned on by each person on their own devices ([6. Notifications](#notifications)).
- No payments: for a group gift, Listo shows who's chipping in, never how much.
- No data is sent anywhere other than your server, with three exceptions you can turn off: checking for a new version (GitHub, [9.9 Knowing a new version exists](#version)), the name of a scanned product (Open Food Facts, [operations guide in the repository, in French](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#scan-serveur)) and notifications, turned off by default (the device's notification service sees the time, the size and the device, never the text: [6.7 What Apple, Google, Mozilla and Microsoft see](#notif-confidentialite)). If you connect an AI assistant (Claude, for example), the content of the lists you allow is sent to it when you ask it something ([8. AI assistants (MCP)](#claude)).

<a id="types"></a>

### 1.3 Three types of list

- “Shopping”: items are sorted by aisle (‘Produce’, ‘Dairy’…), or by store for a trip to several shops (“Multi” store). Listo remembers the usual aisle of each item.
- “Tasks”: things to do, with a priority and a due date if needed.
- “Wishes”: gift ideas for one person. The people close to them reserve a wish so the same thing isn't given twice, without that person knowing.

You choose the type when you create the list. A shopping list can become a task list, and the other way around, without losing anything. Becoming a wish list is permanent.

<a id="vocabulaire"></a>

### 1.4 Vocabulary

- Item: a line in a shopping list or a task list. Wish: a line in a wish list. They all work the same way.
- Owner: the person who created the list.
- Contributor: a person who has the “Can edit” permission on the list.
- Read only: a person who can only read the list.
- Visitor: a person without an account who opens a list's public link.
- Recipient: the person a wish list is for.
- Note: free text, separate from the lists, yours alone at first; it can be shared like a list ([5.12 Notes](#notes)).
- Admin: the account that manages accounts, stores and aisles.

<a id="possibilites"></a>

## 2. What you can do

What Listo offers today, by topic. Each point links to the section that explains it.

<a id="p-partage"></a>

### 2.1 Lists shared live

- A list can be shared with other accounts, each with their own permission: “Can edit” or “Read only” ([7.4 Owner: sharing and choosing permissions](#partager)).
- Changes reach the other phones within a few seconds. Checked items move to the bottom, crossed out.
- What's new: Listo shows what the others have added or changed since your last visit ([5.16 What's new](#nouveautes)).
- Notifications: changes (by others), reservations, sharing, the due-date summary and reminders, on the Notifications page (the bell on Home) and, if you want, on your phone or your computer ([6. Notifications](#notifications)).
- An icon of your choice for each list, and a count of what's left on each card, each group and at the top of each list ([5.9 Groups, sorting and counter](#tri)).

<a id="p-courses"></a>

### 2.2 Shopping: aisles and stores

- Items sorted by aisle; Listo remembers the usual aisle of each item, suggests names you've already typed and “Often added” items ([5.1 Add, edit, check, delete](#ajouter)).
- “Multi” store: a trip to several shops, where each item has its store instead of an aisle ([7.2 Owner: creating a list](#creer)).
- An aisle is used in every store (“All stores”), or in a single one: each list offers the aisles of its store and those of all stores.
- Anyone can create a missing store or aisle; the Admin manages them ([7.1 Admin](#role-admin)).

<a id="p-taches"></a>

### 2.3 Tasks: priority, due date, time, reminder, repeat, assignment

- Priority (low, normal, high) and due date, turned on list by list ([7.3 Owner: editing the list](#modifier)).
- A time, and a reminder chosen task by task ([5.2 Time and reminder](#heure)).
- Tasks that repeat: every day, on certain days of the week, every month, every year ([5.3 Repeating tasks](#repeter)).
- Assign a task to a person on the list, and see “Mine” ([5.4 Assign a task](#attribuer)).
- Put subtasks under a main task ([5.21 Subtasks](#sous-taches)).
- Sort by priority or by due date ([5.9 Groups, sorting and counter](#tri)).

<a id="p-envies"></a>

### 2.4 Wishes: reserving and chipping in

- For yourself, for another account or for someone without an account; link, approximate price, priority and photo ([7.5 Owner: wish list](#envies)).
- The people close to the recipient reserve a wish, possibly several of them together (chipping in) ([5.14 Reserve a wish, chip in](#reserver)).
- The person the list is for never sees the reservations ([7.11 Recipient of a wish list](#role-beneficiaire)).
- Through the public link, a visitor without an account can also reserve or chip in ([7.10 Public link visitor](#role-visiteur)).

<a id="p-saisie"></a>

### 2.5 Quick entry

- Several items at once, separated by commas or line breaks ([5.6 Add several items at once](#plusieurs)).
- Quantity read from the name: ‘6 eggs’ or ‘eggs x6’ ([5.5 Type the quantity with the name](#quantite)).
- Scan mode: a photo of a product's barcode gives its name ([5.7 Scan a barcode](#scan)).
- A photo of an item ([5.8 Add a photo](#photo)).

<a id="p-notes"></a>

### 2.6 Notes

- Notes in free text, that save themselves, with clickable links, a pin and their own trash ([5.12 Notes](#notes)).
- A note is shared like a list (“Can edit” or “Read only”), or through a read-only public link ([5.13 Sharing a note](#notes-partage)).
- A quick note from Home, even offline ([5.12 Notes](#notes)).

<a id="p-securite"></a>

### 2.7 Offline, trash, public link

- Offline: Listo opens and works without a network; changes are sent when the network comes back ([5.17 Offline and sync](#hors-ligne)).
- Trash: a deleted list can be restored for 30 days ([7.7 Owner: duplicating, deleting, restoring](#corbeille)); so can a note, from the notes trash ([5.12 Notes](#notes)).
- Public link: show a list to someone without an account, for a length of time you choose, with a password if needed ([7.6 Owner: the public link](#lien-public)); a note too ([5.13 Sharing a note](#notes-partage)).

<a id="p-confort"></a>

### 2.8 Security and convenience

- Two-factor authentication, with recovery codes ([4.6 Two-factor authentication and recovery codes](#double-auth)).
- Automatic backup every night ([3.8 Backups](#sauvegardes)).
- Light, dark or automatic theme ([5.18 Light or dark theme](#theme)).
- A Home screen your way: tiles hidden or in another order, or no Home screen at all ([5.11 Getting around: Home, Due](#echeances)).
- Install it on your phone's home screen, like an app ([4.4 Installing Listo on your phone](#telephone)).
- An AI assistant, for example Claude, can read your lists and, if you allow it, write to them ([8. AI assistants (MCP)](#claude)).

<a id="installation"></a>

## 3. Installation

*For the person who runs the server.*

<a id="prerequis"></a>

### 3.1 What you need

- A server: a computer that is always on, running Linux, with Docker and Docker Compose. Note its address on the local network (for example `192.168.1.20`): this is the `IP_LOCALE` used below.
- An HTTPS reverse proxy, on this server or on another machine: Nginx Proxy Manager, Caddy, Traefik, nginx, Apache or another one, it doesn't matter which. It needs a subdomain that points to it (for example `listo.exemple.fr`) and a valid HTTPS certificate for that name (Let's Encrypt, for example). What it must do: [3.4 What the proxy must do](#proxy).
- A password manager, to keep Listo's key in ([3.7 Keep the secret key safe](#cle)).

Listo is used over HTTPS: without HTTPS, it refuses to start in production, because signing in, offline mode and installing on the phone all need it.

<a id="dossier"></a>

### 3.2 The folder and docker-compose.yml

A single file is enough, no source code:

```sh
mkdir -p /opt/listo && cd /opt/listo
# copy the repository's docker-compose.yml file here, then open it to edit it
```

In `docker-compose.yml` (commented line by line), replace two values:

1. `LISTO_PUBLIC_URL=https://listo.exemple.fr`: the exact address you will type in the browser, without a `/` at the end. A different address makes every connection get refused (“unknown origin”).
2. `IP_LOCALE`: the server's address on the local network (`192.168.1.20:13300:13300`). Never `0.0.0.0`: the port must only be open on the local network, and only the proxy should use it.

The `data/` folder (database, backups, photos, log) and the `secrets/` folder (encryption key) are created automatically on first start, next to the file. They must never be copied anywhere except into your backups.

<a id="variables"></a>

### 3.3 Settings (variables)

All the variables are in `docker-compose.yml`. None of them contains a password or a key.

The `environment:` part of the file, as shipped (the commented-out lines, starting with `#`, are optional: remove the `#` to use them):

```sh
    environment:
      - NODE_ENV=production
      - PORT=13300
      - TZ=Europe/Paris   # backup around 3 AM, due-date summary at 8 AM
      - LISTO_PUBLIC_URL=https://listo.exemple.fr
      - LISTO_DB_PATH=/data/listo.db
      - LISTO_KEY_PATH=/secrets/secret.key
      - LISTO_SESSION_DAYS=30
      # Default language (fr or en) and currency for wishes (EUR, USD, CHF…)
      # - LISTO_LANG=fr
      # - LISTO_CURRENCY=EUR
      # - LISTO_UPDATE_CHECK=off
      # - LISTO_PRODUCT_LOOKUP=off
      # - LISTO_PRODUCT_CONTACT=https://listo.exemple.fr/contact
      # LISTO_MCP: access for AI assistants, off by default (“AI assistants (MCP)” chapter)
      # Optional: only accept these sites (otherwise, any AI assistant)
      # - LISTO_MCP_SITES=claude.ai,claude.com
      # Push notifications: OFF by default. Encrypted content: Apple,
      # Google, Mozilla or Microsoft only see the time, the size and the
      # device. Keys in secrets/vapid.json: back it up along with secret.key.
      # - LISTO_PUSH=on
      # Sign-in with an identity provider (Authelia, Authentik, Pocket ID…):
      # OFF by default (Installation chapter). Client secret in
      # secrets/oidc-client-secret.
      # - LISTO_OIDC=on
      # - LISTO_OIDC_ISSUER=https://auth.exemple.fr
      # - LISTO_OIDC_CLIENT_ID=listo
      # - LISTO_OIDC_NAME=Authelia
      # Password sign-in: on by default; off = identity provider only
      # - LISTO_LOCAL_LOGIN=off
```

| Variable | Production value | What it does |
| --- | --- | --- |
| `NODE_ENV` | `production` | Production mode: secure cookies, HTTPS required. |
| `PORT` | `13300` | Port Listo listens on inside the container (the same as in `ports:`). |
| `TZ` | `Europe/Paris` | Time zone: time of the nightly backup (3 AM), of the due-date summary (8 AM), and dates in the log. Set it: without it, the server counts in universal time (one or two hours earlier than in Paris). |
| `LISTO_PUBLIC_URL` | `https://listo.exemple.fr` | Exact public address, which must start with `https://` in production (otherwise Listo refuses to start and explains why in `docker logs listo`). |
| `LISTO_DB_PATH` | `/data/listo.db` | Database (`data/` folder). |
| `LISTO_KEY_PATH` | `/secrets/secret.key` | Encryption key, created on first start (`secrets/` folder). |
| `LISTO_SESSION_DAYS` | `30` | How long a session lasts without signing in again, in days. |
| `LISTO_LANG` | not set: `fr` | Default language, `fr` or `en`: the one used by an account set to “Automatic” when the browser doesn't give a known language, and for that account's notifications. Any other value: Listo doesn't start and explains why in `docker logs`. |
| `LISTO_CURRENCY` | not set: `EUR` | Currency for wish prices, as a three-letter code (`EUR`, `USD`, `CHF`, `GBP`…), with two decimals. Only the display changes: prices already entered are not converted. Any other value: Listo doesn't start and explains why in `docker logs`. |
| `LISTO_COMMIT` | set by the image | Installed version, shown in Settings › “About”. Don't fill it in. |
| `LISTO_UPDATE_CHECK` | not set: on | `off` turns off the update check on GitHub ([9.9 Knowing a new version exists](#version)). |
| `LISTO_PRODUCT_LOOKUP` | not set: on | `off` turns off scan mode: button hidden, no more requests to Open Food Facts ([operations guide (in French), in the repository](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#scan-serveur)). |
| `LISTO_PRODUCT_CONTACT` | not set | Optional: contact email address or web address sent to Open Food Facts ([operations guide (in French), in the repository](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#scan-serveur)). |
| `LISTO_MCP` | not set: off | `on` turns on access for AI assistants, for example Claude ([8.13 Turn on access on the server](#mcp-serveur)). Any other value: off. |
| `LISTO_MCP_SITES` | not set: all AI assistants | Optional: websites of the AI assistants that are accepted, separated by commas (for example `claude.ai,claude.com`), on top of apps on the computer (`localhost`). Not set: any AI assistant that follows the standard can ask for access, always after your approval ([8.13 Turn on access on the server](#mcp-serveur)). A badly written value (`https://`, path, port, IP address, `*`): Listo doesn't start and explains why in `docker logs`. |
| `LISTO_PUSH` | not set: off | `on` turns on notifications ([6.8 Turning the feature on on the server](#notif-serveur)); keys created in `secrets/vapid.json`. Any other value: off. |
| `LISTO_OIDC` | not set: off | `on` turns on sign-in with an OpenID Connect identity provider ([3.10 Sign-in with an identity provider (optional)](#sso-serveur)); also requires `LISTO_OIDC_ISSUER` and the `secrets/oidc-client-secret` file. Any other value: off. |
| `LISTO_OIDC_ISSUER` | not set | Address of the identity provider (its ‘issuer’), starting with `https://` (for example `https://auth.exemple.fr`). |
| `LISTO_OIDC_CLIENT_ID` | not set: `listo` | Listo's ID at the identity provider (`client_id`). |
| `LISTO_OIDC_NAME` | not set: `SSO` | Provider name shown on screen, for example `Authelia`: the “Sign in with …” button, “My account”, Administration (30 characters at most). |
| `LISTO_LOCAL_LOGIN` | not set: on | `off` turns off sign-in with username and password: you can only get in through the identity provider (requires `LISTO_OIDC=on`), and sessions opened with a password are closed ([3.10 Sign-in with an identity provider (optional)](#sso-serveur)). |

<a id="proxy"></a>

### 3.4 What the proxy must do

Any reverse proxy will do, as long as it does the following. These requirements come from Listo's code; how to set them depends on the product (see its documentation, or the Nginx Proxy Manager example: [3.5 Example with Nginx Proxy Manager](#npm)).

1. Terminate HTTPS with a valid certificate for the subdomain, and redirect `http://` to `https://`. HTTPS is required: in production, Listo refuses to start if `LISTO_PUBLIC_URL` doesn't start with `https://`, its sign-in cookies are ‘Secure’ (the browser only sends them over HTTPS), and installing on the Home Screen as well as offline mode need HTTPS.
2. Forward the whole subdomain, at its root and without changing paths, to `http://IP_LOCALE:13300` (plain HTTP on the local network). Listo can't be installed in a subfolder of another site (an address ending in `…/listo` doesn't work). The address typed in the browser must be exactly `LISTO_PUBLIC_URL`: every change is refused (“unknown origin”) if the `Origin` header sent by the browser doesn't match it, so the proxy must not rewrite this header.
3. Let real-time updates through: `/api/events` is an HTTP connection that stays open (Server-Sent Events, type `text/event-stream`), not a WebSocket. The proxy must neither hold back nor cache its responses (Listo sends the `X-Accel-Buffering: no` header, which nginx understands), and its read timeout must be longer than 25 seconds: Listo sends a signal every 25 seconds on this connection. Otherwise, changes arrive late or the connection keeps getting cut.
4. Accept uploads of at least 2 MB: an item photo is 2 MB at most (Listo refuses anything bigger). Many proxies accept less by default (nginx: 1 MB); allow a little margin, for example 5 MB.
5. Pass on the visitors' real IP address: Listo trusts a single proxy and reads the last address in the `X-Forwarded-For` header, which the proxy must fill in with the person's address. It's used to block repeated password attempts. With two proxies one behind the other (an online service in front of your proxy, for example), Listo would see the address of the first one, and a block would hit everyone.
6. Pass on the other request headers unchanged: cookies, `Authorization` (access for AI assistants, [8.13 Turn on access on the server](#mcp-serveur)) and `Sec-Fetch-Site`.
7. Add the `Strict-Transport-Security` (HSTS) header, if the proxy allows it: Listo doesn't send it itself.

**Restrict access to Listo's port**

Listo believes the IP address the proxy passes on: someone who reached port 13300 directly could make one up and get around the blocking of password attempts. So this port must only be reachable from the proxy's machine, with a firewall rule on the server or on the network (internet box, router).

- Example with ufw, if the proxy is at `192.168.1.10`: `sudo ufw allow from 192.168.1.10 to any port 13300 proto tcp`. Careful: Docker opens the ports it publishes by going around ufw; you need a Docker-specific setting (the `DOCKER-USER` chain) or a firewall upstream.
- Check: from another computer on the network, `curl http://IP_LOCALE:13300/healthz` must fail; from the proxy's machine, it must answer `{"status":"ok"}`.
- The proxy's access log records the addresses of public links that were opened (`/p/…`). To cut off a link that may have been passed around, stop it from Listo.

<a id="npm"></a>

### 3.5 Example with Nginx Proxy Manager

A step-by-step example, with Nginx Proxy Manager (it can be on another machine). In Nginx Proxy Manager, ‘Hosts’, ‘Proxy Hosts’, ‘Add Proxy Host’:

- Details: ‘Domain Names’ = your subdomain; ‘Scheme’ = `http`; ‘Forward Hostname / IP’ = `IP_LOCALE`; ‘Forward Port’ = `13300`. ‘Websockets Support’: not needed, leave it unchecked (real-time updates go through an ordinary HTTP connection).
- SSL: request a Let's Encrypt certificate, check ‘Force SSL’, ‘HTTP/2 Support’ and ‘HSTS Enabled’ (this is what adds the HSTS header).
- Advanced (‘Custom Nginx Configuration’): paste the four lines below. These are nginx directives: with plain nginx, they go in the `location` block that forwards to Listo.

```sh
client_max_body_size 5m;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
```

- `client_max_body_size 5m;`: without it, photo uploads are refused (nginx accepts 1 MB by default; a Listo photo is 2 MB at most).
- The other three are for real-time updates: without them, changes only reach the other phone after about a minute.
- Nginx Proxy Manager already fills in the `X-Forwarded-For` header with the phones' real IP address: nothing to set.
- Access for AI assistants: its addresses go through the same host, with no extra setting. They must stay reachable from the Internet ([8.13 Turn on access on the server](#mcp-serveur)).
- Firewall: only allow Nginx Proxy Manager's address to reach port 13300 ([3.4 What the proxy must do](#proxy)).

<a id="demarrage"></a>

### 3.6 First start and setup code

On the server, in `/opt/listo`:

```sh
# downloads the image and starts Listo
docker compose up -d
# shows the setup code
docker logs listo
```

1. In `docker logs listo`, find the setup code, framed by `====` (it looks like `ABCD-EFGH-JKLM`). Don't share it with anyone.
2. Open `https://listo.exemple.fr`: the “Welcome to Listo” screen offers to create the Admin account ([4.1 The first Admin](#premier-admin)).
3. This code only works once: the screen disappears as soon as an account exists.

<a id="cle"></a>

### 3.7 Keep the secret key safe

Right after the first start, display the key and copy it into your password manager (one line of text):

```sh
cat /opt/listo/secrets/secret.key
```

Without it, after a server failure or a restore on another machine, two-factor authentication can no longer be read: everyone has to set it up again ([9.8 The secret key was lost](#cle-perdue)). Lists, photos and passwords don't depend on it. It is never copied into the nightly backups, on purpose: keep it separately, once and for all.

With notifications turned on (`LISTO_PUSH=on`), keep `secrets/vapid.json` (notification keys) the same way: without it, every device has to subscribe again ([6.8 Turning the feature on on the server](#notif-serveur)).

<a id="sauvegardes"></a>

### 3.8 Backups

- Every night around 3 AM (`TZ` time), Listo copies its database into `data/backups/` (`listo-YYYY-MM-DD-HHMM.db`), checks that the copy is intact, and keeps the last 14. Each copy, successful or failed, is recorded in the log (`backup_success` or `backup_failure`; the log is always in English). A failed copy doesn't stop Listo.
- On-demand backup, before an update for example (`-u node` matters: the copy must belong to Listo, like the nightly ones):

```sh
docker exec -u node listo node server/backup-now.js
```

The nightly copy contains neither the photos (`data/photos/`), nor the log (`data/journal.log`), nor the `secrets/secret.key` key (on purpose: a copy of the database alone doesn't let anyone read the two-factor authentication secrets). So back up the whole `/opt/listo/data` folder with the server's usual backup, and keep the key separately ([3.7 Keep the secret key safe](#cle)). Restoring a backup: [operations guide (in French), in the repository](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#restauration).

<a id="verifications"></a>

### 3.9 Checks once in production

1. HTTPS: `https://listo.exemple.fr` opens with the padlock; `http://listo.exemple.fr` redirects to `https://`.
2. Health: `https://listo.exemple.fr/healthz` answers `{"status":"ok"}`.
3. Security headers: run the address through a tool like [securityheaders.com](https://securityheaders.com). You should see `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-Robots-Tag` (sent by Listo) and `Strict-Transport-Security` (added by the proxy, see [3.4 What the proxy must do](#proxy)), and no `X-Powered-By`.
4. A backup: the next morning, `ls -l /opt/listo/data/backups` shows a copy from the night, and `docker logs listo | grep backup` shows the `backup_success` line.
5. A test restore, once, with the nightly copy: [operations guide (in French), in the repository](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#restauration).
6. The port is closed: see [3.4 What the proxy must do](#proxy).
7. The phone: installing on the Home Screen ([4.4 Installing Listo on your phone](#telephone)), then the ‘Vérifier sur les téléphones’ checklist (in French) in [docs/developpement.md](https://github.com/magicgg91/listo/blob/main/docs/developpement.md#vérifier-sur-les-téléphones).

<a id="sso-serveur"></a>

### 3.10 Sign-in with an identity provider (optional)

With an identity provider at home (Authelia, Authentik or Pocket ID, for example: any provider that follows the OpenID Connect standard), everyone can sign in to Listo with their account at that provider (the “Sign in with …” button), in addition to the Listo username and password, which still work. Off by default; without it, there's no button and the `/oidc/…` addresses answer 404.

1. At the provider, create a client (sometimes called an ‘application’) for Listo: confidential (with a client secret), redirect address `https://listo.exemple.fr/oidc/retour` (Listo's address followed by `/oidc/retour`), scopes `openid` and `profile`, PKCE with `S256`, client secret sent in the header (`client_secret_basic`). Write down its ID (`client_id`) and its plain-text client secret.
2. Put the plain-text secret, alone on one line, in `secrets/oidc-client-secret` (next to `secret.key`), then run `chmod 600 secrets/oidc-client-secret`. Never in `docker-compose.yml` or in a variable. Keep a copy of it with the secret key ([3.7 Keep the secret key safe](#cle)).
3. In `docker-compose.yml`, uncomment `LISTO_OIDC=on`, `LISTO_OIDC_ISSUER` with the provider's address (its ‘issuer’), `LISTO_OIDC_CLIENT_ID` if the ID isn't `listo`, and `LISTO_OIDC_NAME` with the name to display (otherwise “SSO”) ([3.3 Settings (variables)](#variables)), then run `docker compose up -d`. `docker logs listo` should show the line ‘Sign-in with … enabled’ (startup messages follow `LISTO_LANG`: with `fr`, ‘Connexion avec … activée’). If not, the message says what's missing.

What Listo expects from the provider (the standard):

- its description at the issuer's address followed by `/.well-known/openid-configuration`, with its addresses on the same site as the issuer;
- an ID token signed with RS256, PS256 or ES256 (an unsigned token or one signed with HS256 is refused);
- the person's username in `preferred_username` and their name in `name` (`profile` scope);
- to authorize an AI assistant ([8.7 Connect an AI assistant](#claude-connecter)) from a session opened through the provider: ask for sign-in again when Listo asks for it (`prompt=login`, `max_age=0`) and give its time (`auth_time`). Otherwise the confirmation doesn't go through: in that case, sign in with your Listo password to authorize the assistant.

Two-factor authentication: if the token says it was done at the provider (`amr` contains `mfa`), Listo doesn't ask for its own code again. Otherwise, a Listo account that turned on Listo's two-factor authentication is asked for it again.

Example with Authelia: the client secret is created with `docker run --rm authelia/authelia:latest authelia crypto hash generate pbkdf2 --variant sha512 --random --random.length 72 --random.charset rfc3986` (‘Random Password’: the plain-text secret, for `secrets/oidc-client-secret`; ‘Digest’: its hash, for Authelia). The client is declared in `identity_providers.oidc.clients`, then you restart Authelia. With `authorization_policy: 'two_factor'`, Authelia handles two-factor authentication. With Authentik, Pocket ID or another provider: the same settings, in its interface.

```sh
identity_providers:
  oidc:
    clients:
      - client_id: 'listo'
        client_name: 'Listo'
        client_secret: '$pbkdf2-sha512$…'   # the hash (Digest)
        public: false
        authorization_policy: 'two_factor'
        require_pkce: true
        pkce_challenge_method: 'S256'
        redirect_uris:
          - 'https://listo.exemple.fr/oidc/retour'
        scopes: ['openid', 'profile']
        response_types: ['code']
        grant_types: ['authorization_code']
        token_endpoint_auth_method: 'client_secret_basic'
```

The Listo server must reach the provider at its public address (`LISTO_OIDC_ISSUER`), over HTTPS. The `/oidc/connexion` and `/oidc/retour` addresses go through the same host as Listo: nothing to set in the proxy.

To get in ONLY through the provider, add `LISTO_LOCAL_LOGIN=off` ([3.3 Settings (variables)](#variables)): the sign-in screen only shows “Sign in with …”, password sign-in is refused and sessions opened with a password are closed; in Administration, “Add account” no longer asks for a password (the person gets in through the provider, with the same username). If the provider is down, nobody can get in: remove the line (or set it to `on`), then run `docker compose up -d`, to get password sign-in back.

> **Warning**: The account at the provider opens the Listo account that has the same username (case doesn't matter): create the accounts there with the Listo usernames. On first sign-in, Listo remembers that account: a different account with the same name, later on, is refused (the Admin can use “Unlink … account”, in Administration › Accounts).

<a id="comptes"></a>

## 4. Accounts

<a id="premier-admin"></a>

### 4.1 The first Admin

The very first time Listo is opened, the “Welcome to Listo” screen asks for:

- “Username”: 2 to 50 characters (letters with no accents, numbers, . \_ -);
- “Password”: at least 10 characters, then “Confirm password”;
- “Setup code”: the one shown in the server logs ([3.6 First start and setup code](#demarrage)).

Then “Create Admin account”. This account then creates all the others. A new installation has no stores or aisles: the Admin creates them in “Administration”, “Shopping” tab ([7.1 Admin](#role-admin)), or everyone creates them as they go, with “New store…” and “New aisle…”.

<a id="creer-comptes"></a>

### 4.2 Creating the other accounts

The Admin goes to Settings, “Administration”, “Accounts” tab, “Add account”.

- “Username”: what the person will type to sign in;
- “Display name (optional)”: the first name shown to the others (‘Added by Marie’);
- “Temporary password”: to give to the person; they'll replace it the first time they sign in;
- “Role”: “User” or “Admin”.

<a id="premiere-connexion"></a>

### 4.3 Signing in for the first time

1. Open Listo's address (for example `https://listo.exemple.fr`).
2. Enter your “Username” and your “Password”, then “Sign in”.
3. With a temporary password, the “New password” screen asks you to choose a new one (at least 10 characters), then “Save”.
4. You stay signed in for 30 days on this phone (the person who runs the server can change this).

<a id="telephone"></a>

### 4.4 Installing Listo on your phone

Open Listo's address and sign in, then:

- iPhone (Safari): ‘Share’ button (square with an arrow), ‘Add to Home Screen’, then ‘Add’.
- Android (Chrome): ⋮ menu, ‘Install app’ (or ‘Add to Home screen’).

The Listo icon appears. When you open it from the home screen, Listo shows full screen and also works without a network. On iPhone, the installed app has its own sign-in, separate from Safari: you need to sign in to it once.

<a id="mot-de-passe"></a>

### 4.5 Changing your password

Settings, “My account”, “Password”: “Current password”, “New password” (at least 10 characters), “Confirm password”, then “Save”. Your other devices are then signed out, and so are your AI assistant connections ([8.8 See and disconnect an AI assistant](#claude-connexions)).

<a id="double-auth"></a>

### 4.6 Two-factor authentication and recovery codes

Recommended for the Admin. You need an authenticator app on your phone (Aegis, Google Authenticator, Microsoft Authenticator…).

1. Settings, “My account”, “Two-factor authentication”.
2. “Step 1 of 2”: scan the QR code with the app (or copy the key shown under “Or enter this key”), enter the “6-digit code” it shows, then “Verify and enable”.
3. “Step 2 of 2”: Listo shows 10 “Recovery codes”, only once. “Copy codes”, keep them in a password manager, then “I've saved my codes”.

After that, each sign-in asks for your password, then the code (“Two-factor authentication”). Without your phone, “Use a recovery code”: each code works only once.

To turn it off: same screen, “Password” and “Code” (from the app, or a recovery code), then “Disable two-factor authentication”.

<a id="oubli"></a>

### 4.7 Forgotten password, lost phone

- Forgotten password: ask the Admin. In “Administration”, “Accounts”, the ⋮ button of your account, “Reset password”: they give you a temporary password, to change the next time you sign in. Nothing is sent by email.
- Lost the phone you use for two-factor authentication, and no recovery codes left: the Admin chooses “Disable two-factor authentication” on your account; you can turn it on again afterwards.
- Too many attempts: 5 wrong passwords block signing in for 15 minutes.
- The Admin has lost their own password: see [4.8 Lost Admin account](#secours).

<a id="secours"></a>

### 4.8 Lost Admin account

*For the person who runs the server.*

If there's another Admin, they use “Reset password” ([7.1 Admin](#role-admin)). Otherwise, on the server (replace `identifiant` with the account's username):

```sh
docker exec -u node listo node server/admin-secours.js identifiant
```

A temporary password is shown once: sign in with it, then choose a new one. If two-factor authentication can't be used either, add `--remove-2fa` at the end of the command. The account's AI assistant connections are cut off ([8.8 See and disconnect an AI assistant](#claude-connexions)). What the Admin can and can't do: [7.1 Admin](#role-admin).

<a id="sso"></a>

### 4.9 Signing in with an identity provider

If the server offers it, the sign-in screen also shows “Sign in with …”, followed by the name chosen by the Admin (Authelia, Authentik, Pocket ID…; “SSO” if they didn't choose one). Tap it and sign in with that provider: you come back to Listo, signed in. Your account with the provider opens the Listo account that has the same username. Your Listo username and password still work. If the Admin had given you a temporary password, it's erased the first time you sign in through the provider.

When you're signed in through the provider, “My account” says so (“Signed in with …”): your password and two-factor authentication are changed with the provider, not in Listo. Authorizing an AI assistant is then also confirmed with the provider ([8.7 Connect an AI assistant](#claude-connecter)).

No Listo account yet: “Your account request has been sent to the Admin”. The Admin sees it in Settings, “Administration” (badge), “Accounts” tab, “Account request” section: “Accept” (they can correct the username and name, and choose the role), or “Decline”. Once it's accepted, sign in again through the provider. A declined request can't be made again for 30 days.

<a id="quotidien"></a>

## 5. Everyday use

The everyday actions, for anyone who can edit the list (the owner or “Can edit”). With “Read only”, you can read, sort and search.

<a id="ajouter"></a>

### 5.1 Add, edit, check, delete

- Add: type the name in the field at the bottom of the list, then tap “+”. Suggestions appear while you type. In a shopping list, for a new item, Listo asks for its aisle, then remembers it.
- “Often added” (shopping lists): tap the field without typing anything, or tap “+” right away (without the keyboard), to see the items added most often at this store over the last two months, except those already on the list to buy. One tap adds the item (if it is in “In the cart”, it comes back to the list); the panel stays open so you can add more. The “Close” cross, or a tap on the list, closes it; as soon as you type, the usual suggestions come back. An item you no longer buy: swipe its row to the left, then “Remove” (on a computer, the crossed-out eye at the end of the row). It is no longer suggested at this store, for the whole family, until someone adds it again.
- After adding, the keyboard closes. If the list is set to “Open item details”, the details of what you just added open (without the keyboard): set the quantity, note, priority or due date, then tap the floppy disk; the cross closes them without changing anything, and the row stays added.
- Edit: tap the row. The item details open; the floppy disk saves.
- In a task list, the details keep the name, the note and the priority, then three rows that sum up “Due date” (date, time, reminder), “Repeats” and “For”. Tap a row to open its page inside the details; the “Back to details” arrow, the phone's Back gesture or a tap outside the details take you back. Nothing is saved when you go back: once you are back on the details, the floppy disk saves everything; the cross discards everything. A task has no quantity.
- Check: tap the box. A checked item is crossed out and moves to “In the cart” (“Done” in a task list), at the bottom of the list.
- Delete: swipe the row to the left, then tap “Delete”. “Undo” brings the row back for a few seconds.
- All at once, at the bottom of the list, after you confirm: “Put all back on the list” unchecks the items in the cart, “Clear the cart” deletes them for everyone. In a task list: “Reopen all” and “Remove done items”; in a wish list: “Reopen all” and “Remove received”.

<a id="heure"></a>

### 5.2 Time and reminder

In a task list where the due date is turned on ([7.3 Owner: editing the list](#modifier)), a task that has a date can also have a time: “Time (optional)”, in its details. “Clear” removes the time; clearing the date removes the time too.

- On the row, the badge shows the date and the time: “Today · 6:30 PM”, “Tomorrow · 9:00 AM”.
- A task with a time becomes “Overdue” as soon as the time has passed, without waiting for the next day. Without a time, nothing changes: it becomes overdue the next day.
- On the same date, tasks with a time come before the others, in order of time (“By due date” sorting and the “Due” screen).
- A repeating task keeps its time every time ([5.3 Repeating tasks](#repeter)).
- The public link shows the time, never the reminder.

Once the time is chosen, “Reminder” offers: “None” (to start with), “At the time”, “15 min before”, “30 min before”, “1 hour before”, “2 hours before” or “The day before (24 hours)”. Each task has its own reminder.

- The reminder is a notification ([6. Notifications](#notifications)): it shows up on the Notifications page, and on your devices where notifications are turned on. It goes to the person the task is assigned to ([5.4 Assign a task](#attribuer)); if it is assigned to nobody, to all the members of the list.
- It is sent only once. If you change the date, the time or the reminder, it will be sent again at the new moment. A checked task sends nothing.
- It follows your settings: “Due” notifications turned on, lists whose notifications you muted.
- If the server was stopped at the planned moment, the reminder is still sent within the next half hour; after that, it is dropped.
- If notifications are turned off on the server, the reminder only shows up on the Notifications page.

<a id="repeter"></a>

### 5.3 Repeating tasks

In a task list where the due date is turned on ([7.3 Owner: editing the list](#modifier)), the details of a task offer “Repeats”: “Never”, “Every day”, “Every week”, “Every 2 weeks”, “Every month” or “Every year”.

- Every week, or every 2 weeks: tap the days you want (Mon, Tue, Wed, Thu, Fri, Sat, Sun), at least one. For example, Monday and Thursday to take out the trash.
- Every month: choose the day (the 5th of every month). The 31st falls on the last day of shorter months.
- Or, with “A day of the week”: the 1st, 2nd, 3rd, 4th or last Monday, Tuesday… of the month (“The 1st Monday of every month”, “The last Friday of every month”). To start with, Listo suggests the one of the due date.
- Every year: the same day and the same month as the due date.
- A sentence under the choice sums up the rule, for example: Every Monday and Thursday. If the task does not have a due date yet, Listo sets the first date by itself.
- On the row, a badge shows the repeat (for example ↻ Mon, Thu).

When you check a repeating task, it does not go to “Done”: it comes right back, unchecked, at its next date. A message says “Next time:” and the date; “Undo” puts back the old date. A task done late comes back at the next upcoming date, never already overdue. It works the same from “Due” and offline.

“Skip this time”, in the details, moves on to the next date without checking the task (a week when there is nothing to do). The others see it as a change.

To stop: “Repeats”, “Never” (or clear the due date, or delete the task).

<a id="attribuer"></a>

### 5.4 Assign a task

In a task list, the owner turns on “Assignment” in “Options for items” ([7.3 Owner: editing the list](#modifier)). The details of a task then offer “For”: “Nobody”, “Me”, another person who can edit the list, or “Several people…”.

- On the row, a badge says whose task it is: “Me” (in blue) or the first name.
- “Sort list”, “By person”: the tasks of “Me” first, then those of each person, then those of “Nobody”.
- “Due” offers “All” or “Mine” ([5.11 Getting around: Home, Due](#echeances)).
- A repeating task keeps the same person when it comes back (except with “Take turns…”).
- If the person leaves the list, is removed from it or is switched to “Read only”, their tasks go back to “Nobody” (with several people or taking turns: they are removed from the group or from the rotation; if only one person is left, the task is theirs alone).
- The public link never shows whose task it is.

“Several people…”: tap the first names (at least two). The task belongs to each of them: it appears in each person's “Mine”, counts in their 8 AM summary and sends them its reminders. The first one to check it completes it for everyone. On the row: “Me, Léa”, or “Léa +2”.

“Take turns…”, for a repeating task ([5.3 Repeating tasks](#repeter)): tap the first names in turn order (1, 2, 3…). The task belongs to one person at a time (the badge shows their first name). When someone checks it, it comes back at its next date for the person who comes next in the order after the one who checked it: if Marc does Léa's turn, the next one is for Zoé. The message says “Next time: Mon, Nov 17 · Zoé”. “Skip this time” keeps the same person. If the task no longer repeats, it stays with this time's person.

When someone assigns you a task, or when it is your turn, the “Changes” notification tells you (‘It's your turn in “Home”’) ([6. Notifications](#notifications)).

<a id="quantite"></a>

### 5.5 Type the quantity with the name

In a shopping list (only), write the quantity at the start of the name, or at the end with an x: Listo puts it in the “Quantity” field.

- 6 eggs: eggs, quantity 6.
- 2 lbs of apples, or 2 lbs apples: apples, quantity 2 lbs. Same with 500 g flour, 1.5 L milk, 3 packets of yeast or 4 boxes of rice.
- eggs x6: eggs, quantity 6.
- When in doubt, everything stays in the name: 7up, pie 6 slices, 2 in 1 shampoo. So that a number is never read, write it after the name (shampoo 2 in 1).
- It also works with several items at once (6 eggs, 2 lbs apples; milk). If Listo got it wrong, fix it in the item details.
- In a task list, the number is part of the name (3 calls to make): nothing is read; the quantity is set in the details. No quantity in a wish list.

<a id="plusieurs"></a>

### 5.6 Add several items at once

In a shopping or task list, separate the names with commas, semicolons or line breaks, then tap “+”: for example, milk, bread; 6 eggs adds three rows. You can also paste a list copied from your notes.

- A comma between two digits does not split anything: 1,5 L of milk stays a single row.
- 20 rows at most at a time. Beyond that, or if a name is too long, nothing is added and a message says so.
- In a shopping list, Listo asks for the aisle of each new item, one after the other. If you close one of these windows, nothing is added and the text stays in the field.
- With several rows, the list stays on screen, even when it is set to “Open item details”. This also works without a network.
- In a wish list, the text is never split: one wish at a time.

<a id="scan"></a>

### 5.7 Scan a barcode

In a shopping list, the barcode button next to the add field (“Scan a product”) opens the phone's camera or photo library. Take a picture of a product's barcode: Listo reads it on the phone (the photo is never sent).

- An item on the list already has this code: Listo offers to check it.
- An item on another of your lists has it: Listo reuses its name (“Known product”).
- Otherwise, Listo looks up the product name in Open Food Facts; you can fix it, then tap “Add to list”.
- This button only exists if scan mode is turned on on your server (setting `LISTO_PRODUCT_LOOKUP`, [3.3 Settings (variables)](#variables)).

<a id="photo"></a>

### 5.8 Add a photo

In an item's details, “Add a photo” takes a photo or picks one. It is made smaller on the phone before it is sent, and its hidden information (location, device) is removed by the server. The photo is optional; only the members of the list see it (and the visitors of a valid public link).

<a id="tri"></a>

### 5.9 Groups, sorting and counter

- Tap the header of an aisle (or of a store, or of a priority) to collapse or expand it. The chevron at the end of the row under the list title (“Collapse all”, then “Expand all”) acts on all the groups, and on subtasks ([5.21 Subtasks](#sous-taches)).
- “Lists” can be sorted by date or alphabetically (button at the top).
- On the phone, under the “Lists” title, “All”, “Shopping”, “Tasks” or “Wishes” shows only the lists of that type. Your last choice is remembered on this phone. On a computer, the type is chosen in the menu on the left ([5.20 On a computer](#ordinateur)).
- In a shopping list, “Sort list” offers “By aisle” (“By store” for a “Multi” store) or “Alphabetical”: the items are then shown in one flat list, under “To buy”. Each item keeps its aisle.
- In a task list, “Sort list” offers “Alphabetical”, “By priority”, “By due date” and “By person”, depending on the list's options.
- The sorting you choose applies only to you, on this phone: it changes nothing for the others, and it is allowed with read-only access.
- “X/Y” gives the number of items left out of the total, on each card and at the top of each group.
- In an open list, under the title, a small bar shows the share already checked, followed by the same “X/Y” (on a computer, ‘5/6 left’). When everything is checked, the bar turns green and a check mark is added. Searching and collapsed groups do not change these numbers.

<a id="recherche"></a>

### 5.10 Search

- Tap the round magnifying glass, at the bottom right: the field opens under the title, ready to type in, and does not move when the keyboard opens. In a list, it floats above the add bar, and hides while you type in it.
- In a list, “Search this list” searches item names, not notes. The add bar hides during the search.
- On “Lists”, “Search lists” searches the titles of the lists of the chosen type (“All” to see everything), including those shared with you.
- On “Due”, “Search tasks” searches task names.
- Capital letters and accents do not matter: ‘eclair’ finds ‘Éclair’. The text found is highlighted, and the number of results is shown.
- Checked items that are found stay visible, crossed out, in “In the cart”. You can check, open or delete an item from the results.
- The keyboard's ‘search’ key closes the keyboard and keeps the search; “Clear search” empties it. To close it: the cross in the field, another tap on the magnifying glass or the phone's Back button; if you tap elsewhere without having typed anything, it closes by itself. Switching lists or leaving the screen also empties it.
- The search changes nothing in the list or for the others. It works offline, and with read-only access too.

<a id="echeances"></a>

### 5.11 Getting around: Home, Due

Listo opens on “Home” (unless you have turned it off, see below): ‘Hello’ and your first name, today's date, the status badge and the notification bell (with the number of unread ones: [6.1 The Notifications page](#notif-page)), then tiles that show at a glance what is waiting. They work offline and update by themselves.

- “Due” tile: “Overdue”, “Today” and “Later”, with the number of tasks, the same as on the “Due” screen (with its “All” or “Mine” choice). A row opens “Due” at that spot; with no task to do: “No due tasks”.
- “Lists” tile: one row per type of list you have (“Shopping”, “Tasks”, “Wishes”), with the number of lists, and a blue dot if one of them has new updates. A row opens “Lists” on that type; with no list: “No lists” and “New list”.
- “To give” tile, full width, only if you reserve a wish or chip in on a gift: the number of gifts still to buy (at the end of the title, which opens the “To give” page: [5.15 To give: your gifts](#a-offrir)) and the last three reserved and not yet bought (‘For Zoé · reserved’); a row opens the wish in its list. When everything is bought: “All bought”.
- “Notes” tile: the number of your notes (at the end of the title), the last two changed, four on a computer (a row opens the note) and “New note”, which opens a new note ([5.12 Notes](#notes)); with no note: “No notes”.
- “Account” tile: “My account”, “Notifications” (the Notifications page, like the bell) and “Settings”. For the Admin, when signing in with an identity provider is turned on, “Account requests” appears with their number when some are pending.
- A tile's title opens the whole screen. An unknown address also leads to Home (Home turned off: to the first screen you chose); a link to a list always opens that list.

On the phone, the bar at the bottom leads to the main screens: “Home”, “Due”, “Lists”, “Notes” and “Settings” (four buttons, without “Home”, when the Home screen is turned off); it sits just above the line at the bottom of an iPhone. It is not on Home, whose tiles already lead everywhere. When all of Home fits on the screen, it doesn't scroll (or bounce); otherwise, it scrolls as usual. The round magnifying glass, just above it on the right, opens the search (not on “Settings”). To create a list: “+”, at the top right of “Lists”.

- “Due” gathers the tasks to do that have a due date, from all your task lists where the “Due date” option is turned on: “Overdue”, “Today”, “Tomorrow”, “This week”, then “Later”. Never wish lists or shopping lists.
- Each row shows the task, its list, its priority, its date and its time. Tap the box to check it (if you can edit the list): it leaves the screen, and “Undo” brings it back; a repeating task stays, at its next date ([5.3 Repeating tasks](#repeter)). Tap the row to open the task in its list.
- If one of your lists has assignment turned on, “All” or “Mine” chooses what is shown; “Mine” keeps only the tasks assigned to you ([5.4 Assign a task](#attribuer)). The choice is remembered on the device.
- “Due” shows two numbers: in red, at the top left of the icon, the overdue tasks; in green, at the top right, today's tasks. Each one only appears when there are some. Tasks assigned to someone else don't count.
- The screen works offline, like the lists. On a computer, “Due” is in the menu on the left, with the same numbers at the end of the row (red, then green).

**Choosing your tiles, or turning Home off**

Settings, “Home” (the first row of “General”) sets up the Home screen for your account: the choice applies to all your devices, and also works offline.

- “Tiles shown”: one switch per tile, to hide or show it (“To give” only appears anyway when you have reserved a gift). The “Account” tile is always shown: there is no bottom bar on Home, and it is the tile that leads to Settings.
- “Reorder”: drag a tile by its handle, or use the up and down arrows; “Done” closes this mode. Home follows this order; on the phone, a tile left alone on its row takes the full width.
- “Show the Home screen” turned off: Listo opens on the “First screen” you chose (“Due”, “Lists” or “Notes”; “Lists” at first), and the “Home” button leaves the bottom bar. The notification bell then moves to the top of “Due”, “Lists” and “Notes” ([6.1 The Notifications page](#notif-page)). On a computer, the “Home” entry of the menu on the left goes away, and the logo leads to the first screen you chose.

<a id="notes"></a>

### 5.12 Notes

A note keeps free text: a code, a recipe, ideas. At first it is yours alone: nobody else sees it, not even the Admin; you can share it ([5.13 Sharing a note](#notes-partage)). The text stays plain (line breaks kept, no formatting); web addresses in http or https become links.

- “Notes” screen (bottom bar, or the “Notes” tile on Home): “Pinned” notes first, then “Other notes”, most recently changed at the top. The sort button at the top (as in “Lists”) switches between most recent first and alphabetical order. The magnifying glass searches titles and texts.
- “+”, at the top right, opens a new note: the cursor goes straight into the text. On Home, “New note” does the same.
- A note saves itself: one second after your last keystroke, when you leave the note and when Listo goes to the background. The line under the bar says “Saved”, “Saving…” or “Offline · saved on this phone”; offline, the note is sent when the network comes back.
- To write in a note, tap its text: the cursor goes to that spot. A link opens in a new tab.
- A note's ⋮ menu (on its card, or in the note): “Pin” or “Unpin”, “Share” and “Public link” (your notes) or “People” (a note shared with you), “Duplicate” (a copy of your own, not shared, whose title ends with ‘(copy)’), “Delete” (your notes) or “Leave”.

**Two people at the same time**

If the note was saved elsewhere (by someone it is shared with, or on another of your devices) while you were writing, nothing is overwritten. A banner warns you (‘Léa just edited this note’); when it saves, Listo offers “Keep mine”, “Take theirs” (after confirmation) or “Keep both” (your text becomes a new note of your own). “Decide later” leaves the note “Needs checking”: your text stays on the device and the choice comes back when you reopen the note. If you are reading the note without writing, it updates before your eyes.

**Notes trash**

The “Notes trash” is in “Settings”, just below the “List trash”: your deleted notes stay there for 30 days, then they are deleted for good (you never see other people's notes there). “Restore” puts it back in its place (pinned if it was); “Delete for good” and “Empty the trash” ask for confirmation. A shared note disappears for everyone; restored, it comes back for each of them, with their pin. Offline, all this waits for the network to come back.

**On a computer**

“Notes” is in the menu on the left, with the number of notes (and a dot when there's something new); on the notes screens, “New note” (N key) replaces “New list” at the bottom of the menu. The open note shows to the right of the cards, with “Share” or “People” at the top, and saves itself (offline: “Offline · saved on this device”); the “/” key searches the notes.

<a id="notes-partage"></a>

### 5.13 Sharing a note

In one of your notes, “Share” (at the top of the note, or ⋮ menu) opens “Share note”, as for a list: add a person from the existing accounts, with “Can edit” or “Read only”, change that access, or remove them. You need a network connection.

- Owner: everything, including deleting the note, sharing it and managing its public link.
- “Can edit”: change the title and the text. Never delete the note, share it or manage its public link.
- “Read only”: read the note (links open), pin it for yourself. The card shows it with the “Read only” eye.
- Everyone except the owner can leave the note: ⋮ menu, “Leave”. Someone who loses access also loses their pin. Each person's pin is never shown to the others.
- The cards of a shared note show the people's initials; “People”, at the top of the note, lists them with their access. At the bottom of the note: ‘Edited by Léa · 5 min ago’.

**What's new and notifications**

When someone else changes a shared note, its card shows a dot and ‘Edited by Léa’ until you open it (it then counts as read on all your devices); the “Notes” tile on Home and, on a computer, the “Notes” entry in the menu on the left show the dot too. It's the same “What's new” setting as for lists ([5.16 What's new](#nouveautes)); the note's ⋮ menu: “Hide what's new”.

Notifications ([6.3 What you get, and when](#notif-recevoir)), on the Notifications page and on your devices: ‘Léa edited the note “Travel”’ (at most one per note every quarter of an hour) and ‘Léa shared the note “Travel” with you’. Without details, only the note's title is named, never its text; with details, the start of the text follows ([6.4 Details in the notification](#notif-detail)). The Notifications page only names the title, never the text. The note's ⋮ menu: “Turn off notifications”.

**A note's public link**

⋮ menu of one of your notes, “Public link”: the same sheet as for a list ([7.6 Owner: the public link](#lien-public)): duration, optional password shown only once, “Stop sharing”. The public page shows the title, the text (clickable links) and the date it was changed, read only; never the people or the pins. Moved to the trash, the note can no longer be seen through its link; restored, the link works again if it hasn't expired.

<a id="reserver"></a>

### 5.14 Reserve a wish, chip in

In a wish list, any member can reserve a wish, even with “Read only”, except the person the list is for. You need a network connection.

- Tap the wish, then “Reserve”. The row then shows who reserved it.
- When you reserve, turn on “Open to others” so that others can join in on a group gift; otherwise, nobody else can reserve it.
- On an open wish, “Chip in” adds you. “Leave” removes you; when the last participant leaves, the wish is free again.
- Each participant can open or close the reservation with “Open to others”.
- Listo only says who is chipping in: no amount, no share, no payment.
- Editing a reserved wish does not remove the reservation.

<a id="a-offrir"></a>

### 5.15 To give: your gifts

“To give” is an automatic list: all the wishes you reserve or chip in on, in all the wish lists you are a member of. It is yours alone, and works offline.

- On “Lists”, its card (light blue, “Automatic”) comes first among the wish lists, under “All” and “Wishes”, only if you have at least one reservation. ‘3/5’: 3 gifts still to buy out of 5. It is not a list: nobody can add to it, rename it, share it or delete it, and it is not counted among your lists. On Home, the “To give” tile leads there too.
- Gifts are grouped by person (‘For Zoé’), with their list, ‘Reserved’ or ‘You're chipping in (2 people)’, and their price.
- Check “Bought” once you have bought the gift: it is crossed out and moves to the bottom of its group. Only you see this box: not the person the gift is for, not the others, not the notifications, not an AI assistant ([8.5 Wish lists: no reservations](#claude-envies)).
- Tap the row (not the box) to open the wish in its list: that is where you cancel a reservation ([5.14 Reserve a wish, chip in](#reserver)).
- A gift leaves the list by itself when the person has marked it “Received”, when your reservation or participation ends, or when the wish or its list is deleted.

<a id="nouveautes"></a>

### 5.16 What's new

- In a shared list, Listo points out what the others added or changed since your last visit. Your own actions and deletions are never pointed out.
- On “Lists”, a badge on the card's icon gives the number of new updates (“30+” after more than a month away).
- In the list, each new update is highlighted, with who made it (“Added by Marie”). It stays highlighted during the visit, until you tap the row; when you leave the list, everything counts as seen, on all your devices.
- List menu ⋮: “Hide what's new”, then “Show what's new” to bring it back. Each person chooses for themselves, read-only access included. This is separate from the list's notifications ([6.5 Turning off notifications for a list](#notif-silencer)).
- Settings, “Notifications”, “In the app” part: “What's new” turns off all of it; “Include checked items” (shown only when “What's new” is on) adds what the others check or uncheck.
- On some phones, the icon of the installed app also shows their total. To be told without opening Listo: [6. Notifications](#notifications).

<a id="hors-ligne"></a>

### 5.17 Offline and sync

Without a network, you can keep adding, editing and checking, and writing in your notes ([5.12 Notes](#notes)). The changes are sent when the network comes back.

The badge at the top shows the state: “Up to date”, “Syncing…” or “Offline”, with the number of pending changes. Tap it to sync.

Sharing (a list or a note), the public link, duplicating, leaving a list or a note, the list trash, reservations, creating a store or an aisle, and Administration need a connection.

<a id="theme"></a>

### 5.18 Light or dark theme

Settings, “My account”, “Appearance” section: “Light”, “Dark” or “Auto” (like the phone). The choice applies to this device. On a computer, it is in the same place: Settings, “My account”, “Appearance”.

<a id="langue"></a>

### 5.19 Language: French or English

Settings, “My account”, “Language” section: “Automatic” (the language of the phone or the browser, otherwise the one chosen for the server), “Français” or “English”. The choice applies to your account, on all your devices; the app reloads in the chosen language. Your notifications also arrive in this language.

The names of lists, items, aisles and stores are not translated: they are your data. This help, too, is in French and in English: it follows the language you chose.

<a id="ordinateur"></a>

### 5.20 On a computer

In a window at least 1,024 pixels wide (a computer, a tablet turned sideways), Listo switches to a two-area layout. Below that, you get the phone layout; switching from one to the other keeps the list open and closes any open windows.

- On the left, the menu: “Search lists”, then “Home”, “Due”, “Lists” (with the number of lists) and “Notes” (with the number of notes), and at the bottom “New list” (“New note” on the notes screens), your account and Settings. The logo takes you back to “Home” (Home turned off: to the first screen you chose). The Home tiles are shown in three columns there.
- The menu follows the screen: on “Lists”, in a list and on “To give” (Wishes highlighted), it also shows “Types” (Shopping, Tasks, Wishes, with their number of lists and the new-updates dot). A type shows only its lists in the middle; “Lists” shows them all. An open list highlights its type. Elsewhere (Home, Due, Notes, Settings…), the menu only has its fixed entries. While you search in the menu, the lists found are shown below.
- In the middle, every screen (Home, Due, Lists, a list, “To give”, Notes, Settings, Help…) has the same width. At the top, on the title line: the status pill, the screen's buttons and the search; the line below holds the rest (counter, “All” / “Mine”, sort).
- On the right, the open list: at the top, on the title line, the status pill, “Share” and the search, always shown; below, the counter ([5.9 Groups, sorting and counter](#tri)), then the add field, above the items. When you hover over a row (or when it has the keyboard focus), a pencil and a trash can appear one above the other; on a touch screen, they stay visible.
- An item's details and “Share list” open in a panel on the right; “New list”, “Edit list” and confirmations in a window in the middle. The rest of the screen is grayed out and inactive; Esc closes. Item details that were changed and not saved ask “Discard changes?” before closing.
- “Share list” brings together the people on the list and the public link. The owner chooses each person's access there, adds or removes people, and manages the link; the other members only see the list of people there.
- Right-click on a row (or the Menu key, or Shift+F10): Edit, Check, Delete, depending on your access.

**Keyboard shortcuts**

The “?” key (or the “?” button at the top left) shows the list. No single-key shortcut works while you are typing in a field. A shortcut only does what your access allows: with read-only access, no Space, no E, no Delete; no shortcut reserves a wish.

| Key | Action |
| --- | --- |
| ? | Show shortcuts |
| N | New list (new note on the notes screens) |
| / | Search (in the list, in the notes, or in the menu) |
| , | Settings |
| Esc | Close the window; clear, then leave the search |
| \[ and \] | Previous, next list |
| P | Share list |
| A | Go to the add field |
| ↓ and ↑ | Next, previous item |
| Space | Check or uncheck |
| Enter | Open item details |
| E | Edit |
| Delete | Delete (can be undone) |
| Ctrl+Z | Undo the last action |
| Ctrl+Enter | Save the item details or the form |
| S | Go to the Help contents |

Single-key shortcuts can be turned off in Settings, “General”, “Single-key shortcuts” (useful with voice control). The setting applies to this device; the arrow keys, Enter and Ctrl shortcuts still work.

**Undo (Ctrl+Z)**

Ctrl+Z undoes, in the open list, the last actions made on this computer (20 at most per list, forgotten if the page is reloaded): deleting an item, checking or unchecking it, editing it. It also works offline: the undo is sent with the rest when the network comes back. If someone changed the item in the meantime, nothing is overwritten: “Changed in the meantime: nothing was undone”.

Ctrl+Z does not undo: adding an item (delete the item), a photo, a reservation or chipping in (“Leave” in the details), “Put all back on the list” and “Clear the cart” (already confirmed), deleting a list (it stays in the trash for 30 days), the list's settings and sharing.

<a id="sous-taches"></a>

### 5.21 Subtasks

In a task list, the owner turns on “Subtasks” in “Options for items” ([7.3 Owner: editing the list](#modifier)). A main task can then group subtasks: the list stays short, and each project has its steps.

- At the end of a main task's row, “1/3” says how many subtasks are done. Tap it: the subtasks appear right below, indented. Tap it again to collapse them. The chevron at the end of the row under the list title (“Expand all”, then “Collapse all”) acts on all the main tasks (and on the groups and the done items). This device remembers what is expanded.
- To add a subtask: expand the main task and tap “Add a subtask”; or open a task's details and tap “Add a subtask”. Enter adds it and leaves the field ready for the next one; Enter on an empty field closes it.
- To put an existing task under another one: its details, “Subtask of”, then the main task. “None” takes it out again.
- One level only: a subtask has no subtasks. A task that has subtasks, or that repeats, cannot become a subtask.
- A subtask has everything a task has (note, due date, time, reminder, priority, assignment), except repeating.
- Checking the main task checks all its subtasks; the message offers “Undo”. It never gets checked by itself, even when the last subtask is done. Unchecking a subtask, or adding one, unchecks the main task.
- A repeating main task ([5.3 Repeating tasks](#repeter)) comes back at its next date with all its subtasks unchecked: handy for a checklist you need to go through again.
- Subtasks keep the order chosen by hand, whatever the list's sorting: to start with, the order in which they were added (a new one goes at the end). To change it: expand the main task and tap the two arrows to the right of “Add a subtask” (“Reorder”). Drag a subtask by its handle (the three lines on the left), or tap “Move … up” and “Move … down”; “Done” closes the mode. Each move is saved right away, offline included; if two people move things at the same time, the last move wins.
- Checked subtasks stay in their place, crossed out: you can see how far along you are. A checked main task goes to “Done” with its subtasks. “Remove done items” does not remove the checked subtasks of a main task that is still to do.
- Deleting a main task also deletes its subtasks; “Undo” brings them all back.
- The search also finds subtasks: they are shown under their main task. In “Due” ([5.11 Getting around: Home, Due](#echeances)), a subtask shows the name of its main task. The public link shows subtasks under their main task, read only.
- Turning off “Subtasks” erases nothing: the tasks are shown in one flat list, and are grouped again if the option comes back. A duplicated list keeps its subtasks.

<a id="notifications"></a>

## 6. Notifications

Listo tells you about what concerns you: a change in a shared list, a reservation, a share, every morning the tasks for the day, and a task's reminder. Everything shows up on the Notifications page (the bell on Home), even with no phone signed up. On top of that, Listo can let you know on your phone or computer, without opening it: it's optional, the feature is off by default on the server, and then everyone chooses, device by device.

The Settings screen, “Notifications”, has two parts: “In the app” (what's new, badges and glow: [5.16 What's new](#nouveautes)) and “On this device” (notifications, described here). The kinds (“Notifications you get”) apply both to the Notifications page and to your devices.

<a id="notif-page"></a>

### 6.1 The Notifications page

The bell, at the top of Home (Home turned off: at the top of “Due”, “Lists” and “Notes”), opens the Notifications page; its badge gives the number of unread notifications (9+ above 9). The “Notifications” row of the “Account” tile leads there too. At the top right of the page, the settings button opens Settings, “Notifications”.

- Notifications are grouped by day (“Today”, “Yesterday”, then the date), newest first. An unread notification is in bold, with a blue dot; “3 unread” says so at the top.
- Tapping a notification marks it as read and opens what it's about: the list, the task, the note or the due tasks. If the list was deleted or is no longer shared with you: “This list is no longer available”.
- Opening the page marks nothing as read: “Mark all as read” does. Opening a list, a note or the “Due” screen (from a phone notification, for example) marks the notifications about them as read. Read on one device means read on all of them.
- Marking as read without opening: swipe an unread notification to the right (green “Read” area); or its ⋮ button, “Mark as read”.
- Clearing: swipe a notification to the left, then “Clear”; or use its ⋮ button (keyboard, screen reader). “Clear all”, at the bottom, asks for confirmation.
- Notifications are kept for 30 days, 300 at most (the oldest ones go).
- Changes made close together in the same list or the same note fit on a single line, which updates (‘Léa added 4 items to “Shopping”’) and becomes unread again.

It fills up even without phone notifications (feature off on the server, device not signed up): nothing is sent anywhere but your server to fill it. Offline, it shows the last copy received; “Mark all as read” and “Clear” go out when the network is back.

Same settings as the phone: a kind turned off in “Notifications you get”, or a list or a note whose notifications you turned off, doesn't show up on the page either. The page always gives the details (name of the task, of the wish); “Show details in the notification” only concerns the phone's screen. For a note, it only names the title, never the text.

<a id="notif-activer"></a>

### 6.2 Turning them on for a device

Settings, “Notifications”, “On this device” part, then the “Get notifications on this device” switch. The browser then asks for your permission: accept. It only asks at that moment, never on its own. “Send a test notification” checks that everything works.

- Android: in Chrome (or another browser), or from Listo installed on the Home Screen ([4.4 Installing Listo on your phone](#telephone)).
- Computer: Chrome, Edge, Firefox or Safari. The notification appears in the corner of the screen or in the system's notification center.
- iPhone and iPad: first add Listo to the Home Screen ([4.4 Installing Listo on your phone](#telephone)), then open it from its icon. In a plain Safari tab, the screen explains this and the switch stays grayed out. You need iOS 16.4 or later.

Each device is turned on separately: a device where you sign out no longer gets anything. Tapping a notification opens Listo on the list in question.

<a id="notif-recevoir"></a>

### 6.3 What you get, and when

Four kinds of notifications, each turned on or off in Settings, “Notifications”, “Notifications you get” section. These settings apply to the Notifications page and to all your devices.

| Kind | When | Example |
| --- | --- | --- |
| “Changes” | Someone else adds, edits or checks something in a list shared with you, or assigns you a task. Changes made within a minute are grouped into a single notification per list. A shared note changed by someone else: at most one notification per note every quarter of an hour. | ‘Léa edited “Shopping”’, ‘Léa assigned you a task in “Home”’, ‘Léa edited the note “Travel”’ |
| “Wishes” | Someone reserves a wish or chips in for a gift, in a wish list where you can see the reservations. | ‘Marc reserved a wish’ |
| “Sharing” | You're added to a list or a note, or your access changes. | ‘Léa added you to “Home”’, ‘Léa shared the note “Travel” with you’ |
| “Due” | Every morning around 8 AM, a single summary of the tasks due today and overdue, if there are any. And a task's reminder, at the time chosen in its details ([5.2 Time and reminder](#heure)). | ‘3 tasks due today · 1 overdue’, ‘Reminder: a task today at 2:00 PM’ |

You're never notified about what you do yourself (or about what an AI assistant does for you: [8. AI assistants (MCP)](#claude)). Unchecking and deleting are not notified. The due-date summary only counts task lists where due dates are turned on, and never tasks assigned to someone else. A task's reminder goes to the person it's assigned to, otherwise to all the members of the list.

<a id="notif-detail"></a>

### 6.4 Details in the notification

“Content” section, “Show details in the notification”: off at first. When it's off, the notification only says who changed which list, or how many tasks are waiting for you. When it's on, it also names the items (‘Added: Milk, Bread · Checked: Milk’, ‘Marc reserved “Bike”’, the names of the first tasks of the day with their time, ‘Reminder: Dentist’). Best avoided if other people can see your phone's lock screen.

<a id="notif-silencer"></a>

### 6.5 Turning off notifications for a list

The list's ⋮ menu: “Turn off notifications”. It no longer sends you anything, neither on the Notifications page nor on your devices, whatever its kind (due-date summary included). “Turn notifications back on” brings them back. Everyone chooses for themselves; it's forgotten if you leave the list. A shared note has the same choice in its ⋮ menu.

This is separate from “Hide what's new”, in the same menu (badges and glow, [5.16 What's new](#nouveautes)): you can keep what's new for a list without getting its notifications, and the other way around.

<a id="notif-limites"></a>

### 6.6 Limits and wish lists

- At most 30 phone notifications per person per hour (the due-date summary doesn't count); the Notifications page has no such cap.
- If you already have the list open on screen when someone changes it, you're not notified: you've seen it.
- Wish list: the person it's for never gets anything, neither on their devices nor on their Notifications page, about a reservation or a contribution, nor what others add to their list. The surprise is kept. A visitor using the public link, without an account, never gets notifications.

<a id="notif-confidentialite"></a>

### 6.7 What Apple, Google, Mozilla and Microsoft see

A notification goes through your device's service: Apple (iPhone, iPad, Safari on Mac), Google (Chrome, Android, Edge on Android), Mozilla (Firefox) or Microsoft (Edge on Windows). The text is encrypted for your device only: these services can't read it. They see the time, the size of the message, and the device that receives it.

This is the third exception to the principle ‘no data sent anywhere but your server’, along with the version check and scan mode ([1.2 What Listo doesn't do](#limites)). It only exists if the person who runs the server turns the feature on.

<a id="notif-serveur"></a>

### 6.8 Turning the feature on on the server

*For the person who runs the server.*

Off by default. To turn it on, uncomment the `- LISTO_PUSH=on` line in `docker-compose.yml`, then:

```sh
docker compose up -d
```

The due-date summary goes out around 8 AM in the server's time zone: set `TZ` (for example `TZ=Europe/Paris`, already in the shipped file), otherwise it arrives at 8 AM universal time ([3.3 Settings (variables)](#variables)).

On first start, Listo creates its notification keys in `secrets/vapid.json`, next to the secret key. Keep a copy of it along with the key ([3.7 Keep the secret key safe](#cle)). If this file is lost, Listo creates a new one: each device that already gave permission subscribes again by itself the next time it opens Listo; otherwise, just turn the switch back on.

The server must be able to reach the notification services over HTTPS (fcm.googleapis.com, push.services.mozilla.com, push.apple.com, notify.windows.com). When the feature is off, no key is created and no request goes out to them; the Notifications page, the morning summary and reminders still work, in the app only ([6.1 The Notifications page](#notif-page)).

<a id="notif-depannage"></a>

### 6.9 Nothing shows up

- The screen says notifications were blocked: allow them in your browser or phone settings (notifications for this site, or for the Listo app), then come back to Settings, “Notifications”.
- On iPhone: Listo must be installed on the Home Screen and opened from its icon, not from Safari.
- The list was already open on screen: nothing is sent for what you've seen.
- A change arrives about a minute later (grouping); the due-date summary, only around 8 AM.
- Firefox after an update: quit it completely and open it again, then “Send a test notification”.
- On a computer, the system must also allow the browser's notifications, in addition to Listo in the browser. On Mac: System Settings › Notifications › Firefox (or Chrome, Edge, Brave…), ‘Allow notifications’ turned on, style ‘Banners’ or ‘Alerts’; macOS keeps it off as long as you've never answered its request. On Windows: Settings › System › Notifications, notifications turned on and the browser allowed in the list. In Firefox, also check that ‘Pause notifications until Firefox restarts’ is not checked (Settings › Privacy & Security › Permissions › Notifications).
- On a computer, the screen says the browser couldn't register with its notification service: the browser must be able to reach this service over the Internet (Google for Chrome and Brave, Microsoft for Edge, Mozilla for Firefox). A DNS filter (AdGuard, Pi-hole…), an ad blocker (uBlock Origin…), a proxy, a firewall or a VPN can prevent it, even if other sites that are already registered keep getting their notifications. To find out what to unblock: open the filter's query log, turn on notifications in Listo, and allow the addresses refused at that moment; they are the ones of the browser's service, for example …googleapis.com or …google.com for Chrome and Brave, …notify.windows.com or …wns.windows.com for Edge, …push.services.mozilla.com for Firefox. With a blocker in the browser, turn it off for a moment on Listo to try. In Brave, you also need to turn on ‘Use Google services for push messaging’ in its settings (Privacy and security), then restart it. The message gives the details provided by the browser.
- Also check the phone's ‘Do Not Disturb’ or ‘Focus’ mode, the kind of notification in “Notifications you get”, and that the list's notifications aren't turned off. The screen says “Notifications on devices are turned off on this Listo server”: see [6.8 Turning the feature on on the server](#notif-serveur). In any case, the Notifications page keeps what you would have received ([6.1 The Notifications page](#notif-page)).

<a id="roles"></a>

## 7. Role by role

On each list, everyone has a role: owner, contributor (“Can edit”), read only, or visitor through the public link. The Admin, for their part, manages the accounts. The table below sums up who can do what; the sections that follow go into detail. A shared note has the same permissions, in a simpler form: [5.13 Sharing a note](#notes-partage).

| Action | Owner | Contributor | Read only | Visitor | Admin |
| --- | --- | --- | --- | --- | --- |
| See the list and its items | Yes | Yes | Yes | Yes | No |
| Check, add, edit or delete items, add a photo | Yes | Yes | No | No | No |
| Create a missing store or aisle | Yes | Yes | No | No | Yes |
| Duplicate the list | Yes | Yes | No | No | No |
| Reserve a wish or chip in on a gift (wish list), except the person the list is for | Yes | Yes | Yes | Yes | No |
| Edit the list (title, type, store, icon, options) | Yes | No | No | No | No |
| Share the list and choose each person's permission | Yes | No | No | No | No |
| Create a public link | Yes | No | No | No | No |
| Delete the list, restore it or erase it for good from the trash (30 days) | Yes | No | No | No | No |
| Leave the list | No | Yes | Yes | No | No |
| Manage accounts, stores, aisles and items | No | No | No | No | Yes |

Contributor: an account with the “Can edit” permission on the list. Read only: an account with the “Read only” permission. Visitor: a person without an account who opens the public link (they can only read, except to reserve or chip in on a wish list). Admin: what the Admin can do on other people's lists; for their own lists, they're the owner like everyone else. In a wish list, the person the list is for never sees the reservations, even if they're its owner.

<a id="role-admin"></a>

### 7.1 Admin

Settings, “Administration” (visible only to an Admin).

**“Accounts” tab**

- “Add account” ([4.2 Creating the other accounts](#creer-comptes)).
- An account's ⋮ button: “Reset password”, “Disable two-factor authentication”, “Disable account” or “Re-enable account”, “Delete account” if it has never been used.
- Role: “User” or “Admin”. There's always at least one active Admin.

**“Shopping” tab**

- “Stores”: add a “Single” store or a “Multi” store (which groups other stores), rename, disable, delete if it has never been used.
- “Aisles”: grouped by store, “All stores” first. Add (choosing its store), rename, change the store, disable, delete if it has never been used. Two stores can each have an aisle with the same name; an “All stores” aisle has a name of its own. An aisle only goes to a store if no list from another store, or without a store, uses it.
- “Items”: the memory of names typed in shopping lists. “Correct” changes a name everywhere, “Change aisle” changes the usual aisle, “Remove” takes it out of the suggestions.

**Can / can't**

- Can: manage accounts, stores, aisles and items; see whether a new version exists (Settings › “About”).
- Can't: see the content, the name or the members of other people's lists. An Admin sees a list only if it's shared with them, with the permission chosen by its owner. The same goes for notes ([5.12 Notes](#notes)).
- Other accounts' AI assistant connections: see [8.8 See and disconnect an AI assistant](#claude-connexions).
- Finding out that a new version exists: [9.9 Knowing a new version exists](#version).

<a id="creer"></a>

### 7.2 Owner: creating a list

On “Lists”, tap “+” at the top right (on a computer: “New list”). Give it a title, choose the type of list (“Shopping”, “Tasks” or “Wishes”) and an icon.

- Shopping list: also choose the store. Items are sorted by aisle, or by store for a “Multi” store.
- Task list: “Options for items” turns on priority, due date and assignment.
- “After adding” (all lists): “Stay on the list” to keep adding, or “Open item details” to fill in what you just added right away. To start with: “Stay on the list” for a shopping list, “Open item details” for the others.
- If the store or aisle is missing, “New store…” or “New aisle…” creates it (network connection needed). An aisle created this way belongs to the list's store (to “All stores” for a list without a store).

<a id="modifier"></a>

### 7.3 Owner: editing the list

The list's ⋮ menu, “Edit”: the title, the type, the store, the icon. For a task list, “Options for items” turns priority, due date, assignment and subtasks on or off ([5.21 Subtasks](#sous-taches)); for a wish list, “Priority”. “After adding” chooses between “Stay on the list” and “Open item details”. Only the owner edits the list.

- Changing the type doesn't erase anything. A shopping list that becomes a task list hides its aisles, its store and its barcodes; a task list that becomes a shopping list hides priority and due date. Everything comes back if the list goes back to its original type. The form reminds you of this before saving.
- Changing the store: each item keeps its aisle if it's also used in the new store, otherwise it goes to the aisle with the same name; failing that, it goes to “No aisle”. The “Put items in aisles” window then opens so you can choose an aisle right away (or later, from the item's details).
- Priority (low, normal, high) is off to start with, for a task list as well as for a wish list. Everyone sees it. Due dates exist only for task lists.
- Becoming a wish list, on the other hand, is permanent ([7.5 Owner: wish list](#envies)).

<a id="partager"></a>

### 7.4 Owner: sharing and choosing permissions

“Edit list”, “Share with” row: a window opens with one row per person. Check a person, then choose their permission at the end of their row. “OK” closes the window; the sharing is saved with “Save”.

- “Edit” (“Can edit” permission): the person is a contributor ([7.8 Contributor (“Can edit”)](#role-contributeur)).
- “View” (“Read only” permission): the person can only read ([7.9 Read only](#role-lecture)). This is the starting choice.
- You can change the permission or remove a person at any time.

<a id="envies"></a>

### 7.5 Owner: wish list

A wish list gathers gift ideas for one person, the recipient. The people close to them can reserve a wish ([5.14 Reserve a wish, chip in](#reserver)). The surprise is kept: the recipient never sees that a wish is reserved, nor by whom, nor how many people are chipping in, even if they created the list themselves ([7.11 Recipient of a wish list](#role-beneficiaire)).

- “Who is it for?” is chosen when the list is created: “Me”, another account, or “Someone without an account” (a child, for example). It can't be changed afterwards, and the list can't change type anymore.
- A shopping or task list can become a wish list: in “Edit list”, choose “Wishes”, then “Who is it for?”. This is permanent, it needs a network connection, and nothing is erased: quantities and due dates are kept without being shown, checked items become “Received”, and an active public link is stopped.
- If the list is for another account, that person is automatically part of it, with “Can edit”: they add their wishes themselves.
- A wish has a name and, if you want, a link (“Open link”), an “Approximate price” (in the currency set on the server, euros by default), a note and a photo.
- Checking a wish moves it to “Received”: only the recipient and the owner can do this; reservations are no longer shown there.
- When the list is for someone else, its owner sees who's chipping in and can “Remove” a participant or “Release” the wish (for example if someone has left the list). On a list for yourself (“Me”), nobody can remove a participant who has left ([9.11 Wish list: a participant has left](#faq-orphelin)).
- A wish list can't be copied (“Duplicate” isn't offered in its menu).

<a id="lien-public"></a>

### 7.6 Owner: the public link

“Share by link” (⋮ menu) creates an address that you send to a person without an account. They see the list as read only ([7.10 Public link visitor](#role-visiteur)). A note has its own public link too, with the same rules: “Public link” in its ⋮ menu ([5.13 Sharing a note](#notes-partage)).

- Duration: 1 hour, 24 hours, 7 days, 30 days, “Custom” or “Unlimited”. “Change duration” changes it.
- “Protect with a password”: the password is shown only once. Write it down.
- “Stop sharing” makes the link unusable right away.
- Wish list: the visitor can also reserve a wish or chip in on a gift. A reservation made through the link shows with the first name given, followed by ‘(public link)’; the owner can remove it, just like a reservation by someone close.

> **Warning**: Don't give a wish list's link to its recipient: if they open it without being signed in to Listo, they'll see which wishes are reserved (never by whom). Signed in, they see nothing about reservations.

<a id="corbeille"></a>

### 7.7 Owner: duplicating, deleting, restoring

- “Duplicate” (the list's ⋮ menu) creates a copy in your name, with or without its items (all unchecked). The copy is private: the people the list is shared with, the public link and the photos are not copied.
- The list's ⋮ menu, “Delete”: a confirmation first reminds you what the list contains and who it's shared with. The list then disappears for everyone, and its public link stops.
- A deleted list stays in your “List trash” (Settings) for 30 days, then it's erased for good. Only its owner sees it there; each row shows its type, its number of items, the day it was deleted and the number of days left.
- “Restore” puts it back the way it was, for everyone it was shared with: items, each person's permission, settings, photos, reservations. It needs a network connection. Its public link doesn't come back: create it again if needed.
- “Delete for good” (a row's red trash can) erases the list right away, with its items and photos; “Empty the trash”, at the top, erases all the lists shown. Both ask for confirmation and need a network connection, and nothing comes back afterwards: the list can no longer be restored.
- The owner doesn't leave their list: they delete it, or keep it.

<a id="role-contributeur"></a>

### 7.8 Contributor (“Can edit”)

- Can: check, add, edit and delete items and their photo ([5. Everyday use](#quotidien)); create a missing store or aisle; “Duplicate” the list (the copy belongs to them); reserve on a wish list (unless they're its recipient).
- Can't: change the title, the type or the options, share, create a public link, delete the list.

Leaving: the list's ⋮ menu, “Leave”. The list disappears from your lists; your items stay in it. The owner can share it with you again. It needs a network connection.

<a id="role-lecture"></a>

### 7.9 Read only

The list's card and the top of the list show “Read only”.

- Can: read the list, its items and their photos (tapping a row opens its details); sort and search; reserve a wish on a wish list; leave the list (⋮ menu, “Leave”).
- Can't: add, check, edit or delete anything.

<a id="role-visiteur"></a>

### 7.10 Public link visitor

A person without an account opens the link they were sent, without installing anything.

- Can: read the list; tap an item to open its details (quantity, full note, aisle or store, checked or not, barcode, photo to enlarge, priority and due date if they're turned on, and a task's repeat).
- Wish list: see the wishes (name, note, link, price, priority, photo) and those already received; “Reserve” a free wish, “Chip in” on a gift open to others, cancel their participation. They're asked for their first name once. They only see whether a wish is reserved, never by whom or how many.
- Can't: edit the list, see who else has reserved.
- The link may ask for a password, and it stops working when it expires or when the owner stops sharing ([9.3 A public link doesn't work anymore](#faq-lien)).

<a id="role-beneficiaire"></a>

### 7.11 Recipient of a wish list

The person the wish list is for adds their wishes (if they have an account) and marks them “Received”.

- Never sees: that a wish is reserved, by whom, how many people are chipping in, or “Open to others”. Not in the list, not in What's new, not through an AI assistant ([8.5 Wish lists: no reservations](#claude-envies)), and not on the public link page when signed in.
- Can't reserve their own wishes.
- Only someone with access to the server (database files, backups) could read a reservation: don't give this access to the recipient if the surprise matters.

<a id="claude"></a>

## 8. AI assistants (MCP)

<a id="claude-quoi"></a>

### 8.1 What it's for

An AI assistant is a program you chat with, for example Claude (Anthropic's assistant: claude.ai, the mobile app, Claude Desktop, Claude Code). Listo follows the MCP standard: any AI assistant that accepts a custom connector (or MCP server) can plug into it, such as Claude, ChatGPT or Mistral's Le Chat, depending on their versions and plans. Once it's connected, it can read your lists and, if you allow it, add items to them, check them and edit them, just by asking.

The assistant acts with your account and your rights, never more: what it adds shows up under your name, as if you had done it yourself, and it only sees the lists you allowed it to. Nothing happens without your approval, given on Listo's “Authorize an AI assistant” screen.

This access only exists if the person who runs the server has turned it on ([8.12 Access turned off at first](#claude-activation)). Otherwise, the “AI assistants” section doesn't appear in “My account”.

<a id="claude-phrases"></a>

### 8.2 Example sentences

- Read: ‘What are my Listo lists?’, ‘What's on the Groceries list?’.
- Add, with an aisle: ‘Add tomatoes to the produce aisle in Groceries.’
- Add, with a store (“Multi” list): ‘Add milk at Costco to the Saturday list.’
- Check: ‘Check off the bread and the butter.’ Uncheck: ‘Uncheck the milk.’
- Priority and due date (task list): ‘Make the Light bulb task high priority, due Friday.’
- Time and reminder ([5.2 Time and reminder](#heure)): ‘Dentist Thursday at 2 pm, remind me an hour before.’ ‘No more reminder for the dentist.’
- Assign ([5.4 Assign a task](#attribuer)): ‘Give the light bulb task to Léa.’ ‘What do I have to do this week?’ ‘The garage, for Léa and Marc.’ ‘Trash every Monday, taking turns: Léa, Marc, Zoé.’
- Task that repeats ([5.3 Repeating tasks](#repeter)): ‘Trash, every Monday and Thursday.’ ‘Rent, on the 5th of every month.’ ‘The meeting, on the first Monday of the month.’ ‘Stop repeating the watering.’ The assistant tells you the next date. If it checks a task that repeats, the task comes back on its next date, and the assistant tells you that date.
- Rename or add details: ‘Rename milk to 2% milk’, ‘Add the note organic to the apples.’
- Move to an aisle: ‘Put the milk in the dairy aisle.’
- Subtasks ([5.21 Subtasks](#sous-taches)): ‘Add the steps Batch 1, Batch 2 and Batch 3 under the Authelia task.’ ‘Put Bitwarden under the Accounts task.’ ‘Take Mac out of its main task.’ ‘Put Check backups first under Authelia.’

The assistant first reads the list to learn its aisles or stores, and it must never make any up. If an item was left without an aisle or a store, it must tell you. Exactly how it behaves is up to the assistant itself: check in Listo.

<a id="claude-niveaux"></a>

### 8.3 Two levels of access

When you connect an assistant, Listo's “Authorize an AI assistant” screen lets you choose:

- “Read only” (selected at first): the assistant can read your lists, without changing anything.
- “Read and write”: on top of that, the assistant can add items, check or uncheck them, and change their name, quantity, note, priority, due date (date, time, reminder), repeat, the person they're assigned to, their aisle or their store.

You also choose “All my lists” or “Some lists”. Even with “Read and write”, the assistant can only write in lists where you yourself can write: if you have the “Read only” right on a list, it can only read it.

<a id="claude-jamais"></a>

### 8.4 What an assistant can never do

Whatever the level of access, an AI assistant can never:

- delete an item, or change its link or its price;
- create, rename, delete or share a list;
- manage people, the public link or the trash;
- see photos, or who added what.

<a id="claude-envies"></a>

### 8.5 Wish lists: no reservations

An AI assistant never receives any reservation data, for anyone: not who reserved, not even whether a wish is reserved. So the surprise is kept, even if the recipient asks their assistant. In a wish list, checking means ‘received’: only the recipient and the list's owner can do it, with or without an assistant.

<a id="claude-limites"></a>

### 8.6 Limits

- 20 items at most per request.
- Per connection and per hour: 100 additions, 300 items checked or unchecked, 300 items edited. Beyond that, the assistant gets a refusal and nothing is written.
- 120 calls per minute per connection.
- 5 active AI assistant connections at most per account; a connection unused for 30 days frees itself up.
- The assistant doesn't create an item with the same name as one that's already there and not checked: it tells you instead.

<a id="claude-connecter"></a>

### 8.7 Connect an AI assistant

The steps are the same for every assistant:

1. In Listo: Settings, “My account”, “AI assistants” section, “AI assistants”. Under “Address to enter in your AI assistant”, tap “Copy address”. It looks like `https://listo.exemple.fr/mcp`.
2. In your AI assistant: in its settings, add a custom connector (or MCP server) with this address. Menu names change from one assistant to another; see its help.
3. The assistant opens Listo's “Authorize an AI assistant” screen. Check the website shown under “The response will be sent here” and that you're the one who just started the connection ([8.9 Be careful: check the website](#assistant-site)), choose the level and the lists, enter your password (and your two-factor authentication code), then “Authorize”.

Example with Claude (claude.ai, the mobile app or Claude Desktop): in its settings, add a custom connector with Listo's address, then connect it; on the “Authorize an AI assistant” screen, the website shown is `claude.ai`.

With Claude Code, on a computer: `claude mcp add --transport http listo https://listo.exemple.fr/mcp`, then `/mcp` to authorize. The response then goes to “an app on this computer (localhost)”.

Signed in with an identity provider ([4.9 Signing in with an identity provider](#sso)): no password at this step. The screen first asks “Confirm with …”: the provider asks you to sign in again, then you come back to choose the level and the lists, and “Authorize”.

If you didn't start the connection yourself, tap “Deny”.

<a id="claude-connexions"></a>

### 8.8 See and disconnect an AI assistant

Settings, “My account”, “AI assistants”: every authorized connection appears there, with the app, its right (“Read only” or “Read and write”), its lists, its date and when it was last used.

- “Disconnect” cuts a connection right away; “Disconnect all” cuts them all. No password is asked.
- Changing your password also disconnects all your AI assistant connections.
- To reconnect an assistant, you have to authorize it again.
- The Admin doesn't see other accounts' AI assistant connections; but disabling an account or resetting its password cuts them all.

<a id="assistant-site"></a>

### 8.9 Be careful: check the website

> **Warning**: Any AI assistant that follows the standard can ask for access to Listo: you are the one who decides, on the “Authorize an AI assistant” screen. It shows in large type the website that will receive the response (for example `claude.ai` for Claude). Check that it really is your assistant's. If you didn't start the connection yourself, deny: someone may be trying to get into your lists.

When the app chooses its own name, it is followed by “name given by the app, not verified”: trust the website, not the name. The person who runs the server can also accept only some websites ([8.13 Turn on access on the server](#mcp-serveur)).

<a id="claude-prudence"></a>

### 8.10 Be careful: booby-trapped texts

> **Warning**: A shared list can contain a booby-trapped text, written by someone else to trick the AI assistant (for example a note asking it to check everything). Listo always presents list content to the assistant as data, never as instructions, but only choose “Read and write” if you need it.

Only ask the assistant to change an item yourself; check in Listo what it did.

<a id="faq-claude"></a>

### 8.11 Troubleshooting

- After a Listo update, the assistant may keep its old list of tools: start a new conversation, or disconnect and reconnect the connector in the assistant.
- A list is missing: the connection may only allow some lists, or you're no longer a member. Reconnect the assistant with “All my lists” ([8.7 Connect an AI assistant](#claude-connecter)).
- The assistant refuses to write: the connection is “Read only”, or you only have the “Read only” right on this list.
- Nothing works anymore: the connection may have been cut (password changed, “Disconnect”). See “AI assistants” ([8.8 See and disconnect an AI assistant](#claude-connexions)).
- Listo shows a page saying the authorization request is invalid: the assistant's request couldn't be verified (return address refused, incomplete request), or its website isn't accepted by the server ([8.13 Turn on access on the server](#mcp-serveur)). Start the connection again from the assistant; if it happens again, tell the person who runs the server.
- The assistant says an aisle or a store is unknown: it doesn't exist, it's disabled, or this list doesn't offer it (an aisle from another store, or a store in a “Multi” list). Nothing was added; the assistant should list the valid aisles or stores for you. Choose one, or ask the Admin to create it (Settings, “Administration”, “Shopping” tab).
- The assistant says a store can't be chosen in this list: in a list with a “Single” store, the store is the list's own; you choose the aisle. The aisle, for its part, can't be chosen in a “Multi” list.

<a id="claude-activation"></a>

### 8.12 Access turned off at first

Access for AI assistants is turned off until the person who runs the server puts `LISTO_MCP=on` in `docker-compose.yml` ([8.13 Turn on access on the server](#mcp-serveur)). While it's off, all its addresses answer as if they didn't exist, and the “AI assistants” section of “My account” doesn't appear.

<a id="mcp-serveur"></a>

### 8.13 Turn on access on the server

*For the person who runs the server.*

Access for AI assistants is turned off by default. To turn it on, add `- LISTO_MCP=on` in the `environment:` part of `docker-compose.yml`, then `docker compose up -d`. To turn it off: remove the line, then `docker compose up -d`; all its addresses then answer 404, and the connections already granted stop working (they come back if you turn it on again, as long as they haven't expired). No password or key is needed.

Which assistants: by default, any AI assistant that follows the standard (MCP, with OAuth 2.1 authorization and PKCE) can ask for access, always after the person approves. To accept only some websites, add for example `- LISTO_MCP_SITES=claude.ai,claude.com` (website names separated by commas, without `https://` or a path): only those websites, and apps on the computer (`localhost`, like Claude Code), can then connect. Connections already granted to another website stop working (without being deleted: they come back if you put the website back). A badly written value keeps Listo from starting, with a message in `docker logs listo`. Listo only reads an app's identification document (CIMD) on a short list of websites (`claude.ai`, `claude.com`, or those in `LISTO_MCP_SITES`); other assistants register on their own.

Proxy: nothing to set up, these addresses go through the same host. They must stay reachable from the Internet: an online assistant calls them from its servers, an app on the computer (Claude Code) from your computer. Claude as an example: the subdomain must have an IPv4 address (DNS ‘A’ record), because Claude doesn't use IPv6; if a firewall filters incoming connections, don't copy an address range found somewhere else: Anthropic publishes the up-to-date list of addresses these calls come from on its official [‘IP addresses’](https://platform.claude.com/docs/en/api/ip-addresses) page, section ‘Outbound IP addresses’, and may change it. For another assistant, see its documentation.

| Address | Who calls it | Role |
| --- | --- | --- |
| `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-protected-resource` | the AI assistant | Says where to ask for authorization. |
| `/.well-known/oauth-authorization-server` | the AI assistant | Description of the authorization server. |
| `/oauth/authorize` | your browser | Checks the request, then opens the “Authorize an AI assistant” screen. |
| `/oauth/token`, `/oauth/revoke`, `/oauth/register` | the AI assistant | Tokens, revocation, automatic registration. |
| `/mcp` | the AI assistant | The MCP server: requires a token obtained through authorization; without a valid token, refusal (401). |

<a id="mcp-regles"></a>

### 8.14 Rules and log

*For the person who runs the server.*

- Access token: 1 hour; refresh token: 30 rolling days, replaced at each use; an old token presented again brings down the whole connection. The database only keeps a fingerprint of the tokens, never the tokens themselves.
- An AI assistant's token opens nothing but `/mcp`: not the app, not its other addresses.
- Return addresses: https on a website name (never an IP address), without a username or fragment, or the computer (`localhost`); with `LISTO_MCP_SITES`, only those websites. They are checked at registration and at every authorization. An error is only sent back without a screen to the computer or a known website (`claude.ai`, `claude.com`, or those in `LISTO_MCP_SITES`): otherwise, Listo shows its error page, so it never acts as a relay to another website.
- Changing your password, or an account that is disabled or whose password is reset (including with the recovery command): all its AI assistant connections are revoked.
- The caps ([8.6 Limits](#claude-limites)) are counted in memory: they start again from zero when the container restarts.
- The Admin doesn't see other people's connections. In an emergency, they disable the account or reset its password. For everyone at once: remove `LISTO_MCP=on`.

Security log (never a token, a code or the content of a list; the names start with `claude.` for every assistant): `claude.connected`, `claude.refused`, `claude.revoked`, `claude.refresh`, `claude.registered`, `claude.client_refused`, `claude.tool` (one line per tool call, with the number of items, never a typed name), `claude.token_refused`, `claude.origin_refused`.

<a id="mcp-essai"></a>

### 8.15 First try

*For the person who runs the server.*

After turning it on, once, before any regular use (here with Claude):

1. In a browser: `https://listo.exemple.fr/.well-known/oauth-protected-resource/mcp` shows a short text with `"resource": "https://listo.exemple.fr/mcp"`.
2. Connect the assistant ([8.7 Connect an AI assistant](#claude-connecter)).
3. Ask the assistant ‘What are my Listo lists?’, then ‘What's on the shopping list?’: the answers must match the app. With “Read and write”: ‘Add milk to the shopping list’, ‘Check off the bread’; on a phone open on the list, the changes show up live.
4. `docker logs listo`: lines `claude.connected` and `claude.tool`, no errors. Report any `claude.origin_refused` or `claude.client_refused` lines.
5. More than an hour later, ask another question: it must work without a new authorization.
6. If there's a problem: remove `LISTO_MCP=on`, `docker compose up -d`, and pass on the `claude.` lines from the log (they contain neither tokens nor list content).

<a id="faq"></a>

## 9. FAQ and troubleshooting

<a id="faq-hors-ligne"></a>

### 9.1 I have no network

Keep going: adding, editing and checking work offline, and the badge at the top counts the pending changes ([5.17 Offline and sync](#hors-ligne)). They go out on their own when the network comes back. Sharing, the public link, the trash and reservations wait for the network.

<a id="faq-photo"></a>

### 9.2 A photo won't upload

- With no network, the photo waits for the network to come back.
- The message “Photo too large.”: the proxy refuses uploads over 2 MB ([3.4 What the proxy must do](#proxy)). With nginx or Nginx Proxy Manager, the line `client_max_body_size 5m;` is missing ([3.5 Example with Nginx Proxy Manager](#npm)).

<a id="faq-lien"></a>

### 9.3 A public link doesn't work anymore

It has expired, or its owner stopped it, or the list was deleted (restoring a list doesn't bring its link back), or the note is in the trash. Ask the owner for a new link ([7.6 Owner: the public link](#lien-public)). If it asks for a password, it's the one the owner wrote down when creating it.

<a id="faq-retard"></a>

### 9.4 Changes arrive a minute late

The proxy is holding back the real-time messages ([3.4 What the proxy must do](#proxy)). With nginx or Nginx Proxy Manager, the lines `proxy_buffering off;`, `proxy_cache off;` and `proxy_read_timeout 3600s;` are missing ([3.5 Example with Nginx Proxy Manager](#npm)).

<a id="faq-blanc"></a>

### 9.5 Blank screen or frozen app

- Close Listo and open it again with a network connection: it picks up the latest version. If the “New version available” banner stays on screen, tap “Reload”.
- Otherwise: Settings, “My account”, “Reset this phone's data” (on a computer: “Reset this device's data”); pending changes are kept.
- As a last resort, clear the site's data in the browser (Chrome: padlock to the left of the address, ‘Site settings’, ‘Delete data’; iPhone: Settings, Safari, Advanced, Website Data), then sign in again.
- Android, installed app, bottom of the screen hidden by the navigation bar: close the app completely, then open it again; otherwise uninstall it and install it again (wait for “Up to date” first, so you don't lose anything).
- Every phone is affected: the person who runs the server checks `docker logs listo` and `https://listo.exemple.fr/healthz` ([operations guide, in the repository, in French](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#depannage-serveur)).

<a id="faq-connexion"></a>

### 9.6 I can't sign in

- “Too many attempts”: 5 wrong passwords block signing in for 15 minutes. Wait, or the person who runs the server restarts Listo (`docker compose restart`).
- “Request rejected: unknown origin.”: the address you typed isn't exactly the one in `LISTO_PUBLIC_URL` (another subdomain, `http` instead of `https`) ([3.2 The folder and docker-compose.yml](#dossier)).
- Forgotten password, lost phone: [4.7 Forgotten password, lost phone](#oubli).
- Offline mode or installing on the home screen doesn't work: Listo isn't opened over HTTPS. Always go through `https://listo.exemple.fr`, never through `http://IP:13300`.

<a id="faq-double-auth"></a>

### 9.7 Two-factor authentication: locked out

- Phone changed or lost: sign in with one of your “Recovery codes” (“Use a recovery code”), then turn two-factor authentication back on with the new phone ([4.6 Two-factor authentication and recovery codes](#double-auth)).
- No phone and no recovery codes left: the Admin chooses “Disable two-factor authentication” on your account (“Administration”, “Accounts”, ⋮ button). You sign in with just your password, then turn it back on.
- It's the Admin who is locked out: see [4.8 Lost Admin account](#secours) (recovery command with `--remove-2fa`).
- The 6-digit code is always refused: the phone's clock may be wrong; set it to automatic.
- Nobody can get their codes accepted anymore after a server failure: the secret key may have been lost ([9.8 The secret key was lost](#cle-perdue)).

<a id="cle-perdue"></a>

### 9.8 The secret key was lost

*For the person who runs the server.*

Without a copy of `secrets/secret.key`, Listo creates a new key at startup. Lists, items, photos and passwords aren't affected, but:

- two-factor authentication can no longer be read: the Admin disables it for the other accounts (“Disable two-factor authentication”), for themselves with the recovery command and `--remove-2fa` ([4.8 Lost Admin account](#secours)), then everyone turns it back on;
- public links already created still work, but their address can no longer be shown again: stop them and create new ones;
- this time, keep a copy of the new key ([3.7 Keep the secret key safe](#cle)).

<a id="version"></a>

### 9.9 Knowing a new version exists

In Settings, the “About” line shows the installed version, or the “Update” badge when a newer version exists. Tap it: on the “About” page, on the version line, the Admin sees the status of the check:

- “Up to date”: the installed image is the latest one built;
- ‘Checked 15 min ago’, with a “New version” badge followed by its number (for example ‘New version: 9f8e7d6’): a newer image exists; to get it: [operations guide, in the repository, in French](https://github.com/magicgg91/listo/blob/main/docs/exploitation.md#mises-a-jour);
- “Couldn't check”: GitHub didn't answer. No consequence: Listo works normally;
- the refresh button, at the end of the line, asks again right away (once a minute at most).

It's the server (not the phone) that asks GitHub, at most once an hour, with no account or token, which is the latest commit whose image was built. Listo never updates itself. Other accounts only see the version. To turn off the check: `LISTO_UPDATE_CHECK=off` in `docker-compose.yml` (the line is already there, commented out), then `docker compose up -d`.

<a id="faq-suggestion"></a>

### 9.10 A typo keeps coming back in the suggestions

The Admin: Settings, “Administration”, “Shopping” tab, “Items”. Search for the name and “Correct”: Listo says how many items and in how many shopping lists it will be corrected, then corrects it everywhere (if it already exists, the two are merged). “Remove” only takes it out of the suggestions, without touching the lists. A corrected or removed name can come back if someone types it again.

<a id="faq-orphelin"></a>

### 9.11 Wish list: a participant has left

A relative reserved, then left the list or had their account disabled: they remain a participant. On a list created for someone else, the owner sees them and can “Remove” them, or “Release” the whole wish. On a ‘for me’ list, nobody can (the owner is the recipient and doesn't see reservations, that's on purpose): the other participants can only open or close the reservation. If the relative was only disabled, the Admin can turn their account back on long enough for them to “Leave”; otherwise, delete the wish and create it again.
