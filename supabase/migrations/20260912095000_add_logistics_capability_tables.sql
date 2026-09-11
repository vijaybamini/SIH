create table public.transportation_details (
  logistics_provider_id uuid primary key references public.logistics_providers(profile_id) on delete cascade,
  vehicle_type text not null,
  vehicle_capacity numeric(12, 2) not null check (vehicle_capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_details (
  logistics_provider_id uuid primary key references public.logistics_providers(profile_id) on delete cascade,
  cold_storage_capacity numeric(12, 2) not null check (cold_storage_capacity >= 0),
  location text not null,
  storage_fill_percentage numeric(5, 2) not null default 0 check (storage_fill_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transportation_details enable row level security;
alter table public.inventory_details enable row level security;

create policy "Logistics providers can view their own transportation details" on public.transportation_details for select using (auth.uid() = logistics_provider_id);
create policy "Logistics providers can add their own transportation details" on public.transportation_details for insert with check (auth.uid() = logistics_provider_id);
create policy "Logistics providers can update their own transportation details" on public.transportation_details for update using (auth.uid() = logistics_provider_id);
create policy "Logistics providers can delete their own transportation details" on public.transportation_details for delete using (auth.uid() = logistics_provider_id);
create policy "Logistics providers can view their own inventory details" on public.inventory_details for select using (auth.uid() = logistics_provider_id);
create policy "Logistics providers can add their own inventory details" on public.inventory_details for insert with check (auth.uid() = logistics_provider_id);
create policy "Logistics providers can update their own inventory details" on public.inventory_details for update using (auth.uid() = logistics_provider_id);
create policy "Logistics providers can delete their own inventory details" on public.inventory_details for delete using (auth.uid() = logistics_provider_id);
