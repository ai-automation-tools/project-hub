# access-review

Read-only. This service must never hold a credential that can grant or revoke.

If a change needs write access to do something useful, that is a signal the change
belongs in a different repo, not a signal to widen the credential.
