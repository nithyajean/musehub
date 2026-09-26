import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The git-side gate. The API and identity layer authenticate the pusher before
 * receive-pack ever runs (RFC 9421 signed request, then the MuseHub token). The
 * pre-receive hook is the backstop that enforces the identity and
 * branch-protection decision at push time, so a push that somehow reaches the
 * repo without a decision is still refused.
 *
 * Two real controls, both usable in a demo:
 *   1. A lock marker file (repo locked or the pusher is not a verified agent).
 *   2. A delegated checker command (MUSEHUB_PUSH_CHECK): it receives the
 *      "<old> <new> <ref>" ref-update lines on stdin and returns non-zero to
 *      reject. This is where the API wires a per-push identity/branch-protection
 *      call.
 */
export const PRE_RECEIVE_HOOK = `#!/bin/sh
# MuseHub pre-receive gate. Do not edit by hand; written by @musehub/git.
GIT_DIR_PATH="\${GIT_DIR:-.}"
if [ -f "$GIT_DIR_PATH/musehub-locked" ] || [ "$MUSEHUB_PUSH_DENY" = "1" ]; then
  echo "MuseHub: push rejected, repository is locked or the pusher is not a verified Muse agent" >&2
  exit 1
fi
if [ -n "$MUSEHUB_PUSH_CHECK" ]; then
  if ! sh -c "$MUSEHUB_PUSH_CHECK"; then
    echo "MuseHub: push rejected by the identity gate" >&2
    exit 1
  fi
fi
exit 0
`;

/**
 * post-receive notifies the forge that refs changed (CI trigger, audit,
 * webhooks). The API sets MUSEHUB_POST_RECEIVE to a command that ingests the
 * "<old> <new> <ref>" lines on stdin. Absent that, it is a no-op so a plain
 * push still succeeds.
 */
export const POST_RECEIVE_HOOK = `#!/bin/sh
# MuseHub post-receive notify. Do not edit by hand; written by @musehub/git.
if [ -n "$MUSEHUB_POST_RECEIVE" ]; then
  exec sh -c "$MUSEHUB_POST_RECEIVE"
fi
exit 0
`;

/** Write the pre-receive and post-receive hooks into a bare repo, executable. */
export async function installHooks(gitdir: string): Promise<void> {
  const hooksDir = join(gitdir, 'hooks');
  const pre = join(hooksDir, 'pre-receive');
  const post = join(hooksDir, 'post-receive');
  await writeFile(pre, PRE_RECEIVE_HOOK, 'utf8');
  await writeFile(post, POST_RECEIVE_HOOK, 'utf8');
  await chmod(pre, 0o755);
  await chmod(post, 0o755);
}
