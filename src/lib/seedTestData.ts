import { supabase } from '@/integrations/supabase/routeClient';

/**
 * Seeds realistic test data for a newly created test driver
 */
export async function seedTestDriverData(driverId: string): Promise<void> {
  try {
    // 1. Find an available vehicle
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, model_name, rent_per_day')
      .eq('status', 'available')
      .limit(1);

    const vehicle = vehicles?.[0];
    if (!vehicle) {
      console.log('[Test Data] No available vehicles to assign');
      return;
    }

    // 2. Create an active rental (started 2 weeks ago)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);

    const { data: rental, error: rentalError } = await supabase
      .from('rentals')
      .insert({
        driver_id: driverId,
        vehicle_id: vehicle.id,
        start_date: startDate.toISOString().split('T')[0],
        status: 'active',
      })
      .select()
      .single();

    if (rentalError) {
      console.error('[Test Data] Error creating rental:', rentalError);
    } else {
      console.log('[Test Data] Created rental:', rental?.id);
    }

    // 3. Create payment history (mix of paid and pending) — daily rentals
    const payments = [];
    const dailyAmount = vehicle.rent_per_day || 7000;

    // Day 7 - Paid
    const day7Due = new Date(startDate);
    day7Due.setDate(day7Due.getDate() + 7);
    payments.push({
      driver_id: driverId,
      rental_id: rental?.id,
      amount: dailyAmount,
      payment_type: 'rental',
      status: 'paid',
      due_date: day7Due.toISOString().split('T')[0],
      paid_date: day7Due.toISOString().split('T')[0],
    });

    // Day 14 - Paid (on time)
    const day14Due = new Date(startDate);
    day14Due.setDate(day14Due.getDate() + 14);
    payments.push({
      driver_id: driverId,
      rental_id: rental?.id,
      amount: dailyAmount,
      payment_type: 'rental',
      status: 'paid',
      due_date: day14Due.toISOString().split('T')[0],
      paid_date: day14Due.toISOString().split('T')[0],
    });

    // Day 17 - Pending (current)
    const day17Due = new Date();
    day17Due.setDate(day17Due.getDate() + 3);
    payments.push({
      driver_id: driverId,
      rental_id: rental?.id,
      amount: dailyAmount,
      payment_type: 'rental',
      status: 'pending',
      due_date: day17Due.toISOString().split('T')[0],
    });

    const { error: paymentsError } = await supabase
      .from('payments')
      .insert(payments);

    if (paymentsError) {
      console.error('[Test Data] Error creating payments:', paymentsError);
    } else {
      console.log('[Test Data] Created', payments.length, 'payments');
    }

    // 4. Create credit score
    const calculationWeek = new Date();
    calculationWeek.setDate(calculationWeek.getDate() - calculationWeek.getDay()); // Start of current week
    
    const { data: creditScore, error: scoreError } = await supabase
      .from('credit_scores')
      .insert({
        driver_id: driverId,
        score: 720,
        tier: 'B', // B tier corresponds to "gold" level (720 points)
        status: 'validated',
        calculation_week: calculationWeek.toISOString().split('T')[0],
        income_data_available: true,
        payment_data_available: true,
        driving_data_available: true,
        income_impact: 25,
        payment_impact: 30,
        driving_impact: 15,
      })
      .select()
      .single();

    if (scoreError) {
      console.error('[Test Data] Error creating credit score:', scoreError);
    } else {
      console.log('[Test Data] Created credit score:', creditScore?.score);
    }

    // 5. Create score breakdowns
    if (creditScore) {
      const breakdowns = [
        { credit_score_id: creditScore.id, factor: 'weekly_income_avg', raw_value: 85000, normalized_value: 0.85, impact_points: 25, weight_applied: 0.30 },
        { credit_score_id: creditScore.id, factor: 'payment_streak', raw_value: 2, normalized_value: 1.0, impact_points: 30, weight_applied: 0.35 },
        { credit_score_id: creditScore.id, factor: 'trip_consistency', raw_value: 0.9, normalized_value: 0.9, impact_points: 15, weight_applied: 0.15 },
        { credit_score_id: creditScore.id, factor: 'driving_behavior', raw_value: 0.8, normalized_value: 0.8, impact_points: 20, weight_applied: 0.20 },
      ];

      const { error: breakdownError } = await supabase
        .from('credit_score_breakdowns')
        .insert(breakdowns);

      if (breakdownError) {
        console.error('[Test Data] Error creating breakdowns:', breakdownError);
      }
    }

    // 6. Create income records (last 2 weeks)
    const incomeRecords = [];
    for (let i = 13; i >= 0; i--) {
      const recordDate = new Date();
      recordDate.setDate(recordDate.getDate() - i);
      
      // Skip if weekend (less driving)
      const dayOfWeek = recordDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      const baseIncome = isWeekend ? 8000 : 15000;
      const variance = Math.floor(Math.random() * 5000) - 2500;
      
      incomeRecords.push({
        driver_id: driverId,
        record_date: recordDate.toISOString().split('T')[0],
        gross_income: baseIncome + variance,
        net_income: Math.floor((baseIncome + variance) * 0.8),
        trip_count: isWeekend ? Math.floor(Math.random() * 10) + 5 : Math.floor(Math.random() * 15) + 15,
        source: 'yango',
      });
    }

    const { error: incomeError } = await supabase
      .from('income_records')
      .insert(incomeRecords);

    if (incomeError) {
      console.error('[Test Data] Error creating income records:', incomeError);
    } else {
      console.log('[Test Data] Created', incomeRecords.length, 'income records');
    }

    // 7. Create a welcome notification
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        driver_id: driverId,
        notification_type: 'system',
        title: 'Bienvenue sur DAM Flotte! 🎉',
        message: 'Votre compte test a été créé avec des données de démonstration. Explorez toutes les fonctionnalités!',
        is_read: false,
      });

    if (notifError) {
      console.error('[Test Data] Error creating notification:', notifError);
    }

    // 8. Update driver's active vehicle
    await supabase
      .from('drivers')
      .update({ 
        active_vehicle_id: vehicle.id,
        kyc_status: 'approved', // Pre-approve KYC for testing
      })
      .eq('id', driverId);

    console.log('[Test Data] ✅ Test data seeding complete for driver:', driverId);
  } catch (error) {
    console.error('[Test Data] Error seeding test data:', error);
  }
}
