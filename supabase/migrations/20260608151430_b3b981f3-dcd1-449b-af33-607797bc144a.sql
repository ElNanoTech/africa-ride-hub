
-- Auto-apply driver wallet credit when an invoice_payment_link row is created.
-- This closes the race where invoice INSERT fires trg_invoice_auto_apply before
-- the matching invoice_payment_link row exists, causing the apply RPC to skip
-- the invoice (it requires a linked payment to know where to post the receipt).

CREATE OR REPLACE FUNCTION public.trg_invoice_payment_link_auto_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  SELECT driver_id INTO v_driver_id
  FROM public.invoice
  WHERE id = NEW.invoice_id;

  IF v_driver_id IS NOT NULL THEN
    PERFORM public.trigger_apply_wallet_credit(v_driver_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_payment_link_auto_apply ON public.invoice_payment_link;
CREATE TRIGGER trg_invoice_payment_link_auto_apply
AFTER INSERT ON public.invoice_payment_link
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoice_payment_link_auto_apply();

-- One-time catch-up for any driver currently in the buggy state.
DO $$
DECLARE
  v_driver uuid;
BEGIN
  FOR v_driver IN
    SELECT DISTINCT dw.driver_id
    FROM public.driver_wallets dw
    WHERE dw.balance > 0
      AND EXISTS (
        SELECT 1 FROM public.invoice i
        JOIN public.invoice_payment_link l ON l.invoice_id = i.id
        WHERE i.driver_id = dw.driver_id
          AND i.status IN ('issued','partial')
          AND COALESCE(i.remaining_due, 0) > 0
      )
  LOOP
    BEGIN
      PERFORM public.apply_wallet_credit_to_open_invoices(v_driver);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'catch-up apply failed for driver %: %', v_driver, SQLERRM;
    END;
  END LOOP;
END $$;
