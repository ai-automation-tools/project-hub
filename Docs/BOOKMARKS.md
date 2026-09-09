<a id="bookmarks-top"></a>

<h1 align="center">🔖 Bookmarks &amp; Recents</h1>

<p align="center">
  <em>Two short lists above the tree, so the things you actually open are one click away.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/shipped-2026--09--09-2ea44f?style=for-the-badge" alt="Shipped 2026-09-09">
  <img src="https://img.shields.io/badge/storage-this_browser_only-8B5CF6?style=for-the-badge" alt="Stored in this browser only">
  <img src="https://img.shields.io/badge/shortcut-Ctrl%2BD-339933?style=for-the-badge" alt="Ctrl+D">
  <a href="./ROADMAP.md#p7-10-shipped--two-lists-above-the-tree"><img src="https://img.shields.io/badge/spec-P7--10-6B7280?style=for-the-badge" alt="P7-10 in the roadmap"></a>
  <a href="../README.md"><img src="https://img.shields.io/badge/↩-HTML_Project_Design-6B7280?style=for-the-badge" alt="HTML Project Design"></a>
</p>

---

The hub's sidebar shows the whole workspace, which is the point of it and also the problem:
the eight documents you actually reread live at the bottom of eight different folders. The
two lists at the top of the sidebar are the shortcut.

| | |
| :--- | :--- |
| **Bookmarks** | Things you pinned by hand. Ordered how you drag them, renameable, kept until you remove them. |
| **Recent** | The last 20 documents you opened, newest first. Maintained for you — there is nothing to configure. |

Both start **collapsed on every load**, including when they have things in them. A fresh tab
looks exactly as quiet as it did before this existed; click a header to open a list, and the
count beside it tells you what is inside without opening anything.

---

## Pinning something

Three ways, all doing the same thing, so use whichever is nearest:

| Where | How |
| :--- | :--- |
| **The document header** | The `☆ bookmark` button beside `copy Hub link`. It fills in to `★ bookmark` once the item is pinned, so the button always tells you the current state. |
| **The sidebar** | Right-click any row → **Add Bookmark**. Right-clicking a row that is already pinned reads **Remove Bookmark** instead. |
| **The keyboard** | `Ctrl+D`. |

`Ctrl+D` pins whatever the tree's keyboard cursor is on, and falls back to the open document
when the cursor is not in the tree. So you can arrow down to a file and pin it *without*
opening it. It replaces the browser's own bookmark dialog while the hub has focus, which
would only ever have bookmarked the hub itself.

Pinning something opens the Bookmarks list, so you can see where it landed.

> [!TIP]
> **Anything the tree can select can be pinned** — not just documents. A folder, a repo, a
> whole project, or the **Projects** landing page all work. Pinning the two or three repos
> you are actually working in is usually more useful than pinning their READMEs.

## Reordering, renaming, removing

| Action | How |
| :--- | :--- |
| **Reorder** | Drag a bookmark onto another one. Recent has no manual order — it is always newest first. |
| **Rename** | Double-click a bookmark's label, or right-click → **Rename Bookmark**. `Enter` commits, `Escape` cancels. |
| **Remove** | Hover a row and click the `×` on the right — it removes the row without opening it. Right-click → **Remove Bookmark** does the same. |

Renaming changes only what you see. The path underneath is untouched, so a bookmark renamed
to `Hub roadmap` still points at `ROADMAP.md` and still survives that file being moved.

**Right-click a pinned row for the same menu the tree gives you** — Copy Hub Link, Copy Path,
Copy Relative Path, Copy as Markdown Link, Open, Reveal in Explorer, Open in VS Code — plus
**Remove Bookmark** and, on a bookmark, **Rename Bookmark**. Right-clicking a row in **Recent**
offers **Add Bookmark**, which is the quickest way to promote something you have been going
back to.

On a pin whose file has gone missing, the launch actions are greyed out — but the copy actions
stay live, because the last known path is exactly what you want when you go looking for it.

## Telling similar rows apart

Every row carries, in small dim text on the right, **what it belongs to**:

- inside a repo → **the repo's name**
- anywhere else → **the project or shared root** it lives under (`Finance_Workspace`, `Documents`, `Pictures`, …)

That is usually all it takes. Three folders all called `Agents` are three different projects,
and the list says so without you opening anything:

```text
Agents                              Finance_Workspace
Agents                              Identity_Workspace
Agents                              Example_Workspace
```

When that still isn't enough — two documents with the same name *inside the same repo* — the
name itself picks up its parent folder as well:

```text
setup/README.md                  AI-Trading-Bot
design/README.md                 AI-Trading-Bot
```

Only rows that actually need the extra folder get it, so a bookmark you renamed to something
unique stays clean. The full path is always in the tooltip if you want to be certain.

## When a pinned file moves or disappears

Bookmarks outlive the files they point at, and the hub is rescanning constantly anyway, so it
checks. After a scan in which a pinned path is missing, the row is **dimmed and struck
through**, and its tooltip reads *not found in the last scan*.

**It is never deleted for you.** A folder that is briefly unreadable — a drive reconnecting, a
sync in progress — would otherwise silently eat your pins. A dim row you can see is better
than a row that vanished, and it un-dims by itself on the next scan if the file comes back.

If exactly one file with the same name turned up elsewhere in the same root, a **relink**
offer appears under the row naming where it went:

```text
✕  pin-probe.md
   moved? relink to Projects/Example_Workspace/…/p7-10-smoke/b/pin-probe.md
```

Click it and the bookmark repoints. Nothing is ever repointed automatically, and if there is
no single obvious candidate you get no offer — just the dim row and the `×` to remove it.

**Photos are the one exception.** The Pictures library loads on demand, so a bookmarked image
is legitimately absent from the scan until its folder has been opened. Those are not called
dead links.

## Where the lists live

`localStorage`, in the browser you are looking at. Which means:

- They **survive** closing the tab, restarting the browser, and restarting the hub itself.
- They are **per-browser and per-machine**. Chrome and Edge do not share them, and neither
  does another PC. There is no sync and no account — the hub has no per-user server state,
  and this feature deliberately did not introduce any.
- Only **paths and labels** are stored. No document contents, ever.
- Clearing site data for `127.0.0.1:4273` clears both lists.

Recent is capped at 20 and deduplicated by path, so reopening a document moves it to the top
rather than adding a second row. Opening a *folder* does not count as reading a document, so
folders you pass through on the way somewhere do not fill the list up.

> [!TIP]
> **To move a pin to another machine, use a Hub link instead.** Right-click → **Copy Hub
> Link** gives a stable URL you can paste anywhere — a note, a chat, another browser — and
> pin on the other side. Since searches have their own URLs too, that works for a set of
> search results as well.

## What this deliberately does not do

No sync, no server component, no export or import, no folders inside bookmarks, no tags, and
no settings. Saved views — a named combination of search, filter and scope — are a separate
backlog item ([P7-20](./ROADMAP.md#p7-review)), not something bookmarks will grow into.

---

<p align="center">
  <a href="#bookmarks-top">↑ top</a> ·
  <a href="./ROADMAP.md">Roadmap</a> ·
  <a href="../Hub/README.md">Hub source</a> ·
  <a href="../README.md">HTML Project Design</a>
</p>
