"""
Custom email OTP for login, bypassing Supabase's built-in mailer -- which is
only reconfigurable by whoever has dashboard access to this Supabase project
(gated behind Vercel/Supabase account permissions the whole team doesn't
have). Instead, this backend generates and sends the code itself via Resend
(REQUIRES its own RESEND_API_KEY env var, obtained from a free Resend
account -- see .env.example), stores only its hash (via a security-definer
RPC, never a direct table write), and on a verified code uses the Supabase
Admin API to mint a real session for the frontend. This is the officially
documented pattern for a custom OTP channel (Supabase's Twilio Verify guide
describes the same shape for SMS; this is the email equivalent).

REQUIRES SUPABASE_SERVICE_ROLE_KEY (from Supabase dashboard -> Settings ->
API -- the "service_role" secret, NOT the anon/publishable key already used
elsewhere in this file's sibling module). This key bypasses every RLS
policy in the database, so it must only ever live server-side here, never
in frontend code or a committed file.
"""

from __future__ import annotations

import hashlib
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from supabase_integration import _call_rpc, _supabase_config, _load_env_once

OTP_TTL_MINUTES = 10


def _hash_code(email: str, code: str) -> str:
    return hashlib.sha256(f"{email.lower()}:{code}".encode()).hexdigest()


def _send_email(to_email: str, subject: str, html: str, reply_to: Optional[str] = None) -> bool:
    _load_env_once()
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError(
            "RESEND_API_KEY is not set. Sign up free at resend.com, create an "
            "API key, and add it to the repo-root .env.local as RESEND_API_KEY=..."
        )
    from_address = os.environ.get("RESEND_FROM_EMAIL", "FarmDirect <onboarding@resend.dev>")

    payload = {
        "from": from_address,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = reply_to

    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=10,
    )
    if resp.status_code >= 300:
        # Resend's actual reason (e.g. sandbox-mode recipient restriction
        # before a sending domain is verified) never reaches the client --
        # only a generic message does -- so it has to land somewhere, or
        # every failure here means re-running a one-off script to see why.
        print(f"[email_otp] Resend send to {to_email} failed ({resp.status_code}): {resp.text}")
    return resp.status_code < 300


def request_email_otp(email: str) -> None:
    """Sends a 6-digit code to `email`, only if it belongs to an existing
    account (this is a LOGIN path, not signup -- registration stays
    phone-first per the frontend's AuthPanel). Raises ValueError if no
    account has this email, RuntimeError on any send/storage failure."""
    email = email.strip().lower()

    exists = _call_rpc("email_belongs_to_user", {"p_email": email}, timeout=5.0)
    if not exists:
        raise ValueError("No account found with this email.")

    code = f"{random.randint(0, 999999):06d}"
    code_hash = _hash_code(email, code)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()

    stored = _call_rpc("store_email_otp", {
        "p_email": email, "p_code_hash": code_hash, "p_expires_at": expires_at,
    }, timeout=5.0)
    if stored is not True:
        raise RuntimeError("Could not prepare the login code. Try again shortly.")

    html = (
        f"<p>Your FarmDirect login code is:</p>"
        f"<h2 style='letter-spacing:4px'>{code}</h2>"
        f"<p>This code expires in {OTP_TTL_MINUTES} minutes. "
        f"If you didn't request this, you can ignore this email.</p>"
    )
    if not _send_email(email, f"Your FarmDirect login code: {code}", html):
        raise RuntimeError("Could not send the login code email. Try again shortly.")


def verify_email_otp(email: str, code: str) -> str:
    """Verifies a submitted code and, on success, mints a real Supabase
    session token via the Admin API. Returns a token_hash the frontend
    passes to supabase.auth.verifyOtp({token_hash, type: 'email'}) to
    actually sign in. Raises ValueError on a wrong/expired code."""
    email = email.strip().lower()
    code_hash = _hash_code(email, code.strip())

    ok = _call_rpc("verify_and_consume_email_otp", {"p_email": email, "p_code_hash": code_hash}, timeout=5.0)
    if not ok:
        raise ValueError("That code is incorrect or has expired.")

    _load_env_once()
    cfg = _supabase_config()
    if cfg is None:
        raise RuntimeError("Supabase is not configured on the backend.")
    url, _anon_key = cfg
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is not set. Get it from the Supabase "
            "dashboard -> Settings -> API -> service_role secret, and add it "
            "to the repo-root .env.local. Never commit this key or use it in "
            "frontend code."
        )

    resp = requests.post(
        f"{url}/auth/v1/admin/generate_link",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
        json={"type": "magiclink", "email": email},
        timeout=10,
    )
    if resp.status_code >= 300:
        raise RuntimeError("Could not complete login. Try again shortly.")

    data = resp.json()
    token_hash = data.get("hashed_token") or (data.get("properties") or {}).get("hashed_token")
    if not token_hash:
        raise RuntimeError("Could not complete login. Try again shortly.")
    return token_hash


def send_contact_message(name: str, email: str, message: str) -> None:
    """Sends a public Contact Us submission to the support inbox via Resend,
    with reply_to set to the visitor's own email so replying from the inbox
    reaches them directly. Raises RuntimeError on send failure."""
    from html import escape

    inbox = os.environ.get("CONTACT_INBOX_EMAIL", "dhomavivek2005@gmail.com")
    html = (
        f"<p><strong>From:</strong> {escape(name)} &lt;{escape(email)}&gt;</p>"
        f"<p><strong>Message:</strong></p>"
        f"<p>{escape(message).replace(chr(10), '<br>')}</p>"
    )
    if not _send_email(inbox, f"FarmDirect contact form: {name}", html, reply_to=email):
        raise RuntimeError("Could not send your message. Try again shortly.")
