import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index.js';

describe('@musehub/mcp', () => {
  it('is scaffolded', () => {
    expect(PACKAGE).toBe('@musehub/mcp');
  });
});
