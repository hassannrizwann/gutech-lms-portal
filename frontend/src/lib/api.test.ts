import { describe, expect, it } from 'vitest';
import { session } from './api';

describe('in-memory auth session', () => {
  it('stores an access token and clears it on logout', () => {
    session.token = 'test-access-token';
    expect(session.token).toBe('test-access-token');
    session.clear();
    expect(session.token).toBeNull();
  });
});
