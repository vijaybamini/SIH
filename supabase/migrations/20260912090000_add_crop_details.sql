create table public.crop_details (
  id bigint generated always as identity primary key,
  farmer_id uuid not null references public.farmers(profile_id) on delete cascade,
  crop_type text not null,
  specific_crop_type text,
  turnover numeric(14, 2),
  expected_turnover numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crop_details_farmer_id_idx on public.crop_details(farmer_id);

alter table public.crop_details enable row level security;

create policy "Farmers can view their own crop details" on public.crop_details for select using (auth.uid() = farmer_id);
create policy "Farmers can add their own crop details" on public.crop_details for insert with check (auth.uid() = farmer_id);
create policy "Farmers can update their own crop details" on public.crop_details for update using (auth.uid() = farmer_id);
create policy "Farmers can delete their own crop details" on public.crop_details for delete using (auth.uid() = farmer_id);

create function public.create_initial_crop_details()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce((select registration_details ->> 'crop_type' from public.profiles where id = new.profile_id), '') <> '' then
    insert into public.crop_details (farmer_id, crop_type, specific_crop_type, turnover, expected_turnover)
    select
      new.profile_id,
      registration_details ->> 'crop_type',
      registration_details ->> 'specific_crop_type',
      nullif(registration_details ->> 'turnover', '')::numeric,
      nullif(registration_details ->> 'expected_turnover', '')::numeric
    from public.profiles where id = new.profile_id;
  end if;
  return new;
end;
$$;

create trigger on_farmer_created
  after insert on public.farmers
  for each row execute procedure public.create_initial_crop_details();

insert into public.crop_details (farmer_id, crop_type, specific_crop_type, turnover, expected_turnover)
select
  profile_id,
  p.registration_details ->> 'crop_type',
  p.registration_details ->> 'specific_crop_type',
  nullif(p.registration_details ->> 'turnover', '')::numeric,
  nullif(p.registration_details ->> 'expected_turnover', '')::numeric
from public.farmers f
join public.profiles p on p.id = f.profile_id
where coalesce(p.registration_details ->> 'crop_type', '') <> '';
