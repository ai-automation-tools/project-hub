# Organizing Claude Code and Codex CLI Projects with Markdown and HTML Artifacts

## Overview

A useful pattern is emerging among developers using CLI coding agents
such as **Claude Code** and **OpenAI Codex**: keep the project's
agent-facing knowledge and instructions in Markdown, while using HTML
for richer human-facing artifacts.

The recommended approach is therefore **not to replace Markdown with
HTML entirely**. Instead, use a hybrid model:

-   **Markdown** for agent instructions, durable project knowledge,
    requirements, architecture notes, ADRs, plans, and other information
    the agents need to search, edit, diff, and reason over.
-   **HTML** for human-facing artifacts such as dashboards, architecture
    visualizations, implementation plans, research comparisons, status
    reports, design reviews, timelines, dependency maps, and interactive
    decision matrices.

This gives Claude Code and Codex clean textual context while allowing
important project information to be presented in a much richer format
for humans.

------------------------------------------------------------------------

## Recommended Architecture

A good Windows CLI project could be organized like this:

``` text
MyProject/
│
├── AGENTS.md                 # Codex instructions
├── CLAUDE.md                 # Claude Code instructions
├── README.md
├── ARCHITECTURE.md
│
├── docs/
│   ├── index.md
│   │
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── decisions.md
│   │   └── data-flow.md
│   │
│   ├── product/
│   │   ├── requirements.md
│   │   ├── roadmap.md
│   │   └── backlog.md
│   │
│   ├── engineering/
│   ├── research/
│   ├── decisions/
│   │   └── ADR-001-example.md
│   │
│   └── plans/
│       ├── active/
│       ├── completed/
│       └── archive/
│
├── artifacts/
│   ├── index.html
│   │
│   ├── dashboards/
│   ├── architecture/
│   │   ├── system-overview.html
│   │   └── dependency-map.html
│   │
│   ├── planning/
│   │   ├── roadmap.html
│   │   └── implementation-plan.html
│   │
│   ├── reports/
│   │   ├── code-review.html
│   │   └── project-status.html
│   │
│   ├── comparisons/
│   ├── reviews/
│   └── research/
│       └── competitor-comparison.html
│
├── .claude/
│   ├── settings.json
│   └── skills/
│
├── .codex/
│   └── skills/
│
├── scripts/
├── tests/
└── src/
```

The key distinction is:

> **`docs/` = source of truth**\
> **`artifacts/` = rendered, visual, or interactive presentation**

This prevents a repository from becoming hundreds of attractive HTML
files that are harder for coding agents to search, modify, diff, and
reason about.

------------------------------------------------------------------------

# What Should Stay in Markdown?

Keep core agent-facing material in Markdown.

Examples:

``` text
AGENTS.md
CLAUDE.md
README.md
ARCHITECTURE.md
SKILL.md
```

Markdown is also generally preferable for:

-   Coding standards
-   Agent operating instructions
-   Requirements
-   API documentation
-   Architecture descriptions
-   ADRs
-   Implementation notes
-   Backlogs
-   Execution plans
-   Project memory
-   Security rules
-   Testing procedures
-   Research source material
-   Technical specifications

Codex's normal project-instruction system is built around `AGENTS.md`,
while Claude Code uses Markdown-based project instructions and skills.

HTML should therefore complement these files rather than replace them.

------------------------------------------------------------------------

# What Should Become HTML?

HTML is especially valuable when information needs to be **understood
visually rather than merely read sequentially**.

Good HTML artifact candidates include:

-   Architecture dashboards
-   Architecture diagrams
-   Project dashboards
-   Implementation plans
-   Roadmaps
-   Dependency maps
-   Research comparisons
-   Competitive analyses
-   Code review reports
-   Security review reports
-   Performance reports
-   Status reports
-   Timelines
-   Decision matrices
-   Interactive tables
-   Prototype interfaces
-   Design reviews
-   Project health dashboards
-   Test-result dashboards
-   Agent workflow visualizations

HTML can support:

-   Collapsible sections
-   Tabs
-   Filters
-   Search
-   Sortable tables
-   Mermaid diagrams
-   Dependency trees
-   Status badges
-   Progress bars
-   Architecture diagrams
-   Copy buttons
-   Dark/light mode
-   Navigation
-   Timelines
-   Interactive controls

------------------------------------------------------------------------

# Recommended HTML Project Dashboard

One particularly useful pattern is making:

``` text
artifacts/index.html
```

the project's visual control center.

Conceptually, it could look like:

``` text
MyProject
──────────────────────────────────────────────

Project Status       Architecture       Planning
████████ 72%         [View Diagram]     [Roadmap]

Active Work
──────────────────────────────────────────────
Authentication rewrite                 In Progress
Plugin architecture                    Planning
API v2                                 Backlog

Documentation
──────────────────────────────────────────────
Architecture
Product Requirements
Technical Decisions
Security Model

Reports
──────────────────────────────────────────────
Latest Code Review
Dependency Analysis
Security Review
Performance Report
```

Claude Code or Codex could regenerate this dashboard whenever
significant project changes occur.

This is an area where HTML can be substantially more useful than
Markdown.

------------------------------------------------------------------------

# Why HTML Is Becoming Popular for AI-Generated Artifacts

Markdown generally forces information into a vertical document flow:

``` text
Heading
Paragraph
Table
Paragraph
Code
Paragraph
Table
```

HTML allows an agent to represent relationships spatially.

For example, instead of a simple Markdown comparison table:

``` markdown
| Option | Cost | Speed | Risk |
|---|---|---|---|
| A | Low | High | Medium |
| B | High | Medium | Low |
```

an HTML artifact could provide something like:

``` text
┌───────────────────────────────────────────────┐
│               Architecture Options           │
├───────────────┬───────────────┬───────────────┤
│ Option A      │ Option B      │ Option C      │
│               │               │               │
│ Cost          │ Cost          │ Cost          │
│ Risk          │ Risk          │ Risk          │
│ Complexity    │ Complexity    │ Complexity    │
│               │               │               │
│ [Details ▼]   │ [Details ▼]   │ [Details ▼]   │
└───────────────┴───────────────┴───────────────┘
```

The HTML version can add expandable explanations, filters, diagrams,
tooltips, links, and other interactive elements.

This makes HTML particularly useful when an AI agent is creating an
**artifact for a human**, rather than context primarily intended for
another AI agent.

------------------------------------------------------------------------

# Skills and Projects Worth Investigating

## 1. html-artifacts

**Repository:**\
https://github.com/dogum/html-artifacts

This project is very close to the Markdown/HTML hybrid concept.

Its purpose is to teach an agent to produce self-contained HTML
artifacts **when the task warrants it**, rather than automatically
turning everything into HTML.

Potential use cases include:

-   Comparisons
-   Plans
-   Code reviews
-   Explainers
-   Status reports
-   Interactive editors

A Claude Code skill could typically live under:

``` text
~/.claude/skills/html-artifacts/
```

On Windows, this normally corresponds to something similar to:

``` text
C:\Users\<username>\.claude\skills\html-artifacts\
```

### Recommendation

**Strong candidate.** The philosophy fits the hybrid project structure
particularly well.

------------------------------------------------------------------------

## 2. HTML Artifact Best Practices

**Repository:**\
https://github.com/ClawEnable/html-artifact-best-practices

This project is particularly interesting because its documentation
describes use with both **Claude Code and Codex CLI**.

It provides guidance for:

-   Deciding when HTML is appropriate
-   Creating standalone HTML
-   Reviewing HTML artifacts
-   Improving existing artifacts
-   Responsive layouts
-   Keyboard/focus accessibility
-   Print formatting
-   Copyable content
-   Artifact validation

Its deliberately simple approach is also attractive:

``` text
Vanilla HTML
No frameworks
No CDN
No build chain
```

That means an artifact can remain a single portable file rather than
requiring a React project, dependency installation, or build pipeline.

Example Claude Code installation documented by the project:

``` bash
/plugin marketplace add ClawEnable/html-artifact-best-practices
/plugin install html-artifact-guide@clawenable
```

Example Codex installation:

``` bash
npx skills add ClawEnable/html-artifact-best-practices
```

### Recommendation

**Start here.** This is one of the strongest candidates for establishing
consistent HTML artifact standards.

------------------------------------------------------------------------

## 3. HTML Artifact Craft

**Repository:**\
https://github.com/leoriczhao/html-artifact-craft

This project is designed around choosing between Markdown and HTML
according to the type of work being performed.

Examples include:

``` text
compare
explain
review
prototype
edit
tune
share
```

A project-local Claude skill could use:

``` text
.claude/
└── skills/
    └── html-artifact-craft/
        └── SKILL.md
```

A Codex skill can live under a corresponding Codex skills directory such
as:

``` text
~/.codex/skills/html-artifact-craft/
```

### Recommendation

Useful if you want Claude Code and Codex to follow the **same
artifact-generation methodology**.

------------------------------------------------------------------------

## 4. html-anything

**Repository:**\
https://github.com/clockless-org/html-anything

This project goes beyond ordinary project documentation.

It can transform source material such as:

``` text
CSV
PDF
logs
source directories
transcripts
data exports
reports
Markdown
```

into interactive, single-file HTML documents.

It supports a range of agent environments, including Claude Code and
Codex.

Example installation:

``` bash
npx skills add clockless-org/html-anything
```

### Recommendation

Think of this primarily as a **document/report generation skill** rather
than the central project-organization system.

It could be very useful for automatically generated reports and
analysis.

------------------------------------------------------------------------

## 5. AgentUse Artifacts

**Repository:**\
https://github.com/agentuse/artifacts

This project provides an artifact-oriented convention and viewer.

A repository might contain something similar to:

``` text
.agentuse/
└── artifacts/
    ├── report/
    │   └── index.html
    ├── architecture/
    │   └── index.html
    └── research/
        └── index.md
```

It supports multiple coding-agent environments.

### Recommendation

Potentially useful for repositories where agents generate **large
numbers of reports, research documents, planning outputs, and other
artifacts**.

------------------------------------------------------------------------

## 6. Redline

**Repository:**\
https://github.com/umangjaipuria/redline

Redline takes the HTML artifact idea in a particularly interesting
direction.

Instead of treating HTML as a static report, it can be used as a
collaboration interface between the developer and coding agent.

A user can open an AI-generated HTML document locally and:

-   Highlight text
-   Leave a comment
-   Ask a question
-   Request a change
-   Reply to comments

Claude Code or Codex can then read the feedback and modify the artifact.

Conceptually, this provides something resembling:

``` text
Google Docs-style review
+
Git
+
Claude/Codex
```

while remaining local and repository-friendly.

### Recommendation

**Very interesting add-on**, especially for architecture documents,
implementation plans, design reviews, and requirements documents that
need iterative human review.

------------------------------------------------------------------------

# Suggested Starting Projects

A good evaluation order would be:

  -------------------------------------------------------------------------------------------
  Project                                     Purpose                 Recommendation
  ------------------------------------------- ----------------------- -----------------------
  `ClawEnable/html-artifact-best-practices`   Standards for           **Start here**
                                              high-quality HTML       
                                              artifacts               

  `dogum/html-artifacts`                      Teaches agents when     **Strongly consider**
                                              HTML is preferable to   
                                              Markdown                

  `umangjaipuria/redline`                     Human ↔ agent review of **Interesting add-on**
                                              HTML documents          

  `leoriczhao/html-artifact-craft`            Shared artifact         Worth testing
                                              methodology             

  `clockless-org/html-anything`               Interactive HTML report Useful specialized tool
                                              generation              

  `agentuse/artifacts`                        Artifact                Useful for
                                              management/viewing      artifact-heavy repos
                                              convention              
  -------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# A Useful OpenAI Project-Organization Pattern

OpenAI has discussed an approach where a large `AGENTS.md` is avoided in
favor of a relatively concise agent guide that acts as a map into a
structured repository knowledge base.

A conceptual structure looks like:

``` text
AGENTS.md
ARCHITECTURE.md

docs/
├── design-docs/
│   ├── index.md
│   ├── core-beliefs.md
│   └── ...
│
├── exec-plans/
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
│
├── generated/
│   └── db-schema.md
│
└── product-specs/
    ├── index.md
    └── ...
```

The important idea is that `AGENTS.md` does **not** have to contain all
project knowledge.

Instead, it tells the agent:

-   What the repository is
-   How it should operate
-   Where important information lives
-   Which documents are authoritative
-   Which development rules must be followed
-   Where plans, architecture, specifications, and decisions can be
    found

This reduces giant instruction files and makes the project's knowledge
easier to maintain.

The same principle can be extended with an HTML presentation layer:

``` text
docs/        ← AI-readable knowledge
artifacts/   ← human-readable/interactive representation
```

------------------------------------------------------------------------

# Recommended Final Structure for Claude Code + Codex

``` text
PROJECT/
│
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── ARCHITECTURE.md
│
├── docs/
│   ├── index.md
│   │
│   ├── product/
│   ├── architecture/
│   ├── engineering/
│   ├── research/
│   │
│   ├── decisions/
│   │   └── ADR-001-*.md
│   │
│   └── plans/
│       ├── active/
│       ├── completed/
│       └── backlog/
│
├── artifacts/
│   ├── index.html
│   │
│   ├── dashboards/
│   ├── architecture/
│   ├── comparisons/
│   ├── reports/
│   └── reviews/
│
├── .claude/
│   ├── settings.json
│   └── skills/
│
├── .codex/
│   └── skills/
│
├── scripts/
├── tests/
└── src/
```

------------------------------------------------------------------------

# Recommended Operating Model

A simple rule for both Claude Code and Codex can be:

### Markdown = Knowledge

Use Markdown when the artifact primarily exists so that:

-   An agent can understand it
-   An agent will need to modify it frequently
-   Git diffs are important
-   It represents authoritative project knowledge
-   It contains instructions
-   It contains requirements or specifications

### HTML = Presentation

Use HTML when the artifact primarily exists so that:

-   A human needs to understand complex information quickly
-   Relationships benefit from visual presentation
-   Information needs filtering or sorting
-   Multiple information dimensions need to be shown simultaneously
-   Diagrams are important
-   Interactivity adds value
-   The output is a report, dashboard, review, or presentation

------------------------------------------------------------------------

# What Not to Do

Avoid replacing the core agent instruction files with HTML.

For example, this is generally **not recommended**:

``` text
AGENTS.html
CLAUDE.html
requirements.html
coding-rules.html
api-rules.html
memory.html
```

Instead, retain the native Markdown conventions:

``` text
AGENTS.md
CLAUDE.md
SKILL.md
README.md
```

and generate HTML artifacts from or alongside the underlying Markdown
knowledge.

------------------------------------------------------------------------

# Practical Recommendation

For a Windows development environment using both Claude Code and Codex
CLI, the strongest overall model is:

> **Markdown as the agent knowledge layer + HTML as the human artifact
> layer.**

Start with:

1.  `html-artifact-best-practices`
2.  `html-artifacts`
3.  Optionally add `Redline` for human/agent review workflows.

Then establish a repository convention where:

``` text
docs/
```

contains authoritative project knowledge and:

``` text
artifacts/
```

contains richer visual representations.

The project's `AGENTS.md` and `CLAUDE.md` files should explain this
convention so both coding agents understand which format to use and
where generated material belongs.

Over time, `artifacts/index.html` can evolve into a **project control
center** containing links to architecture, active work, plans, status,
reports, research, and other important project information.

------------------------------------------------------------------------

# References

-   OpenAI --- How OpenAI uses Codex:\
    https://openai.com/business/guides-and-resources/how-openai-uses-codex/

-   OpenAI --- Harness engineering:\
    https://openai.com/index/harness-engineering/

-   OpenAI --- Codex agent loop / AGENTS.md discussion:\
    https://openai.com/index/unrolling-the-codex-agent-loop/

-   html-artifacts:\
    https://github.com/dogum/html-artifacts

-   HTML Artifact Best Practices:\
    https://github.com/ClawEnable/html-artifact-best-practices

-   HTML Artifact Craft:\
    https://github.com/leoriczhao/html-artifact-craft

-   html-anything:\
    https://github.com/clockless-org/html-anything

-   AgentUse Artifacts:\
    https://github.com/agentuse/artifacts

-   Redline:\
    https://github.com/umangjaipuria/redline
