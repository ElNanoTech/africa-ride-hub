UPDATE public.rentals
SET status = 'approved',
    requested_rate = COALESCE(requested_rate, 15000),
    approved_rate = COALESCE(approved_rate, 15000),
    approved_duration_hours = COALESCE(approved_duration_hours, 24),
    payment_phase = 'not_due'
WHERE id = 'd65584e1-9c15-493a-bf10-580e12a4a1a4';