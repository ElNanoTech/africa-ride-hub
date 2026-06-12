import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkIsAdminWithRetry } from './adminAuthCheck';
import { supabaseAdmin } from '@/integrations/supabase/clients';

vi.mock('@/integrations/supabase/clients', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}));

const rpcMock = vi.mocked(supabaseAdmin.rpc);

describe('checkIsAdminWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpcMock.mockReset();
  });

  it('retries transient is_admin failures before succeeding', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: 'network hiccup' } } as any)
      .mockResolvedValueOnce({ data: true, error: null } as any);

    const resultPromise = checkIsAdminWithRetry('admin-user-id', 3);
    await vi.advanceTimersByTimeAsync(250);
    const result = await resultPromise;

    expect(result).toEqual({ ok: true, isAdmin: true, attempts: 2 });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenCalledWith('is_admin', { _user_id: 'admin-user-id' });
  });

  it('does not produce a false non-admin result when all attempts fail', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'temporary outage' } } as any);

    const resultPromise = checkIsAdminWithRetry('admin-user-id', 3);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(result.isAdmin).toBeUndefined();
    expect(result.attempts).toBe(3);
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });
});