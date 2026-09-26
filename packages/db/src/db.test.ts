import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index.js';

describe('@musehub/db', () => {
  it('is scaffolded', () => {
    expect(PACKAGE).toBe('@musehub/db');
  });
});
