# Vendor notes

Things learned the hard way about systems we do not control.

## Object storage

Listing a prefix is eventually consistent. A write followed immediately by a list can
return nothing. Read the object by key instead — that is strongly consistent.

## The rate feed

Sends `200 OK` with an empty body during their maintenance window rather than a 503.
Treat an empty body as a failure explicitly; the HTTP status will not tell you.

## The directory

Group membership changes take up to fifteen minutes to appear over the API, even though
they are visible in their web UI immediately. Any review run inside that window is wrong
in a way that looks right.
