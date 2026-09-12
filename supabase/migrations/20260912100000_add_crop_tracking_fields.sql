alter table public.crop_details
  add column planted_date date,
  add column expected_harvest_date date,
  add column harvested boolean;

create policy "Farmers can create their own land profile"
  on public.farmer_profiles for insert
  with check (auth.uid() = farmer_id);
