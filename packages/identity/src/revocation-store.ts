// Token revocation set for the instant kill switch (gate layer L4).
//
// A minted token is valid until it expires unless its id (jti) is here. Adding
// a jti revokes it immediately, before its natural expiry. In production inject
// a shared, durable store so a revocation lands across every API instance.

export interface RevocationStore {
  revoke(tokenId: string): Promise<void>;
  isRevoked(tokenId: string): Promise<boolean>;
}

/** In-process revocation set. Not durable and not shared across instances. */
export class InMemoryRevocationStore implements RevocationStore {
  private readonly revoked = new Set<string>();

  async revoke(tokenId: string): Promise<void> {
    this.revoked.add(tokenId);
  }

  async isRevoked(tokenId: string): Promise<boolean> {
    return this.revoked.has(tokenId);
  }
}
