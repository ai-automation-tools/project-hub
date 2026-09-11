# Normalisation

Three rewrites happen on the way in. Everything else is passed through untouched, on
purpose — a normaliser that reaches too far becomes the thing you debug.

| Field | Incoming | Stored |
|:---|:---|:---|
| `amount` | decimal string | integer minor units |
| `posted_at` | local time, no zone | UTC instant |
| `account` | free text with padding | trimmed, upper case |

## The timezone one

The feed sends local time with no offset and the offset is not constant across the year.
It is resolved against the account's registered zone, not the server's. That is the only
reason account lookup happens before parsing rather than after.
