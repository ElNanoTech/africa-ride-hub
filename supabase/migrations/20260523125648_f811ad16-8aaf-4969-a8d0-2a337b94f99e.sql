CREATE OR REPLACE VIEW public.v_wallet_settlement_anomalies AS
SELECT
  t.id AS wallet_txn_id,
  t.driver_id,
  t.customer_id,
  t.invoice_id,
  t.payment_id,
  t.amount AS debited_amount,
  t.created_at,
  i.invoice_number,
  i.status AS invoice_status,
  i.amount_paid AS invoice_amount_paid,
  i.total_ttc AS invoice_total,
  'CRITICAL'::text AS severity,
  'Crédit portefeuille débité mais non appliqué à la facture.'::text AS message,
  'Réparer le rapprochement.'::text AS recommended_action
FROM driver_wallet_transactions t
LEFT JOIN invoice i ON i.id = t.invoice_id
WHERE t.direction = 'debit'
  AND t.type = 'rental_invoice_applied'
  AND t.invoice_id IS NOT NULL
  AND t.payment_id IS NOT NULL
  -- still no matching payment_receipt for this debit
  AND NOT EXISTS (
    SELECT 1 FROM payment_receipts pr
    WHERE pr.payment_id = t.payment_id
      AND pr.amount = t.amount
      AND pr.created_at BETWEEN t.created_at - interval '5 seconds'
                            AND t.created_at + interval '5 seconds'
  )
  -- AND not yet compensated by a refund/regularisation credit on the same invoice
  AND NOT EXISTS (
    SELECT 1 FROM driver_wallet_transactions r
    WHERE r.driver_id = t.driver_id
      AND r.invoice_id = t.invoice_id
      AND r.direction = 'credit'
      AND r.amount >= t.amount
      AND r.created_at >= t.created_at
      AND r.type IN ('invoice_cancellation_refund', 'cancellation_refund', 'manual_adjustment', 'refund', 'refund_or_credit')
  );

COMMENT ON VIEW public.v_wallet_settlement_anomalies IS
  'Orphan wallet debits where the corresponding payment_receipt was never written AND no compensating refund/regularisation credit has been recorded. Flag = CRITICAL.';