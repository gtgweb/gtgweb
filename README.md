# gtgWeb

*🇫🇷 [Version française](README.fr.md)*

**Getting Things GNOME — in your browser.**

> Manage your GTG tasks from anywhere. No account. No third-party cloud. No compromise.

---

## The problem

[Getting Things GNOME](https://getting-things-gnome.github.io) is one of the most capable task managers in free software. Nested subtasks, hierarchical tags, semantic dates, a note-style editor with inline parsing — GTG has a philosophy and a depth that few tools match.

But GTG is locked to the Linux desktop.

From a phone, a browser at work, a shared computer — your tasks are out of reach. Mobile alternatives (Tasks.org, jtx Board) force compromises on the GTG data model. **There is no modern, free, self-hostable web interface for GTG. This gap has existed since 2013.**

gtgWeb fills that gap.

---

## What gtgWeb does

```
✓  Authentic GTG interface in the browser
✓  Direct connection to your CalDAV server (Nextcloud, Radicale, Baikal...)
✓  Note-style editor with inline parsing — @tags, - subtasks, just like GTG desktop
✓  Continuous saving — no Save button, just like GTG
✓  Semantic dates — Now, Soon, Someday, or a specific date
✓  Actionable view — what you can do right now, nothing else
✓  One task = one URL — history, bookmarks, shareable links
✓  PIN unlock — no password to retype
✓  Installable PWA — home screen icon
✓  Your data stays on your server. Always.
```

### One task = one URL

Every task has its own address (`#/task/<id>`). The browser's Back button works, a task
can be bookmarked, opened in a new tab, shared as a link. This is the "wiki of tasks"
model: something GTG desktop cannot offer, and what gtgWeb adds on top.

### Your edits do not get lost

Typing is saved continuously, with a local draft as a safety net. Network dropped, tab
closed by accident, battery dead: on reopening, gtgWeb flags the draft and lets you choose
between your version and the server's. Nothing is ever overwritten without your say-so.

### Your password is never stored in the clear

PIN unlock encrypts your CalDAV password (AES-GCM, key derived from the PIN via PBKDF2)
and only ever writes the encrypted form to disk. The PIN itself is stored nowhere.

---

## What gtgWeb is not

```
✗  A cloud service — no account, no central gtgWeb server
✗  A Tasks.org clone — a GTG web interface, not a generic CalDAV client
✗  A complex deployment — FTP is enough
```

---

## Install in 10 minutes

### Requirements

- A CalDAV server (Nextcloud, Radicale, Baikal, or other)
- Web hosting with PHP 7.4+ and HTTPS
- An FTP client

### Deployment

```bash
# 1. Download the latest release
#    → GitHub Releases: github.com/gtgweb/gtgweb/releases

# 2. Upload the files to your hosting via FTP
#    (at the root or in a subfolder)

# 3. Create a subdomain (e.g. gtg.yourdomain.tld)
#    pointing to the uploaded folder

# 4. Open gtg.yourdomain.tld in your browser

# 5. Enter your CalDAV URL + credentials
#    → That's it.
```

### Recommended CalDAV setup

Use an **application password** (Nextcloud → Settings → Security) instead of your main password. It can be revoked at any time.

### If your CalDAV server blocks cross-origin requests (CORS)

This is the case for most shared-hosting Nextcloud setups. gtgWeb detects the problem automatically and offers to configure the bundled PHP proxy. **No command line required** — the proxy ships in the package, you drop it in via FTP.

→ [PHP proxy documentation](docs/proxy.md)
→ [Installation guide](docs/installation.md) (French)
→ [Finding your CalDAV URL](docs/caldav-urls.md) (French)

---

## Architecture

```
Browser (gtgWeb PWA)
    ↕ fetch — same origin
proxy.php (optional — PHP hosting)
    ↕ HTTPS — standard CalDAV
Your CalDAV server
```

**Vanilla JS. Zero dependencies. Zero frameworks. Zero database.**

gtgWeb is plain HTML, CSS and JavaScript. No `node_modules`. No build step. You read the source — you understand what it does.

→ [Detailed architecture](docs/05-technique.md)

---

## Compatibility

gtgWeb speaks GTG's CalDAV dialect: subtasks via `RELATED-TO`, semantic dates via the
`GTGFUZZY` parameter. Two-way sync is verified against **GTG desktop 0.6 and 0.7**.

| CalDAV server | Support |
|---|---|
| Nextcloud | ✅ Tested |
| Radicale | ✅ Compatible |
| Baikal | ✅ Compatible |
| Apple iCloud | 🔵 Untested |
| Google Calendar | ❌ No CalDAV VTODO |

| Browser | Support |
|---|---|
| Firefox 90+ | ✅ |
| Chromium / Chrome 90+ | ✅ |
| Safari 15+ | ✅ |
| Firefox Android | ✅ |
| Chrome Android | ✅ |

---

## Roadmap

### 🟢 v1 — In progress
- Full GTG interface (Open / Actionable / Closed), GTG-style sorting
- Note-style editor with inline parsing, header modelled on GTG
- Continuous saving and local drafts
- Semantic dates
- One task = one URL
- PIN unlock
- PHP proxy for shared hosting
- Installable PWA

### 🔵 v2 — Planned
- Multiple calendars and sharing between users
- Reminders (VALARM) and recurrence (RRULE)
- Full offline mode
- GTG desktop plugin — syncs tag colors and icons
- Multiple profiles (several CalDAV servers)
- Contact popup from detected emails/phone numbers

### 🟣 v3+ — Vision
- Standalone gtgWeb — usable without GTG desktop if desired
- VJOURNAL support (notes)

---

## Contributing

gtgWeb is a community project. It was born from a real need and a conviction: **free productivity tools deserve a proper web interface.**

The code is deliberately simple — Vanilla JS readable by any web developer. No framework knowledge needed to contribute.

### Where to start

```
docs/          → full project documentation (French, translations welcome)
js/            → modular JavaScript source
issues/        → bugs and suggestions
discussions/   → ideas and questions
```

→ [Contribution guide](CONTRIBUTING.md)
→ [Project vision](docs/01-vision.md)
→ [Data model](docs/03-modele-donnees.md)
→ [Functional specification](docs/04-fonctionnel.md)

**Repositories:**
- Source code → [github.com/gtgweb/gtgweb](https://github.com/gtgweb/gtgweb)
- Website → [gtgweb.github.io](https://gtgweb.github.io)

### What the project needs

- 🧪 **Testers** — on different CalDAV servers and browsers
- 🎨 **Designers** — a GTG-like interface deserves care
- 🐍 **Python developers** — for the GTG desktop plugin (v2)
- 📝 **Writers** — user guides, translations

---

## License

gtgWeb is released under the **GPL v3** license.

Like GTG desktop. Like free software.

---

## Acknowledgements

- The [Getting Things GNOME](https://github.com/getting-things-gnome/gtg) team for a remarkable tool
- The GTD and GTG community for 15 years of contributions
- [jaesivsm](https://github.com/jaesivsm) for the GTG desktop CalDAV backend

---

*gtgWeb is an independent project, not officially affiliated with the GTG project.*
