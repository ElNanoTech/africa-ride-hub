-- Layer 3F hotfix: allow idempotent evidence lock refreshes after decisions.
-- The original guard correctly blocks evidence edits after a decision, but it
-- also rejected no-op locked_at refreshes used by formal declaration cleanup.

CREATE OR REPLACE FUNCTION public.credit_default_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'default evidence is immutable; attach corrected evidence instead of deleting';
  END IF;

  IF OLD.default_review_id IS DISTINCT FROM NEW.default_review_id
    OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
    OR OLD.evidence_type IS DISTINCT FROM NEW.evidence_type
    OR OLD.source_reference_type IS DISTINCT FROM NEW.source_reference_type
    OR OLD.source_reference_id IS DISTINCT FROM NEW.source_reference_id THEN
    RAISE EXCEPTION 'default evidence identity is immutable';
  END IF;

  IF OLD.locked_at IS NOT NULL THEN
    IF OLD.evidence_summary IS DISTINCT FROM NEW.evidence_summary
      OR NEW.locked_at IS DISTINCT FROM OLD.locked_at THEN
      RAISE EXCEPTION 'default evidence is locked after decision';
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM public.credit_default_decisions d
    WHERE d.default_review_id = OLD.default_review_id
  ) THEN
    IF OLD.evidence_summary IS DISTINCT FROM NEW.evidence_summary
      OR NEW.locked_at IS NULL THEN
      RAISE EXCEPTION 'default evidence is locked after decision';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
