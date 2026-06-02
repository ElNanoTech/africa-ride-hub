import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Customer } from '@/hooks/useFeatureFlags';

/**
 * Hook to create a new customer
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customer: {
      name: string;
      slug: string;
      logo_url?: string;
      primary_color?: string;
      secondary_color?: string;
      is_active?: boolean;
      settings?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          name: customer.name,
          slug: customer.slug,
          logo_url: customer.logo_url || null,
          primary_color: customer.primary_color || '#22c55e',
          secondary_color: customer.secondary_color || '#3b82f6',
          is_active: customer.is_active ?? true,
          settings: (customer.settings || {}) as import('@/integrations/supabase/types').Json,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

/**
 * Hook to update a customer
 */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      slug,
      logo_url,
      primary_color,
      secondary_color,
      is_active,
    }: { 
      id: string;
      name?: string;
      slug?: string;
      logo_url?: string | null;
      primary_color?: string;
      secondary_color?: string;
      is_active?: boolean;
    }) => {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (name !== undefined) updateData.name = name;
      if (slug !== undefined) updateData.slug = slug;
      if (logo_url !== undefined) updateData.logo_url = logo_url;
      if (primary_color !== undefined) updateData.primary_color = primary_color;
      if (secondary_color !== undefined) updateData.secondary_color = secondary_color;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      const { data, error } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['current-customer'] });
    },
  });
}

/**
 * Hook to deactivate a customer (soft delete - platform owner only)
 * We never hard-delete customers to avoid orphan data
 */
export function useDeactivateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId: string) => {
      const { data, error } = await supabase
        .from('customers')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['current-customer'] });
    },
  });
}

/**
 * Hook to get customer statistics
 */
export function useCustomerStats(customerId: string) {
  return useQuery({
    queryKey: ['customer-stats', customerId],
    queryFn: async () => {
      // Fetch counts in parallel
      const [driversResult, vehiclesResult, rentalsResult, loansResult] = await Promise.all([
        supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('customer_id', customerId),
        supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('customer_id', customerId),
        supabase.from('rentals').select('id', { count: 'exact', head: true }).eq('customer_id', customerId),
        supabase.from('loans').select('id', { count: 'exact', head: true }).eq('customer_id', customerId),
      ]);

      return {
        drivers: driversResult.count || 0,
        vehicles: vehiclesResult.count || 0,
        rentals: rentalsResult.count || 0,
        loans: loansResult.count || 0,
      };
    },
    enabled: !!customerId,
  });
}

/**
 * Hook to get all customers with their stats (platform owner only)
 */
export function useCustomersWithStats() {
  return useQuery({
    queryKey: ['customers-with-stats'],
    queryFn: async () => {
      const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      // Fetch stats for each customer in parallel
      const customersWithStats = await Promise.all(
        (customers || []).map(async (customer) => {
          const [driversResult, vehiclesResult, adminsResult] = await Promise.all([
            supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('customer_id', customer.id),
            supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('customer_id', customer.id),
            supabase.from('admin_users').select('id', { count: 'exact', head: true }).eq('customer_id', customer.id),
          ]);

          return {
            ...customer,
            stats: {
              drivers: driversResult.count || 0,
              vehicles: vehiclesResult.count || 0,
              admins: adminsResult.count || 0,
            },
          };
        })
      );

      return customersWithStats;
    },
  });
}
