// Statuses that mean a driver or vehicle is currently committed to a rental.
// Shared by AssignVehicleDialog and the drivers list.
export const OPEN_RENTAL_STATUSES = [
  'pending',
  'approved',
  'active',
  'paid',
  'return_pending',
  'overdue_return',
  'payment_overdue',
  'vehicle_disabled',
] as const;
