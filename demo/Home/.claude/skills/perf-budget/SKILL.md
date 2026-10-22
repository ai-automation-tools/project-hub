---
name: perf-budget
description: Measure a page or endpoint against a written budget and report only the rows that moved, with the one change most likely to bring them back.
---

# Perf budget

A budget nobody measures is a wish. This measures, compares, and stops.

## Report

Only rows that changed since the last run. An unchanged row in a report trains people to
skim, and skimming a perf report is how a regression ships.

## One recommendation

Name the single largest contributor and the one change that addresses it. A list of six
optimisations gets read as a backlog and actioned as nothing.
