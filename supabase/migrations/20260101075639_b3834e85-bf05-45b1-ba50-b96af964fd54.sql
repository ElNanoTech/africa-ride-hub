-- Enable realtime for admin dashboard tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rentals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kyc_submissions;