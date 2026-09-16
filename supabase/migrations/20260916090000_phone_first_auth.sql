-- Phone-first registration: the register form no longer collects an email
-- (added later in profile completion), so signUp() uses a synthetic
-- placeholder identity of the form "<digits>@phone.farmdirect.internal"
-- built from the phone number. Two things are needed to make that work:
--
-- 1. Auto-confirm those synthetic-email accounts, since a real confirmation
--    email can never be delivered to a fake address -- without this, every
--    phone-first signup would be permanently stuck behind
--    "email not confirmed" and unable to log in.
-- 2. A way to log in with a phone number instead of an email: the frontend
--    resolves phone -> whatever the account's current auth email is (the
--    synthetic one, or a real one if the user has since added one via
--    profile completion) via this RPC, then signs in with that + password.

create or replace function public.autoconfirm_synthetic_phone_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email ilike '%@phone.farmdirect.internal' and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists autoconfirm_synthetic_phone_email on auth.users;
create trigger autoconfirm_synthetic_phone_email
before insert on auth.users
for each row execute function public.autoconfirm_synthetic_phone_email();

create or replace function public.resolve_login_email(p_phone text)
returns text
language sql
security definer set search_path = public
stable
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.phone = p_phone
  limit 1
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
