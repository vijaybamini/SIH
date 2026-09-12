alter table public.crop_details
  add column if not exists land_used numeric(14, 2);

comment on column public.crop_details.land_used is 'Acres of land used for this crop';