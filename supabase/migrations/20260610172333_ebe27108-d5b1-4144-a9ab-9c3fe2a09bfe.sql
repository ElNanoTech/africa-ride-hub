
-- KYC: allow admins to create on behalf of a driver in their tenant
CREATE POLICY "Admins can create KYC"
ON public.kyc_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND (customer_id = current_customer_id() OR current_customer_id() IS NULL))
);

-- Loans: allow admin/loan staff to create on behalf of a driver
CREATE POLICY "Loan staff can create loans"
ON public.loans
FOR INSERT
TO authenticated
WITH CHECK (
  is_platform_owner()
  OR (
    has_admin_role_in(ARRAY['super_admin','manager','agent_pret'])
    AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)
  )
);

-- Support tickets: allow support staff/admin to create on behalf of a driver
CREATE POLICY "Support staff can create tickets"
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  is_platform_owner()
  OR (
    has_admin_role_in(ARRAY['super_admin','manager','support'])
    AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)
  )
);
