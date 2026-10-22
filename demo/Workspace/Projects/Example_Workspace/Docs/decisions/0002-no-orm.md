# 0002 — Hand-written SQL

**Status:** accepted · **Date:** 2026-04-02

## Context

Three of the five slowest queries in the previous system were ORM-generated and nobody
could read them well enough to fix them.

## Decision

Hand-written SQL in `db/queries/`, one file per query, each with the `EXPLAIN` output it
was tuned against pasted underneath.

## Consequences

More typing. Every slow query has an owner and a baseline. Schema changes touch more
files, which is the cost, and it is visible in review rather than hidden in a mapper.
