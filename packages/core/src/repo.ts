/** A repository spec split into its parts. */
export interface OwnerName {
  owner: string;
  name: string;
  fullName: string;
}

/**
 * Normalize a `RepoSpec` the caller passed. A bare `name` takes the caller's
 * handle as the owner; an `owner/name` string is split as given. This is the one
 * place the "owner defaults to the caller" convention (R6) is implemented.
 */
export function normalizeRepoSpec(callerHandle: string, spec: string): OwnerName {
  const slash = spec.indexOf('/');
  if (slash === -1) {
    return { owner: callerHandle, name: spec, fullName: `${callerHandle}/${spec}` };
  }
  const owner = spec.slice(0, slash);
  const name = spec.slice(slash + 1);
  return { owner, name, fullName: `${owner}/${name}` };
}

/** Build the clone URL for a repo from the git base. */
export function cloneUrl(gitBaseUrl: string, owner: string, name: string): string {
  return `${gitBaseUrl.replace(/\/$/, '')}/${owner}/${name}.git`;
}
