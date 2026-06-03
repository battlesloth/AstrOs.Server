import { describe, it, expect } from 'vitest';
import { apiClient } from '@/api/apiService';

describe('apiClient base URL', () => {
  it('uses a same-origin relative base, not an absolute localhost URL', () => {
    // Regression guard for remote-host login: an absolute `http://localhost:3000`
    // base resolves to the *browser's* machine, so login fails from any host but
    // the server itself. A relative `/` flows through the nginx `/api/` proxy
    // (prod) / Vite dev proxy (dev) to the backend that served the page.
    expect(apiClient.defaults.baseURL).toBe('/');
    expect(apiClient.defaults.baseURL).not.toMatch(/^https?:\/\//);
  });
});
