Version française : [README.fr.md](README.fr.md)

# Listo

**Listo is an app for shared lists (shopping, tasks, gift ideas), designed for the phone, that you install on your own server.** Free, ad-free, in French and English, for a family or a small group of close friends.

## The essentials

- **Lists shared live**: an item checked on one phone is checked on the others within seconds; each person has their own right, “Can edit” or “Read only”.
- **Three types of list**: shopping (sorted by aisle, or by store for a round of shops), tasks (priority, due date, repeat, assignment) and wishes (reserving and chipping in, without the person being spoiled knowing).
- **Quick entry**: several items at once, quantity read from the name, barcode scanning, photos.
- **Offline**: Listo opens and works without a network; everything is sent when the network comes back.
- **On a computer** (window at least 1,024 px wide): two areas (list menu, open list), item details and sharing in a panel, keyboard shortcuts (“?” lists them; they can be turned off) and Ctrl+Z to undo a deletion, a check or an edit. On the phone, nothing changes.
- **Public link** to show a list to someone without an account, **trash** kept for 30 days; **AI assistants** that follow the MCP standard (for example Claude, by Anthropic) can read your lists and, if you allow it, write to them, with two levels of permission, always after you approve on an “Authorize an AI assistant” screen, and without ever deleting anything.
- **Notifications**, optional and off by default: other people's changes (grouped, plus tasks assigned to you), reservations, sharing and a due-date summary every morning, on the phone or the computer.
- **Security**: two-factor authentication, nightly backup, rights checked by the server. **A single numbered guide**, the same in the app (Settings › Help), online at **<https://magicgg91.github.io/listo/>** (in French: <https://magicgg91.github.io/listo/fr/>) and in the repository: [docs/guide.en.md](docs/guide.en.md).

## Screenshots

| ![“My lists”: type filter, four lists with their icon and the count of remaining items, bottom bar](docs/images/accueil.png) | ![Shopping list sorted by aisle, with quantities and a photo](docs/images/liste-courses.png) | ![Checked items, struck through, grouped at the bottom in “In the cart”](docs/images/liste-courses-cochee.png) | ![Task list with priority and due date](docs/images/liste-taches.png) | ![“Due”: the tasks to do from every list, overdue, today, tomorrow, this week, later](docs/images/echeances.png) |
| :---: | :---: | :---: | :---: | :---: |
| My lists | Shopping by aisle | “In the cart” | Tasks | “Due” |
| ![Wish list seen by the person giving: price, priority, reservation, chipping in](docs/images/liste-envies.png) | ![Scan mode: the product found from its barcode](docs/images/mode-scan.png) | ![Public page of a list, read only, opened without an account](docs/images/page-publique.png) | ![“AI assistants” screen: address to enter and authorized connection](docs/images/connexions-claude.png) | ![Settings screen](docs/images/reglages.png) |
| Wishes, reservations | Scan mode | Public link | “AI assistants” | Settings |

*Demo instance, made-up data, interface in French.*

## Installation in three commands

You need a Linux server with Docker, a domain name, and an HTTPS reverse proxy, any one will do (Nginx Proxy Manager, Caddy, Traefik, nginx, Apache…).

```sh
mkdir -p /opt/listo && cd /opt/listo     # then copy docker-compose.yml there and adjust it
docker compose up -d                     # downloads and starts Listo
docker logs listo                        # shows the setup code for the first Admin
```

The full step-by-step (settings, what the proxy must do with an example for Nginx Proxy Manager, secret key, checks) is in the guide, [Installation chapter](docs/guide.en.md#installation). Backups: [guide](docs/guide.en.md#sauvegardes). Restore, updates and server troubleshooting: the operations guide, [docs/exploitation.md](docs/exploitation.md) (in French).

## Limits

- **No data sent anywhere other than your server**, except for three exceptions that can be turned off: the check for a new version (GitHub), the name of a scanned product (Open Food Facts) and **push notifications**, off by default (`LISTO_PUSH=on` turns them on; end-to-end encrypted content, but Apple, Google, Mozilla or Microsoft see the time, the size of the message and the receiving device). If you connect an AI assistant such as Claude (`LISTO_MCP=on`; `LISTO_MCP_SITES` can limit which assistant websites are accepted), the lists you allowed are sent to it when you ask it something. Optional sign-in through your own OpenID Connect identity provider, for example Authelia, Authentik or Pocket ID (`LISTO_OIDC=on`, [guide](docs/guide.en.md#sso-serveur)). In French and English, no payment; notifications on iPhone and iPad: iOS 16.4 or later, with Listo installed on the home screen ([Notifications chapter](docs/guide.en.md#notifications)).

## Useful links

- [The online guide](https://magicgg91.github.io/listo/) ([in French](https://magicgg91.github.io/listo/fr/)), or [docs/guide.en.md](docs/guide.en.md) in the repository (in French: [docs/guide.md](docs/guide.md)): for everyone.
- [docs/cahier-des-charges.md](docs/cahier-des-charges.md) (in French): features, rights, data model, security, decisions.
- [docs/developpement.md](docs/developpement.md) (in French): code organization, tests, checks on phones.
- [docs/mcp-cadrage.md](docs/mcp-cadrage.md) (in French): the design of access for AI assistants (MCP); [design/README.md](design/README.md): the design kit.

## Security

Listo's port is only published on the local network; only the HTTPS proxy must be able to reach it. Hashed passwords, protected cookies, lockout after 5 attempts, strict content security policy. To report a vulnerability, privately: [SECURITY.md](SECURITY.md).

## Licence and credits

- **Apache-2.0** licence, © magicgg91: [LICENSE](LICENSE). If you reuse it, keep [NOTICE](NOTICE) and the author credit. Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).
- Barcode reader: [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT and Apache-2.0). Product names: [Open Food Facts](https://world.openfoodfacts.org) (ODbL).
- Developed with the help of Claude (Anthropic).
