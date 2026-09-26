import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index.js';

describe('@musehub/git', () => {
  it('is scaffolded', () => {
    expect(PACKAGE).toBe('@musehub/git');
  });
});
