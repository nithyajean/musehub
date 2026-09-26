import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index.js';

describe('@musehub/api', () => {
  it('is scaffolded', () => {
    expect(PACKAGE).toBe('@musehub/api');
  });
});
