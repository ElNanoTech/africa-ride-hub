CREATE OR REPLACE FUNCTION public.mark_overdue_rentals()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_total integer := 0;
BEGIN
  WITH flipped_due AS (
    UPDATE public.rentals SET payment_phase = 'due'
     WHERE status = 'active' AND payment_phase = 'not_due'
       AND payment_due_at_initial IS NOT NULL
       AND payment_due_at_initial <= now()
       AND payment_settled_at IS NULL
     RETURNING id
  )
  SELECT v_total + COUNT(*) INTO v_total FROM flipped_due;

  WITH entering_grace AS (
    UPDATE public.rentals SET payment_phase = 'grace'
     WHERE status = 'active' AND payment_phase = 'due'
       AND payment_due_at_initial IS NOT NULL
       AND payment_due_at_initial < now()
       AND payment_settled_at IS NULL
     RETURNING id, driver_id, final_rate, payment_due_at_final
  ),
  doubled_payment AS (
    UPDATE public.payments p
       SET amount = eg.final_rate * 2,
           due_date = eg.payment_due_at_final::date,
           status = CASE WHEN p.status = 'pending' THEN 'pending' ELSE 'overdue' END
      FROM entering_grace eg
     WHERE p.rental_id = eg.id AND p.status IN ('pending', 'overdue')
     RETURNING p.rental_id
  ),
  driver_notifs AS (
    INSERT INTO public.notifications (driver_id, notification_type, title, message, template_id, variables, channel)
    SELECT eg.driver_id, 'payment_grace_started', 'Paiement en retard',
      '⏰ Paiement en retard. Vous avez jusqu''à demain 12h pour régler ' ||
        (eg.final_rate * 2) || ' FCFA (2 jours). ' ||
        'Passé ce délai, votre score sera pénalisé et le véhicule pourra être désactivé.',
      'payment_grace_started',
      jsonb_build_object('rental_id', eg.id, 'new_amount', eg.final_rate * 2, 'final_deadline', eg.payment_due_at_final),
      'in_app'
    FROM entering_grace eg
    RETURNING 1
  ),
  admin_notifs AS (
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, message, template_id, variables, channel)
    SELECT au.user_id, 'payment_grace_started', 'Période de grâce déclenchée',
      '🔔 ' || d.full_name || ' n''a pas payé à temps. Entré en période de grâce. ' ||
        'Nouvelle échéance: ' || to_char(eg.payment_due_at_final AT TIME ZONE 'Africa/Abidjan', 'DD/MM HH24:MI') ||
        '. Montant: ' || (eg.final_rate * 2) || ' FCFA.',
      'payment_grace_started_admin',
      jsonb_build_object('rental_id', eg.id, 'driver_name', d.full_name, 'new_amount', eg.final_rate * 2, 'final_deadline', eg.payment_due_at_final),
      'in_app'
    FROM entering_grace eg
    JOIN public.drivers d ON d.id = eg.driver_id
    CROSS JOIN public.admin_users au
    WHERE au.is_active = true AND au.user_id IS NOT NULL
    RETURNING 1
  )
  SELECT v_total + COUNT(*) INTO v_total FROM entering_grace;

  WITH entering_final AS (
    UPDATE public.rentals SET payment_phase = 'final_overdue', status = 'payment_overdue'
     WHERE status = 'active' AND payment_phase = 'grace'
       AND payment_due_at_final IS NOT NULL
       AND payment_due_at_final < now()
       AND payment_settled_at IS NULL
     RETURNING id, driver_id, final_rate
  ),
  penalty AS (
    INSERT INTO public.score_events (driver_id, rental_id, event_type, score_delta, reason, source)
    SELECT driver_id, id, 'late_payment', -10, 'Paiement non reçu après période de grâce', 'system_cron'
      FROM entering_final
    ON CONFLICT (rental_id, event_type) DO NOTHING
    RETURNING rental_id
  ),
  driver_final_notifs AS (
    INSERT INTO public.notifications (driver_id, notification_type, title, message, template_id, variables, channel)
    SELECT ef.driver_id, 'payment_final_overdue', 'Paiement final en retard',
      '⚠️ Période de grâce expirée. Score pénalisé de -10 points. ' ||
        'Payez ' || (ef.final_rate * 2) || ' FCFA dès maintenant pour éviter la désactivation du véhicule.',
      'payment_final_overdue',
      jsonb_build_object('rental_id', ef.id, 'amount', ef.final_rate * 2),
      'in_app'
    FROM entering_final ef
    RETURNING 1
  ),
  admin_final_notifs AS (
    INSERT INTO public.notifications (recipient_user_id, notification_type, title, message, template_id, variables, channel)
    SELECT au.user_id, 'payment_final_overdue', 'Paiement final en retard',
      '🚨 ' || d.full_name || ' — paiement final en retard. ' ||
        'Le véhicule peut être désactivé. Rental #' || substring(ef.id::text, 1, 8) || '.',
      'payment_final_overdue_admin',
      jsonb_build_object('rental_id', ef.id, 'driver_name', d.full_name, 'rental_short_id', substring(ef.id::text, 1, 8)),
      'in_app'
    FROM entering_final ef
    JOIN public.drivers d ON d.id = ef.driver_id
    CROSS JOIN public.admin_users au
    WHERE au.is_active = true AND au.user_id IS NOT NULL
    RETURNING 1
  )
  SELECT v_total + COUNT(*) INTO v_total FROM entering_final;

  WITH return_overdue AS (
    UPDATE public.rentals SET status = 'overdue_return'
     WHERE status IN ('active', 'payment_overdue')
       AND return_due_at IS NOT NULL
       AND return_due_at < now()
       AND returned_at IS NULL
     RETURNING id, driver_id
  )
  SELECT v_total + COUNT(*) INTO v_total FROM return_overdue;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_overdue_rentals() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'mark_overdue_rentals_5min';
    PERFORM cron.schedule(
      'mark_overdue_rentals_5min',
      '*/5 * * * *',
      $cron$ SELECT public.mark_overdue_rentals(); $cron$
    );
  END IF;
END $$;