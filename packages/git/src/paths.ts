import { join } from 'node:path';
import { Handle, RepoName, forgeError } from '@musehub/contracts';

/**
 * Owner and repo names come from agent input, so they are validated against the
 * contract regexes before they ever touch a filesystem path. This is the guard
 * against path traversal (an owner of "../.." never reaches join()).
 */
export function assertRepoRef(owner: string, name: string): void {
  if (!Handle.safeParse(owner).success) {
    throw forgeError('validation_failed', `invalid owner handle: ${owner}`, {
      details: { field: 'owner' },
    });
  }
  if (!RepoName.safeParse(name).success) {
    throw forgeError('validation_failed', `invalid repo name: ${name}`, {
      details: { field: 'name' },
    });
  }
}

/** Absolute path to a bare repo: <root>/<owner>/<name>.git */
export function repoDir(root: string, owner: string, name: string): string {
  assertRepoRef(owner, name);
  return join(root, owner, `${name}.git`);
}

/** Directory that holds all of an owner's repos: <root>/<owner> */
export function ownerDir(root: string, owner: string): string {
  if (!Handle.safeParse(owner).success) {
    throw forgeError('validation_failed', `invalid owner handle: ${owner}`, {
      details: { field: 'owner' },
    });
  }
  return join(root, owner);
}

// Bytes git itself forbids in a ref: control chars, space and ~ ^ : ? * [ backslash.
const REF_SPECIALS = new Set(['~', '^', ':', '?', '*', '[', '\\']);

function hasRefSpecialByte(s: string): boolean {
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || REF_SPECIALS.has(ch)) {
      return true;
    }
  }
  return false;
}

/**
 * A branch name that is safe to place inside refs/heads/ and to hand to git.
 * Rejects the ref-format traps that git check-ref-format also rejects: empty, a
 * component starting with a dot, "..", control chars, spaces, the special
 * bytes, "@{", a trailing ".lock" and the slash edge cases. Args are always
 * passed as argv arrays, so this blocks ref-path abuse, not shell injection
 * (the argv arrays already prevent that).
 */
function refNameInvalid(ref: string): boolean {
  return (
    ref.length === 0 ||
    ref.length > 255 ||
    ref === '@' ||
    ref.startsWith('.') ||
    ref.startsWith('/') ||
    ref.endsWith('/') ||
    ref.endsWith('.lock') ||
    ref.includes('..') ||
    ref.includes('//') ||
    ref.includes('@{') ||
    ref.includes('/.') ||
    hasRefSpecialByte(ref)
  );
}

export function assertBranchName(branch: string): void {
  if (refNameInvalid(branch)) {
    throw forgeError('validation_failed', `invalid branch name: ${branch}`, {
      details: { field: 'branch' },
    });
  }
}

/** A tag name safe under refs/tags/. Same ref-format rules as a branch name. */
export function assertTagName(tag: string): void {
  if (refNameInvalid(tag)) {
    throw forgeError('validation_failed', `invalid tag name: ${tag}`, {
      details: { field: 'tag' },
    });
  }
}

/** A committish (branch, tag, HEAD or 40-hex oid) safe to hand to git as a value. */
export function assertCommittish(ref: string): void {
  const bad = ref.length === 0 || ref.length > 255 || ref.startsWith('-') || hasRefSpecialByte(ref);
  if (bad) {
    throw forgeError('validation_failed', `invalid ref: ${ref}`, { details: { field: 'ref' } });
  }
}

export const FULL_OID = /^[0-9a-f]{40}$/;
export const ZERO_OID = '0000000000000000000000000000000000000000';
