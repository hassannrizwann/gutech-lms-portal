import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('LMS API guards and public auth surface', () => {
  it('reports a healthy API', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('does not expose a public sign-up endpoint', async () => {
    const response = await request(app).post('/api/signup').send({ email: 'nobody@example.test' });
    expect(response.status).toBe(404);
  });

  it('requires authentication before exposing admin users', async () => {
    const response = await request(app).get('/api/admin/users?page=1&pageSize=20');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed login input before contacting Supabase', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'invalid', password: '' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('protects course coursework from unauthenticated requests', async () => {
    const response = await request(app).get('/api/courses/20000000-0000-4000-8000-000000000001/assignments?page=1&pageSize=20');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
