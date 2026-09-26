import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index.js';

describe('@musehub/server', () => {
  it('is scaffolded', () => {
    expect(PACKAGE).toBe('@musehub/server');
  });
});
