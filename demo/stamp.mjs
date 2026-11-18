/**
 * The demo page's build stamp: `<meta name="build" content="<sha>">`, the commit the hosted
 * demo was built from. Without it a stale deploy looks exactly like a current one; the org's
 * surface-drift check reads this tag and compares it with the repo's `main`.
 *
 * Kept apart from build-demo.mjs, which runs a whole build on import, so the hub's test suite
 * can pin it.
 */

/** A full or abbreviated git commit id, lowercase hex. The drift check reads 7 to 40. */
const SHA = /^[0-9a-f]{7,40}$/;

const clean = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return SHA.test(s) ? s : null;
};

/**
 * Which commit to stamp. CI's `GITHUB_SHA` comes first: it is the pushed commit the Pages
 * deploy is for, and needs no git call. A local build falls back to `readHead()` (the
 * checkout's HEAD). Anything that isn't a commit id, or a `readHead` that throws (no git, or
 * not a clone), gives null and the page goes out unstamped.
 */
export function buildSha(envSha, readHead) {
  const fromEnv = clean(envSha);
  if (fromEnv) return fromEnv;
  if (typeof readHead !== 'function') return null;
  try { return clean(readHead()); } catch { return null; }
}

/** The tag itself. `name` before `content`, because that is the order the drift check matches. */
export function stampTag(sha) {
  const s = clean(sha);
  if (!s) throw new Error(`not a commit id: ${JSON.stringify(sha)}`);
  return `<meta name="build" content="${s}">`;
}
