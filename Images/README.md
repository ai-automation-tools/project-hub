# 🖼️ Images — design screenshots

What the design looked like before anything was built. These were the reference for [Project Hub](../Project-Hub/README.md), so if the running app and these ever disagree, the app is right and these are history.

| Folder | What's inside |
| :--- | :--- |
| [**AI-Lab-Design**](AI-Lab-Design) | Four captures of the real design — the overview, the Agents section expanded, the Repos section expanded, and the sidebar collapsed. The version that got built. |
| [**Original-Design**](Original-Design) | One capture of the generic first pass, built around a fictional `My-Library` monorepo. Same visual language, invented content. |
| [**Screenshots**](Screenshots) | The input, not the output — a VS Code explorer capture of the real `Mikes_AI_Lab` and `Documents` trees, pasted into the design session as the brief. |

## 🗂️ Frame by frame

| Image | Shows |
| :--- | :--- |
| [**Home-Page-Design_AI-Lab.png**](AI-Lab-Design/Home-Page-Design_AI-Lab.png) | The overview: stat strip, a card per CLI runtime, and the repo table with branch and git state per row. |
| [**…_Agents-Expanded.png**](AI-Lab-Design/Home-Page-Design_AI-Lab_Agents-Expanded.png) | The Agents section open in the tree, with the four runtimes as cards. |
| [**…_Repos-Expanded.png**](AI-Lab-Design/Home-Page-Design_AI-Lab_Repos-Expanded.png) | A repo page — rendered README on the left, git panel and file list on the right. |
| [**…_Collapsed.png**](AI-Lab-Design/Home-Page-Design_AI-Lab_Collapsed.png) | The same overview with the sidebar collapsed. |
| [**Home-Page-Design.png**](Original-Design/Home-Page-Design.png) | The first pass. Note the left rail groups by Skills/Commands/Agents rather than mirroring the folder tree — that changed in v2. |
| [**Example-Project-Folders.png**](Screenshots/Example-Project-Folders.png) | The VS Code tree that seeded it all: `Agents/` with its four runtimes, `Repos/` split into Draft, Live_Apps, Other_Apps, Tools, and the `Documents` vault below. |

## 🎨 Palette, read off the design

The build pulled these straight from the exported markup rather than eyeballing the screenshots.

| Role | Value |
| :--- | :--- |
| Page background | `#0a0c0e` |
| Panel / card | `#0c0f12` · `#0e1114` |
| Borders | `#22272e` · `#1a1f25` |
| Accent (skills, live) | `#5fe3a1` |
| Commands | `#e0a458` |
| Sub-agents | `#b48ce8` |
| Hooks / branches | `#6aa9f0` |
| Conflict / Documents root | `#e06c75` |
| Type | IBM Plex Mono, IBM Plex Sans |

> [!NOTE]
> The design's left rail expands into every repo. The build stops at the `.git` boundary and shows repo contents on the repo page instead — descending into all twenty repos meant walking 320,000 paths. That difference is deliberate, and it's the main place the screenshots and the running app diverge.

---

<p align="center">
  <a href="../README.md">← HTML Project Design</a> ·
  <a href="../Src/README.md">Src</a> ·
  <a href="../Project-Hub/README.md">Project Hub →</a>
</p>
