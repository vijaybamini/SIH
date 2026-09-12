-- Ensure service accounts created before the service profile flow was complete
-- have the parent rows required by the service-provider details form.
insert into public.service_providers (profile_id, business_name, service_areas, email)
select
  p.id,
  coalesce(
    nullif(p.registration_details ->> 'business_name', ''),
    nullif(p.first_name, ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Service Provider'
  ),
  nullif(p.registration_details ->> 'service_areas', ''),
  nullif(u.email, '')
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'service'
on conflict (profile_id) do nothing;

-- Give legacy service providers the default service type when the signup
-- trigger could not create the association.
insert into public.service_provider_services (service_provider_id, service_type_id)
select sp.profile_id, st.id
from public.service_providers sp
cross join public.service_types st
where st.slug = 'other'
  and not exists (
    select 1
    from public.service_provider_services sps
    where sps.service_provider_id = sp.profile_id
  )
on conflict (service_provider_id, service_type_id) do nothing;
