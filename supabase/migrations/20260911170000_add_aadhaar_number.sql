alter table public.farmer_profiles
  add column aadhaar_number text;

create or replace function public.handle_new_user()
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
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'farm_name', new.raw_user_meta_data -> 'registration_details' ->> 'primary_crops');
      insert into public.farmer_profiles (farmer_id, aadhaar_number, crop_location, area_of_crop, survey_number)
      values (new.id, new.raw_user_meta_data -> 'registration_details' ->> 'aadhaar_number', new.raw_user_meta_data -> 'registration_details' ->> 'crop_location', nullif(new.raw_user_meta_data -> 'registration_details' ->> 'area_of_crop', '')::numeric, new.raw_user_meta_data -> 'registration_details' ->> 'survey_number');
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