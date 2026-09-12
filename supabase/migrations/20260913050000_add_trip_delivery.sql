-- Closes the loop after a provider accepts a trip: they can mark it
-- delivered, which -- once every trip on an order is delivered -- moves
-- the order itself from 'confirmed' to 'fulfilled'. Provider's own
-- declaration is sufficient for this demo, no separate buyer confirmation
-- step.
alter table public.order_trips
  drop constraint if exists order_trips_assignment_status_check,
  add constraint order_trips_assignment_status_check
    check (assignment_status in ('open', 'accepted', 'delivered'));

alter table public.order_trips
  add column if not exists delivered_at timestamptz;

create or replace function public.mark_trip_delivered(p_order_trip_id bigint, p_provider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_remaining_open int;
begin
  if auth.uid() is null or auth.uid() <> p_provider_id then
    raise exception 'Not authorized to mark this trip delivered.';
  end if;

  update public.order_trips
  set assignment_status = 'delivered', delivered_at = now()
  where id = p_order_trip_id
    and assigned_provider_id = p_provider_id
    and assignment_status = 'accepted'
  returning order_id into v_order_id;

  if v_order_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_your_accepted_trip');
  end if;

  select count(*) into v_remaining_open
  from public.order_trips
  where order_id = v_order_id and assignment_status <> 'delivered';

  if v_remaining_open = 0 then
    update public.orders set status = 'fulfilled' where id = v_order_id;
  end if;

  return jsonb_build_object('success', true, 'order_id', v_order_id, 'order_fulfilled', v_remaining_open = 0);
end;
$$;

grant execute on function public.mark_trip_delivered(bigint, uuid) to authenticated;

-- Lets a logistics provider see their own accepted/delivered jobs (My Jobs
-- list) -- order_trips has no RLS policy granting providers visibility
-- into trips assigned to them (only buyers/contributing farmers could see
-- trips before). Read-only, and scoped to rows already assigned to them.
create policy "Providers can view trips assigned to them"
  on public.order_trips for select
  using (auth.uid() = assigned_provider_id);
