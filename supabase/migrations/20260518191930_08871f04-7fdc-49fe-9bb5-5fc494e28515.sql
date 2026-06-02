-- Backfill invoice_payment_link + payments rows for issued invoices that
-- never received their matching payment link (e.g. admin-created manual
-- invoices that bypassed the standard issuance path). Without these rows
-- the driver's `canPayWithWave` check in FactureDetail.tsx fails and the
-- UI falls back to "Contactez votre gestionnaire".
--
-- Tag every backfilled payments row with wave_transaction_id =
-- 'BACKFILL-INVLINK-V1:<invoice_id>' for clean rollback / auditability.
-- Idempotent: invoices that already have any link are excluded by the CTE,
-- and the unique constraint on (invoice_id, payment_id) prevents duplicates.

DO $mig$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH eligible AS (
    SELECT i.id          AS invoice_id,
           i.customer_id,
           i.driver_id,
           i.rental_id,                                       -- nullable, kept as-is
           i.total_ttc   AS amount,
           COALESCE(i.issued_at::date, i.created_at::date) AS due_date
    FROM   public.invoice i
    WHERE  i.status = 'issued'
      AND  i.paid_at IS NULL
      AND  i.cancelled_at IS NULL
      AND  i.invoice_kind IN ('invoice','daily_rental','monthly_statement')
      AND  i.driver_id IS NOT NULL
      AND  i.customer_id IS NOT NULL
      AND  i.total_ttc > 0
      AND  NOT EXISTS (
             SELECT 1 FROM public.invoice_payment_link l
             WHERE l.invoice_id = i.id
           )
  ),
  ins_pay AS (
    INSERT INTO public.payments
      (driver_id, customer_id, rental_id, loan_id, amount, amount_paid,
       status, due_date, payment_type, wave_transaction_id)
    SELECT e.driver_id, e.customer_id, e.rental_id, NULL,
           e.amount, 0, 'pending', e.due_date, 'rental',
           'BACKFILL-INVLINK-V1:' || e.invoice_id
    FROM   eligible e
    RETURNING id AS payment_id, wave_transaction_id
  ),
  ins_link AS (
    INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
    SELECT (split_part(ip.wave_transaction_id, ':', 2))::uuid AS invoice_id,
           ip.payment_id,
           (SELECT i2.customer_id FROM public.invoice i2
            WHERE i2.id = (split_part(ip.wave_transaction_id, ':', 2))::uuid)
    FROM   ins_pay ip
    ON CONFLICT (invoice_id, payment_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins_link;

  RAISE NOTICE 'BACKFILL-INVLINK-V1: backfilled % invoice_payment_link rows', v_inserted;
END
$mig$;