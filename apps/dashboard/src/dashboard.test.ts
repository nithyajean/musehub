import { describe, expect, it } from 'vitest';
import { greeting } from './lib';

describe('@musehub/dashboard', () => {
  it('is scaffolded', () => {
    expect(greeting()).toContain('MuseHub');
  });
});
