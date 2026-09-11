create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  role text check (role in ('farmer', 'buyer', 'logistics', 'service')),
  registration_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.farmers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  farm_name text not null,
  primary_crops text,
  created_at timestamptz not null default now()
);

create table public.bulk_buyers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text not null,
  business_type text,
  gstin text,
  created_at timestamptz not null default now()
);

create table public.logistics_providers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  company_name text not null,
  service_areas text,
  fleet_details text,
  created_at timestamptz not null default now()
);

create table public.service_providers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text not null,
  service_category text,
  service_areas text,
  created_at timestamptz not null default now()
);

create table public.farmer_profiles (
  farmer_id uuid primary key references public.farmers(profile_id) on delete cascade,
  land_details text,
  crop_location text,
  area_of_crop numeric(12, 2),
  survey_number text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.farmers enable row level security;
alter table public.bulk_buyers enable row level security;
alter table public.logistics_providers enable row level security;
alter table public.service_providers enable row level security;
alter table public.farmer_profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Farmers can view their own record" on public.farmers for select using (auth.uid() = profile_id);
create policy "Farmers can update their own record" on public.farmers for update using (auth.uid() = profile_id);
create policy "Bulk buyers can view their own record" on public.bulk_buyers for select using (auth.uid() = profile_id);
create policy "Bulk buyers can update their own record" on public.bulk_buyers for update using (auth.uid() = profile_id);
create policy "Logistics providers can view their own record" on public.logistics_providers for select using (auth.uid() = profile_id);
create policy "Logistics providers can update their own record" on public.logistics_providers for update using (auth.uid() = profile_id);
create policy "Service providers can view their own record" on public.service_providers for select using (auth.uid() = profile_id);
create policy "Service providers can update their own record" on public.service_providers for update using (auth.uid() = profile_id);
create policy "Farmers can view their own land profile" on public.farmer_profiles for select using (auth.uid() = farmer_id);
create policy "Farmers can update their own land profile" on public.farmer_profiles for update using (auth.uid() = farmer_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, role, registration_details)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'role',
    coalesce(new.raw_user_meta_data -> 'registration_details', '{}'::jsonb)
  );
  case new.raw_user_meta_data ->> 'role'
    when 'farmer' then
      insert into public.farmers (profile_id, farm_name, primary_crops)
      values (
        new.id,
        new.raw_user_meta_data -> 'registration_details' ->> 'farm_name',
        new.raw_user_meta_data -> 'registration_details' ->> 'primary_crops'
      );
      insert into public.farmer_profiles (farmer_id, land_details, crop_location, area_of_crop, survey_number)
      values (
        new.id,
        new.raw_user_meta_data -> 'registration_details' ->> 'land_details',
        new.raw_user_meta_data -> 'registration_details' ->> 'crop_location',
        nullif(new.raw_user_meta_data -> 'registration_details' ->> 'area_of_crop', '')::numeric,
        new.raw_user_meta_data -> 'registration_details' ->> 'survey_number'
      );
    when 'buyer' then
      insert into public.bulk_buyers (profile_id, business_name, business_type, gstin)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'business_name', new.raw_user_meta_data -> 'registration_details' ->> 'business_type', new.raw_user_meta_data -> 'registration_details' ->> 'gstin');
    when 'logistics' then
      insert into public.logistics_providers (profile_id, company_name, service_areas, fleet_details)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'company_name', new.raw_user_meta_data -> 'registration_details' ->> 'service_areas', new.raw_user_meta_data -> 'registration_details' ->> 'fleet_details');
    when 'service' then
      insert into public.service_providers (profile_id, business_name, service_category, service_areas)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'business_name', new.raw_user_meta_data -> 'registration_details' ->> 'service_category', new.raw_user_meta_data -> 'registration_details' ->> 'service_areas');
  end case;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
