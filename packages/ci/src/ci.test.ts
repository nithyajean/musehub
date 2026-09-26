import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index.js';

describe('@musehub/ci', () => {
  it('is scaffolded', () => {
    expect(PACKAGE).toBe('@musehub/ci');
  });
});
