# Dependency audit

Quarterly. studio-kit ships inside three apps, so a dependency here is a dependency
everywhere.

| Package | Why it is here | Last reviewed |
|:---|:---|:---|
| `color-convert` | Token build: hex to OKLCH | 2026-10 |
| `fast-glob` | Token build: finds the source files | 2026-10 |

That is the whole runtime list. Everything else is a dev dependency of the build.

## The rule

A new runtime dependency needs a sentence in this table saying why a dozen lines of our
own code would not do. Two proposals in the last year did not survive writing that
sentence.
