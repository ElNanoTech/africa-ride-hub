ALTER TABLE vehicles DROP CONSTRAINT vehicles_vehicle_type_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_vehicle_type_check CHECK (vehicle_type IN ('car', 'bike', 'cargo', 'compact', 'sedan'));