-- Repair farmer/buyer accounts created before the role-profile trigger
-- created their parent rows -- mirrors 20260912180000 (logistics) and
-- 20260913010000 (service). Without this, an old account hits
-- "farmer_profiles_farmer_id_fkey" (or the equivalent for buyers) the
-- first time it tries to save its profile, because farmer_profiles.farmer_id
-- references farmers.profile_id (bulk_buyers.profile_id similarly
-- references profiles.id), and that parent row was never created.

insert into public.farmers (profile_id, farm_name, primary_crops)
select
  p.id,
  coalesce(
    nullif(p.registration_details ->> 'farm_name', ''),
    nullif(p.first_name, ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Farmer'
  ),
  nullif(p.registration_details ->> 'primary_crops', '')
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'farmer'
on conflict (profile_id) do nothing;

insert into public.bulk_buyers (profile_id, name, address, pincode)
select
  p.id,
  coalesce(
    nullif(p.registration_details ->> 'name', ''),
    nullif(p.first_name, ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Bulk Buyer'
  ),
  nullif(p.registration_details ->> 'address', ''),
  nullif(p.registration_details ->> 'pincode', '')
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'buyer'
on conflict (profile_id) do nothing;
