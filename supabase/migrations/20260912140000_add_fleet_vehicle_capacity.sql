alter table public.fleet_vehicles
  add column if not exists vehicle_capacity numeric(12, 2) check (vehicle_capacity >= 0);