-- =============================================
-- AI EXPLANATIONS TABLE
-- Stores AI-generated score explanations and tips for drivers
-- =============================================
CREATE TABLE public.ai_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  credit_score_id UUID REFERENCES public.credit_scores(id) ON DELETE SET NULL,
  explanation_type TEXT NOT NULL CHECK (explanation_type IN ('score_explanation', 'improvement_tips', 'tier_change', 'loan_eligibility')),
  content TEXT NOT NULL,
  facts_used JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_ai_explanations_driver_id ON public.ai_explanations(driver_id);
CREATE INDEX idx_ai_explanations_credit_score_id ON public.ai_explanations(credit_score_id);

-- Enable RLS
ALTER TABLE public.ai_explanations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Drivers can view own explanations"
ON public.ai_explanations
FOR SELECT
USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage all explanations"
ON public.ai_explanations
FOR ALL
USING (public.is_admin(auth.uid()));

-- Service role can insert (for edge functions)
CREATE POLICY "Service role can insert explanations"
ON public.ai_explanations
FOR INSERT
WITH CHECK (true);