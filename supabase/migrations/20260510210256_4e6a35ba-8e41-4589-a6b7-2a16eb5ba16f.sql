CREATE OR REPLACE FUNCTION public.credit_driver_wallet(
  p_driver_id uuid,
  p_amount integer,
  p_type text DEFAULT 'upfront_deposit',
  p_invoice_id uuid DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL,
  p_rental_id uuid DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_new_balance integer;
BEGIN
  IF p_amount <= 0 THEN RETURN 0; END IF;

  SELECT customer_id INTO v_customer_id FROM public.drivers WHERE id = p_driver_id;

  INSERT INTO public.driver_wallets (driver_id, customer_id, balance, updated_at)
  VALUES (p_driver_id, v_customer_id, p_amount, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET balance = public.driver_wallets.balance + EXCLUDED.balance,
        updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.driver_wallet_transactions
    (driver_id, customer_id, rental_id, invoice_id, payment_id, type, amount, balance_after, method, reference, note, created_by)
  VALUES
    (p_driver_id, v_customer_id, p_rental_id, p_invoice_id, p_payment_id, p_type, p_amount, v_new_balance, p_method, p_reference, p_note, p_created_by);

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_driver_wallet(uuid, integer, text, uuid, uuid, uuid, text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_driver_wallet(uuid, integer, text, uuid, uuid, uuid, text, text, text, uuid) TO service_role;