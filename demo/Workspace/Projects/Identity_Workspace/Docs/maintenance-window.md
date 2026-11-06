# Maintenance window

Tuesdays, 06:00–07:00 UTC. The identity provider's own window is Sunday night, so ours
never stacks on top of it.

## What goes in it

- Directory sync configuration changes
- Group-mapping changes that touch more than 50 accounts
- Certificate rotation for the SAML signing key

## What does not

Access removals. Revoking access is never held for a window; it happens when the review
says so.

## Announcing it

One message in the team channel the Friday before, naming the change and the rollback.
If the rollback is "restore from backup", the change is not ready.
