create table public.farmer_bank_details (
  farmer_id uuid primary key references public.farmers(profile_id) on delete cascade,
  account_holder_name text not null,
  account_number text not null,
  ifsc_code text not null,
  branch_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.farmer_bank_details enable row level security;

create policy "Farmers can view their own bank details" on public.farmer_bank_details for select using (auth.uid() = farmer_id);
create policy "Farmers can add their own bank details" on public.farmer_bank_details for insert with check (auth.uid() = farmer_id);
create policy "Farmers can update their own bank details" on public.farmer_bank_details for update using (auth.uid() = farmer_id);
create policy "Farmers can delete their own bank details" on public.farmer_bank_details for delete using (auth.uid() = farmer_id);
