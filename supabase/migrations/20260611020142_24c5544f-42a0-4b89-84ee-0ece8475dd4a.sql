ALTER TABLE public.maintenance_orders
  ADD CONSTRAINT maintenance_orders_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE public.other_charges
  ADD CONSTRAINT other_charges_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';