# 🎨 Src — Claude Design exports

Two exports from the same [Claude Design canvas](https://claude.ai/design/p/f739c025-7a8e-4887-b51f-469969dd236c?file=Project+Hub+v2.dc.html), downloaded at different points. The file names repeat across both folders and one pair is byte-identical, so the table below is the only reliable way to tell them apart.

| Folder | What it holds |
| :--- | :--- |
| [**Claude-Design-Doc-Hub**](Claude-Design-Doc-Hub) | The first pass. Same layout and palette, but populated with a made-up project — a `My-Library` monorepo of ten fictional repos. Useful as a look reference; the content means nothing. |
| [**Claude-Design-Doc-Hub_AI-Lab**](Claude-Design-Doc-Hub_AI-Lab) | The AI Lab version. Holds the first pass again plus `Project Hub v2.dc.html`, which is the real design — actual repo names, the four CLI runtimes, the Agents/Repos split. **This is the one [Project Hub](../Project-Hub/README.md) was built from.** |

## 📁 File by file

Inside `Claude-Design-Doc-Hub_AI-Lab/`:

| File | Size | What it is |
| :--- | ---: | :--- |
| **Project Hub v2.dc.html** | 64 KB | The design that matters. Real `Mikes_AI_Lab` structure, six views (overview, CLI runtime, folder, repo, entity, file), and the state logic behind the tree. |
| **Project Hub.dc.html** | 44 KB | The generic first pass, copied in. Byte-identical to the file of the same name in the other folder. |
| **Project Hub.standalone-src.dc.html** | 45 KB | The first pass prepped for bundling — same content, restructured for the export step. |
| **CLI Project Hub (standalone).html** | 577 KB | The bundled output of the first pass. Opens in a browser on its own, but it's a compiled React blob, so it's not readable as source. |
| **support.js** | 68 KB | Claude Design's runtime. Every `.dc.html` file needs it sitting alongside them or nothing renders. |
| **uploads/** | 61 KB | The VS Code capture pasted into the design session as the brief. Same view as [Images/Screenshots](../Images/README.md), re-encoded on paste. |
| **.thumbnail** | 4 KB | Canvas preview art. No use outside Claude Design. |

`Claude-Design-Doc-Hub/` holds only the first three of these: `.thumbnail`, `Project Hub.dc.html`, and `support.js`.

> [!IMPORTANT]
> `.dc.html` files are **not** plain HTML. They use Claude Design's template syntax — `<x-dc>`, `{{ bindings }}`, `<sc-for>`, `<sc-if>` — and a class-based logic block at the bottom. Open one in a browser without `support.js` next to it and you get a blank page. To read the design, read the markup; to run it, use the canvas.

> [!NOTE]
> Everything here also exists as `.zip` in [`../Zip/`](../Zip) — those are the untouched downloads, and `Src/` is them unpacked. Keep both or drop the zips; there's no third copy hiding anywhere.

---

<p align="center">
  <a href="../README.md">← HTML Project Design</a> ·
  <a href="../Images/README.md">Images</a> ·
  <a href="../Project-Hub/README.md">Next: Project Hub →</a>
</p>
