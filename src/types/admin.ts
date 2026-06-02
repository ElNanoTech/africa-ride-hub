export interface AdminPayment {
  id: string;
  amount: number;
  amount_paid: number;
  created_at: string;
  customer_id: string | null;
  driver_id: string;
  due_date: string;
  loan_id: string | null;
  paid_at: string | null;
  paid_date: string | null;
  payment_type: string;
  rental_id: string | null;
  status: string;
  wave_transaction_id: string | null;
  drivers: { full_name: string | null; phone_number: string | null } | null;
  rentals: { vehicles: { model_name: string | null; license_plate: string | null } | null } | null;
  loans: { loan_type: string | null; amount_approved: number | null } | null;
}
