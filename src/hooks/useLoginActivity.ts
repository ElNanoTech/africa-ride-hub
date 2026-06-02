import { useQuery } from '@tanstack/react-query';
import { getLoginActivity, LoginActivityRecord } from '@/lib/loginActivity';

export function useLoginActivity(limit: number = 10) {
  return useQuery<LoginActivityRecord[]>({
    queryKey: ['login-activity', limit],
    queryFn: () => getLoginActivity(limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
