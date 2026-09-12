-- Pre-existing bug, surfaced (not caused) by the new "providers can view
-- their assigned trips" policy: orders and order_allocations' RLS
-- policies reference each other --
--   orders."Farmers can view orders they contributed to" queries order_allocations
--   order_allocations."Buyers can view allocations for their own orders" queries orders
-- Postgres evaluates a referenced table's OWN RLS policies when a policy
-- subqueries it, so this pair is a genuine infinite cycle. It was dormant
-- until now because every write/read of these tables so far went through
-- security-definer RPCs (create_order, list_order_trips, ...) which bypass
-- RLS entirely -- the first real authenticated SELECT that touches this
-- path (a logistics provider's My Jobs list, via order_trips' own
-- farmer/buyer policies) is what triggers it.
--
-- Fix: security-definer helper functions break the cycle. A security
-- definer function's internal table access follows the FUNCTION OWNER's
-- row security, not the caller's -- so calling one of these from inside a
-- policy performs a plain lookup instead of re-entering that table's RLS
-- policies (and looping back).
create or replace function public._order_belongs_to_buyer(p_order_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.orders where id = p_order_id and buyer_id = auth.uid());
$$;

create or replace function public._farmer_has_allocation_in_order(p_order_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.order_allocations where order_id = p_order_id and farmer_id = auth.uid());
$$;

drop policy if exists "Farmers can view orders they contributed to" on public.orders;
create policy "Farmers can view orders they contributed to" on public.orders
  for select using (public._farmer_has_allocation_in_order(id));

drop policy if exists "Buyers can view allocations for their own orders" on public.order_allocations;
create policy "Buyers can view allocations for their own orders" on public.order_allocations
  for select using (public._order_belongs_to_buyer(order_id));

drop policy if exists "Buyers can view trips for their own orders" on public.order_trips;
create policy "Buyers can view trips for their own orders" on public.order_trips
  for select using (public._order_belongs_to_buyer(order_id));

drop policy if exists "Farmers can view trips for orders they contributed to" on public.order_trips;
create policy "Farmers can view trips for orders they contributed to" on public.order_trips
  for select using (public._farmer_has_allocation_in_order(order_id));
