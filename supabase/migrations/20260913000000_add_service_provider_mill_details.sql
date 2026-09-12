alter table public.service_providers
  add column if not exists email text,
  add column if not exists address text;

create policy "Service providers can add their own record"
  on public.service_providers for insert
  with check (auth.uid() = profile_id);

create table public.service_provider_mills (
  id bigint generated always as identity primary key,
  service_provider_id uuid not null references public.service_providers(profile_id) on delete cascade,
  crop_types text[] not null default '{}',
  gstin text,
  document_url text,
  created_at timestamptz not null default now()
);

alter table public.service_provider_mills enable row level security;

create policy "Service providers can view their own mills"
  on public.service_provider_mills for select
  using (auth.uid() = service_provider_id);

create policy "Service providers can add their own mills"
  on public.service_provider_mills for insert
  with check (auth.uid() = service_provider_id);

create policy "Service providers can update their own mills"
  on public.service_provider_mills for update
  using (auth.uid() = service_provider_id);

create policy "Service providers can delete their own mills"
  on public.service_provider_mills for delete
  using (auth.uid() = service_provider_id);

insert into storage.buckets (id, name, public)
values ('service-docs', 'service-docs', true)
on conflict (id) do nothing;

create policy "Service documents are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'service-docs');

create policy "Service providers can upload their own documents"
  on storage.objects for insert
  with check (bucket_id = 'service-docs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Service providers can update their own documents"
  on storage.objects for update
  using (bucket_id = 'service-docs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Service providers can delete their own documents"
  on storage.objects for delete
  using (bucket_id = 'service-docs' and auth.uid()::text = (storage.foldername(name))[1]);
