import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today and dates for reminders (3 days ahead, 1 day ahead, and overdue)
    const today = new Date();
    const threeDaysAhead = new Date(today);
    threeDaysAhead.setDate(today.getDate() + 3);
    const oneDayAhead = new Date(today);
    oneDayAhead.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const threeDaysStr = threeDaysAhead.toISOString().split('T')[0];
    const oneDayStr = oneDayAhead.toISOString().split('T')[0];

    console.log(`Checking payments due between ${todayStr} and ${threeDaysStr}`);

    // Get pending payments due within next 3 days
    const { data: upcomingPayments, error: paymentsError } = await supabase
      .from('payments')
      .select('id, driver_id, amount, due_date, payment_type')
      .eq('status', 'pending')
      .lte('due_date', threeDaysStr)
      .gte('due_date', todayStr);

    if (paymentsError) {
      console.error('Error fetching payments:', paymentsError);
      throw paymentsError;
    }

    console.log(`Found ${upcomingPayments?.length || 0} upcoming payments`);

    // Get overdue payments
    const { data: overduePayments, error: overdueError } = await supabase
      .from('payments')
      .select('id, driver_id, amount, due_date, payment_type')
      .eq('status', 'pending')
      .lt('due_date', todayStr);

    if (overdueError) {
      console.error('Error fetching overdue payments:', overdueError);
      throw overdueError;
    }

    console.log(`Found ${overduePayments?.length || 0} overdue payments`);

    const notificationsToCreate: Array<{
      driver_id: string;
      title: string;
      message: string;
      notification_type: string;
    }> = [];

    // Process upcoming payments
    for (const payment of upcomingPayments || []) {
      const dueDate = new Date(payment.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if we already sent a notification today for this payment
      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('driver_id', payment.driver_id)
        .eq('notification_type', 'payment_reminder')
        .gte('created_at', todayStr)
        .like('message', `%${payment.id.substring(0, 8)}%`)
        .maybeSingle();

      if (!existingNotif) {
        const paymentTypeLabel = payment.payment_type === 'rental' ? 'location' : 'prêt';
        
        if (daysUntilDue === 0) {
          notificationsToCreate.push({
            driver_id: payment.driver_id,
            title: 'Paiement dû aujourd\'hui! ⚠️',
            message: `Votre paiement de ${payment.amount.toLocaleString()} FCFA pour votre ${paymentTypeLabel} est dû aujourd'hui. [${payment.id.substring(0, 8)}]`,
            notification_type: 'payment_reminder',
          });
        } else if (daysUntilDue === 1) {
          notificationsToCreate.push({
            driver_id: payment.driver_id,
            title: 'Paiement dû demain',
            message: `Rappel: votre paiement de ${payment.amount.toLocaleString()} FCFA pour votre ${paymentTypeLabel} est dû demain. [${payment.id.substring(0, 8)}]`,
            notification_type: 'payment_reminder',
          });
        } else {
          notificationsToCreate.push({
            driver_id: payment.driver_id,
            title: 'Rappel de paiement',
            message: `Votre paiement de ${payment.amount.toLocaleString()} FCFA pour votre ${paymentTypeLabel} est dû dans ${daysUntilDue} jours. [${payment.id.substring(0, 8)}]`,
            notification_type: 'payment_reminder',
          });
        }
      }
    }

    // Process overdue payments
    for (const payment of overduePayments || []) {
      const dueDate = new Date(payment.due_date);
      const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if we already sent an overdue notification today
      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('driver_id', payment.driver_id)
        .eq('notification_type', 'payment_reminder')
        .gte('created_at', todayStr)
        .like('message', `%${payment.id.substring(0, 8)}%`)
        .maybeSingle();

      if (!existingNotif) {
        const paymentTypeLabel = payment.payment_type === 'rental' ? 'location' : 'prêt';
        
        notificationsToCreate.push({
          driver_id: payment.driver_id,
          title: 'Paiement en retard! 🚨',
          message: `Votre paiement de ${payment.amount.toLocaleString()} FCFA pour votre ${paymentTypeLabel} est en retard de ${daysOverdue} jour(s). Veuillez régulariser votre situation. [${payment.id.substring(0, 8)}]`,
          notification_type: 'payment_reminder',
        });
      }
    }

    // Insert all notifications
    if (notificationsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationsToCreate);

      if (insertError) {
        console.error('Error inserting notifications:', insertError);
        throw insertError;
      }

      console.log(`Created ${notificationsToCreate.length} payment reminder notifications`);
    } else {
      console.log('No new notifications to create');
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationsCreated: notificationsToCreate.length,
        upcomingPayments: upcomingPayments?.length || 0,
        overduePayments: overduePayments?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in payment-reminders function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});