# link-audit

Checks every external link in `Documents/` once a week and writes the dead ones to
`Documents/Reference/dead-links.md`. It never edits a document itself: a dead link is
sometimes the only record of where something used to be.

The last run failed on a vendor portal that answers every request with a login page.
Allow-listing that host is the open question.
