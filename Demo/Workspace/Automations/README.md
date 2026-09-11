# Automations

Scheduled jobs that are not owned by any one repo. Each one is a script, a schedule, and
a note saying what breaks if it stops running.

| Job | Schedule | If it stops |
|:---|:---|:---|
| `nightly-export-sweep` | 02:00 daily | Stale export artifacts accumulate; storage cost drifts up |
| `stale-branch-report` | Monday 08:00 | Nothing breaks; the report is a nudge, not a gate |
| `cert-expiry-watch` | 06:00 daily | A certificate expires without warning. This one matters |
