-- A trip currently gets a payout notification broadcast to every matching
-- provider (see logistics_matching.py), but nothing records which one --
-- if any -- actually takes the job, and nothing stops two providers from
-- both believing they got it. This adds "first to accept wins" semantics.
alter table public.order_trips
  add column if not exists assignment_status text not null default 'open'
    check (assignment_status in ('open', 'accepted')),
  add column if not exists assigned_provider_id uuid references public.logistics_providers(profile_id),
  add column if not exists accepted_at timestamptz;

-- Lets the AI backend (anon key, no session) learn the REAL database ids of
-- the trip rows create_order() just inserted, in the same order it inserted
-- them -- needed so a payout notification can reference a specific
-- order_trips row (for accept_trip_offer below) instead of just a
-- positional index into the original request payload.
create or replace function public.list_order_trips(p_order_id bigint)
returns table (
  id bigint,
  vehicle_class text,
  total_weight_kg numeric,
  distance_km numeric,
  cost numeric,
  stops jsonb,
  assignment_status text
)
language sql
security definer
set search_path = public
stable
as $$
  select id, vehicle_class, total_weight_kg, distance_km, cost, stops, assignment_status
  from public.order_trips
  where order_id = p_order_id
  order by id asc;
$$;

grant execute on function public.list_order_trips(bigint) to anon, authenticated;

-- Called directly by the logistics provider's own authenticated session
-- (not the Python backend) when they tap "Accept" on a job notification.
-- security definer only to bypass order_trips' buyer/farmer-only SELECT/no
-- write policies -- auth.uid() is still checked explicitly below, so a
-- provider can only ever accept on their own behalf.
create or replace function public.accept_trip_offer(p_order_trip_id bigint, p_provider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
begin
  if auth.uid() is null or auth.uid() <> p_provider_id then
    raise exception 'Not authorized to accept on behalf of this provider.';
  end if;

  update public.order_trips
  set assignment_status = 'accepted', assigned_provider_id = p_provider_id, accepted_at = now()
  where id = p_order_trip_id and assignment_status = 'open'
  returning order_id into v_order_id;

  if v_order_id is null then
    return jsonb_build_object('success', false, 'reason', 'already_accepted');
  end if;

  return jsonb_build_object('success', true, 'order_id', v_order_id, 'order_trip_id', p_order_trip_id);
end;
$$;

grant execute on function public.accept_trip_offer(bigint, uuid) to authenticated;
