# pulse-digest (draft)

Pre-repo R&D. No remote, no CI, no licence — see the workspace README for why that is
deliberate rather than an oversight.

The idea: a weekly digest of which exports people actually download, so the export
formats nobody uses can be retired. Currently a notebook and a lot of guessing.

## Open questions

- Is download count even the right signal, or is it re-download count?
- Where would this run? Nothing here owns a scheduler yet.
- Does this need to be a service at all, or is it a query someone runs monthly?

If the third question is yes, this never becomes a repo, and that is a fine outcome.
