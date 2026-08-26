import { vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: async (hostname: string, options?: { all?: boolean }) => {
    const host = String(hostname).toLowerCase();
    const address = host === 'ssrf.internal-test' ? '127.0.0.1' : '93.184.216.34';
    const record = { address, family: 4 as const };
    if (options?.all) return [record];
    return record;
  },
}));
