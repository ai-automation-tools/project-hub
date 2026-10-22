# 0001 — One service, not two

**Status:** accepted · **Date:** 2026-03-11

## Context

The export path and the read path have different shapes: one is bursty and slow, the
other is constant and fast. The obvious move is to split them.

## Decision

Keep them in one service. Isolate the export path with a bounded worker pool inside the
process instead of a network boundary outside it.

## Consequences

A slow export can still starve reads if the pool is sized wrong — that is the risk we
accepted, and the pool size is the knob. Revisit if reads ever miss their latency budget
for a reason traced to exports.
