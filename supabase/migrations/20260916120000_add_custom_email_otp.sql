-- Custom-channel email OTP for login. Supabase's built-in signInWithOtp()
-- sends mail through Supabase's own mailer, which is only reconfigurable by
-- whoever has dashboard access to this project (gated behind Vercel/Supabase
-- account permissions the whole team doesn't have). This lets the AI backend
-- send the code itself (via Resend, using a key any teammate can generate)
-- and verify it independently, only touching Supabase Auth at the very end
-- to mint a real session -- the officially documented pattern for a custom
-- OTP channel (see Supabase's Twilio Verify integration guide for the same
-- shape, adapted here for email).
--
-- Nobody gets RLS access to this table -- it's reachable only through the
-- security-definer RPCs below, so a code's hash is never exposed to any
-- client, and only the AI backend (holding no special privilege beyond the
-- anon key for these calls) can store/check one.
create table public.email_otps (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.email_otps enable row level security;

create or replace function public.email_belongs_to_user(p_email text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists(select 1 from auth.users where email = lower(p_email));
$$;

grant execute on function public.email_belongs_to_user(text) to anon, authenticated;

create or replace function public.store_email_otp(p_email text, p_code_hash text, p_expires_at timestamptz)
returns boolean
language sql
security definer set search_path = public
as $$
  insert into public.email_otps (email, code_hash, expires_at, attempts)
  values (lower(p_email), p_code_hash, p_expires_at, 0)
  on conflict (email) do update
  set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = now();
  select true;
$$;

grant execute on function public.store_email_otp(text, text, timestamptz) to anon, authenticated;

-- Checks the submitted code's hash against the stored one; wrong guesses
-- count against a 5-attempt cap, and the row is consumed (deleted) on
-- either a correct match or once expired/exhausted, so a code is never
-- usable twice and never lingers past its 10-minute window.
create or replace function public.verify_and_consume_email_otp(p_email text, p_code_hash text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.email_otps%rowtype;
begin
  select * into v_row from public.email_otps where email = lower(p_email);
  if not found then
    return false;
  end if;
  if v_row.expires_at < now() or v_row.attempts >= 5 then
    delete from public.email_otps where email = lower(p_email);
    return false;
  end if;
  if v_row.code_hash = p_code_hash then
    delete from public.email_otps where email = lower(p_email);
    return true;
  else
    update public.email_otps set attempts = attempts + 1 where email = lower(p_email);
    return false;
  end if;
end;
$$;

grant execute on function public.verify_and_consume_email_otp(text, text) to anon, authenticated;
