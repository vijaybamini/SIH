-- Rebrand: the fallback display name used when a new signup's metadata is
-- missing a first_name (an edge case the app's own registration flow never
-- hits, since it always supplies one) referenced the old "FarmDirect" name.
-- Re-declares handle_new_user() identically to
-- 20260912180000_repair_profile_provider_lifecycle.sql except for that one
-- literal.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  details jsonb := coalesce(new.raw_user_meta_data -> 'registration_details', '{}'::jsonb);
  role_name text := new.raw_user_meta_data ->> 'role';
  first_name text := coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), 'F2C User');
begin
  insert into public.profiles (id, first_name, last_name, phone, role, registration_details)
  values (
    new.id,
    first_name,
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.raw_user_meta_data ->> 'phone',
    role_name,
    details
  )
  on conflict (id) do update set
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    role = coalesce(public.profiles.role, excluded.role),
    registration_details = case
      when public.profiles.registration_details = '{}'::jsonb then excluded.registration_details
      else public.profiles.registration_details
    end;

  case role_name
    when 'farmer' then
      insert into public.farmers (profile_id, farm_name, primary_crops)
      values (
        new.id,
        coalesce(nullif(details ->> 'farm_name', ''), first_name),
        details ->> 'primary_crops'
      )
      on conflict (profile_id) do nothing;

      insert into public.farmer_profiles (farmer_id, aadhaar_number, crop_location, area_of_crop, survey_number)
      values (
        new.id,
        details ->> 'aadhaar_number',
        details ->> 'crop_location',
        nullif(details ->> 'area_of_crop', '')::numeric,
        details ->> 'survey_number'
      )
      on conflict (farmer_id) do nothing;
    when 'buyer' then
      insert into public.bulk_buyers (profile_id, name, address, pincode)
      values (
        new.id,
        coalesce(nullif(details ->> 'name', ''), first_name),
        details ->> 'address',
        details ->> 'pincode'
      )
      on conflict (profile_id) do nothing;
    when 'logistics' then
      insert into public.logistics_providers (profile_id, company_name, service_areas, fleet_details)
      values (
        new.id,
        coalesce(nullif(details ->> 'company_name', ''), first_name, 'Logistics Provider'),
        details ->> 'service_areas',
        details ->> 'fleet_details'
      )
      on conflict (profile_id) do nothing;
    when 'service' then
      insert into public.service_providers (profile_id, business_name, service_areas)
      values (
        new.id,
        coalesce(nullif(details ->> 'business_name', ''), first_name),
        details ->> 'service_areas'
      )
      on conflict (profile_id) do nothing;

      insert into public.service_provider_services (service_provider_id, service_type_id)
      select new.id, id
      from public.service_types
      where slug = coalesce(details ->> 'service_type', 'other')
      on conflict (service_provider_id, service_type_id) do nothing;
  end case;

  return new;
end;
$$;
