
-- =========================================================
-- Tenant isolation hardening for admin policies
-- =========================================================

-- admin_audit_logs: ensure inserted admin_user_id belongs to the same tenant
DROP POLICY IF EXISTS "admins insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "admins insert audit logs" ON public.admin_audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  is_admin()
  AND admin_user_id IN (
    SELECT au.id FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
  AND (
    is_platform_owner()
    OR admin_user_id IN (
      SELECT au.id FROM public.admin_users au
      WHERE au.customer_id = current_customer_id()
    )
  )
);

-- driver_wallet_transactions: scope admin DML/SELECT by customer_id
DROP POLICY IF EXISTS "admins manage wallet txns" ON public.driver_wallet_transactions;
CREATE POLICY "admins manage wallet txns" ON public.driver_wallet_transactions
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

-- driver_wallets: scope admin access by customer_id
DROP POLICY IF EXISTS "admins manage wallets" ON public.driver_wallets;
CREATE POLICY "admins manage wallets" ON public.driver_wallets
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

-- contract_milestones: scope via parent contract's customer_id
DROP POLICY IF EXISTS "Admins manage milestones" ON public.contract_milestones;
CREATE POLICY "Admins manage milestones" ON public.contract_milestones
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.rent_to_own_contracts c
    WHERE c.id = contract_milestones.contract_id
      AND c.customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.rent_to_own_contracts c
    WHERE c.id = contract_milestones.contract_id
      AND c.customer_id = current_customer_id()
  ))
);

-- contract_payments: scope via parent contract
DROP POLICY IF EXISTS "Admins manage contract payments" ON public.contract_payments;
CREATE POLICY "Admins manage contract payments" ON public.contract_payments
FOR ALL USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text]) AND EXISTS (
    SELECT 1 FROM public.rent_to_own_contracts c
    WHERE c.id = contract_payments.contract_id
      AND c.customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text]) AND EXISTS (
    SELECT 1 FROM public.rent_to_own_contracts c
    WHERE c.id = contract_payments.contract_id
      AND c.customer_id = current_customer_id()
  ))
);

-- device_tokens: scope via driver's customer_id
DROP POLICY IF EXISTS "Admins can view all device tokens" ON public.device_tokens;
CREATE POLICY "Admins can view all device tokens" ON public.device_tokens
FOR SELECT USING (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = device_tokens.driver_id
      AND d.customer_id = current_customer_id()
  ))
);

-- driver_badges: scope admin access via driver's customer_id
DROP POLICY IF EXISTS "Admins manage driver badges" ON public.driver_badges;
CREATE POLICY "Admins manage driver badges" ON public.driver_badges
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = driver_badges.driver_id
      AND d.customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = driver_badges.driver_id
      AND d.customer_id = current_customer_id()
  ))
);

DROP POLICY IF EXISTS "Drivers view own badges" ON public.driver_badges;
CREATE POLICY "Drivers view own badges" ON public.driver_badges
FOR SELECT USING (
  driver_id = current_driver_id()
  OR is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = driver_badges.driver_id
      AND d.customer_id = current_customer_id()
  ))
);

-- driving_events: remove is_admin() branch from driver SELECT
DROP POLICY IF EXISTS "drivers view own driving events" ON public.driving_events;
CREATE POLICY "drivers view own driving events" ON public.driving_events
FOR SELECT USING (driver_id = current_driver_id());

-- geofence_zones: tenant scope
DROP POLICY IF EXISTS "Admins manage geofence zones" ON public.geofence_zones;
CREATE POLICY "Admins manage geofence zones" ON public.geofence_zones
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

-- login_activity: scope via driver's customer
DROP POLICY IF EXISTS "Admins can view all login activity" ON public.login_activity;
CREATE POLICY "Admins can view all login activity" ON public.login_activity
FOR SELECT USING (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = login_activity.driver_id
      AND d.customer_id = current_customer_id()
  ))
);

-- notifications: scope admin policies by customer_id
DROP POLICY IF EXISTS "admin manages notifications" ON public.notifications;
CREATE POLICY "admin manages notifications" ON public.notifications
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

DROP POLICY IF EXISTS "driver views own notifications" ON public.notifications;
CREATE POLICY "driver views own notifications" ON public.notifications
FOR SELECT USING (
  driver_id = current_driver_id()
  OR is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

-- rent_to_own_contracts: tenant scope on admin policy
DROP POLICY IF EXISTS "Admins manage contracts" ON public.rent_to_own_contracts;
CREATE POLICY "Admins manage contracts" ON public.rent_to_own_contracts
FOR ALL USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text]) AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text]) AND customer_id = current_customer_id())
);

-- support_ticket_messages: scope via parent ticket
DROP POLICY IF EXISTS "Admins can manage ticket messages" ON public.support_ticket_messages;
CREATE POLICY "Admins can manage ticket messages" ON public.support_ticket_messages
FOR ALL USING (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND t.customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND t.customer_id = current_customer_id()
  ))
);

-- support_tickets: tenant scope on admin branches
DROP POLICY IF EXISTS "driver views own tickets" ON public.support_tickets;
CREATE POLICY "driver views own tickets" ON public.support_tickets
FOR SELECT USING (
  driver_id = current_driver_id()
  OR is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

DROP POLICY IF EXISTS "support staff manages tickets" ON public.support_tickets;
CREATE POLICY "support staff manages tickets" ON public.support_tickets
FOR UPDATE USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text, 'support'::text]) AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text, 'support'::text]) AND customer_id = current_customer_id())
);

DROP POLICY IF EXISTS "admin deletes tickets" ON public.support_tickets;
CREATE POLICY "admin deletes tickets" ON public.support_tickets
FOR DELETE USING (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

-- vehicle_location_history: tenant scope
DROP POLICY IF EXISTS "Admins manage vehicle history" ON public.vehicle_location_history;
CREATE POLICY "Admins manage vehicle history" ON public.vehicle_location_history
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

-- vehicle_positions: tenant scope
DROP POLICY IF EXISTS "Admins manage vehicle positions" ON public.vehicle_positions;
CREATE POLICY "Admins manage vehicle positions" ON public.vehicle_positions
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

-- vehicles: tenant scope on view + manage
DROP POLICY IF EXISTS "admins view vehicles" ON public.vehicles;
CREATE POLICY "admins view vehicles" ON public.vehicles
FOR SELECT USING (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

DROP POLICY IF EXISTS "admin manages vehicles" ON public.vehicles;
CREATE POLICY "admin manages vehicles" ON public.vehicles
FOR ALL USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text]) AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text]) AND customer_id = current_customer_id())
);
