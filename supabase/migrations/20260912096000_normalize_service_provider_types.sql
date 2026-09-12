create table public.service_types (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null unique
);

create table public.service_provider_services (
  service_provider_id uuid not null references public.service_providers(profile_id) on delete cascade,
  service_type_id bigint not null references public.service_types(id) on delete restrict,
  primary key (service_provider_id, service_type_id)
);

insert into public.service_types (slug, name) values
  ('mill', 'Mill'),
  ('refinery', 'Refinery'),
  ('processing', 'Food processing'),
  ('packaging', 'Packaging'),
  ('grading', 'Grading and sorting'),
  ('testing', 'Quality testing'),
  ('equipment_rental', 'Equipment rental'),
  ('advisory', 'Farm advisory'),
  ('other', 'Other');

alter table public.service_types enable row level security;
alter table public.service_provider_services enable row level security;

create policy "Anyone can view service types" on public.service_types for select using (true);
create policy "Service providers can view their own services" on public.service_provider_services for select using (auth.uid() = service_provider_id);
create policy "Service providers can add their own services" on public.service_provider_services for insert with check (auth.uid() = service_provider_id);
create policy "Service providers can delete their own services" on public.service_provider_services for delete using (auth.uid() = service_provider_id);

insert into public.service_provider_services (service_provider_id, service_type_id)
select sp.profile_id, st.id
from public.service_providers sp
join public.service_types st on st.slug = case lower(coalesce(sp.service_category, ''))
  when 'mill' then 'mill'
  when 'refinery' then 'refinery'
  when 'food processing' then 'processing'
  when 'packaging' then 'packaging'
  when 'grading and sorting' then 'grading'
  when 'quality testing' then 'testing'
  when 'equipment rental' then 'equipment_rental'
  when 'farm advisory' then 'advisory'
  else 'other'
end;

alter table public.service_providers drop column service_category;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, role, registration_details)
  values (new.id, new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'phone', new.raw_user_meta_data ->> 'role', coalesce(new.raw_user_meta_data -> 'registration_details', '{}'::jsonb));

  case new.raw_user_meta_data ->> 'role'
    when 'farmer' then
      insert into public.farmers (profile_id, farm_name, primary_crops)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'farm_name', new.raw_user_meta_data -> 'registration_details' ->> 'primary_crops');
      insert into public.farmer_profiles (farmer_id, aadhaar_number, crop_location, area_of_crop, survey_number)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'aadhaar_number', new.raw_user_meta_data -> 'registration_details' ->> 'crop_location', nullif(new.raw_user_meta_data -> 'registration_details' ->> 'area_of_crop', '')::numeric, new.raw_user_meta_data -> 'registration_details' ->> 'survey_number');
    when 'buyer' then
      insert into public.bulk_buyers (profile_id, name, address, pincode)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'name', new.raw_user_meta_data -> 'registration_details' ->> 'address', new.raw_user_meta_data -> 'registration_details' ->> 'pincode');
    when 'logistics' then
      insert into public.logistics_providers (profile_id, company_name, service_areas, fleet_details)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'company_name', new.raw_user_meta_data -> 'registration_details' ->> 'service_areas', new.raw_user_meta_data -> 'registration_details' ->> 'fleet_details');
    when 'service' then
      insert into public.service_providers (profile_id, business_name, service_areas)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'business_name', new.raw_user_meta_data -> 'registration_details' ->> 'service_areas');
      insert into public.service_provider_services (service_provider_id, service_type_id)
      select new.id, id from public.service_types
      where slug = coalesce(new.raw_user_meta_data -> 'registration_details' ->> 'service_type', 'other');
  end case;
  return new;
end;
$$;
