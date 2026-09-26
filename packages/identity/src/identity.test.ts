import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index.js';

describe('@musehub/identity', () => {
  it('is scaffolded', () => {
    expect(PACKAGE).toBe('@musehub/identity');
  });
});
