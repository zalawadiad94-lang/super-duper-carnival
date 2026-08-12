"""Credential loading and TOTP generation.

Broker credentials are read from a `.env` file sitting next to the app, so
they can be typed once into a text file instead of being set as system
environment variables — which is awkward on Windows and lost between
sessions. Real environment variables always win, so a server deployment can
ignore the file entirely.

The file is listed in .gitignore. It holds the keys to a trading account and
must never be committed or shared.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import struct
import time
from pathlib import Path

ENV_FILENAME = ".env"


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def load_env_file(path: str | os.PathLike | None = None) -> list[str]:
    """Read KEY=VALUE lines into the environment. Returns the keys loaded.

    Existing environment variables are never overwritten — an explicitly
    exported value should beat a stale line in a file.
    """
    target = Path(path) if path else project_root() / ENV_FILENAME
    if not target.is_file():
        return []

    loaded: list[str] = []
    try:
        lines = target.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return []

    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key or key in os.environ:
            continue
        os.environ[key] = value
        loaded.append(key)

    return loaded


def totp_now(secret: str, digits: int = 6, period: int = 30,
             at: int | None = None) -> str:
    """Generate a time-based one-time password (RFC 6238, SHA-1).

    Angel One requires a fresh 6-digit code on every login. Storing the
    rotating code is useless because it expires in 30 seconds; storing the
    *secret* and deriving the code is what makes an unattended run possible.
    """
    cleaned = "".join(secret.split()).upper().replace("-", "")
    padding = "=" * (-len(cleaned) % 8)
    try:
        key = base64.b32decode(cleaned + padding, casefold=True)
    except (ValueError, TypeError) as exc:
        raise ValueError(
            "TOTP secret is not valid base32. Copy the secret shown when you "
            "enabled TOTP — not the 6-digit code."
        ) from exc

    counter = int((at if at is not None else time.time()) // period)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    truncated = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(truncated % (10 ** digits)).zfill(digits)


def angel_totp() -> str | None:
    """Resolve a usable TOTP code from either the secret or a pasted code."""
    secret = os.environ.get("ANGEL_TOTP_SECRET", "").strip()
    if secret:
        return totp_now(secret)
    code = os.environ.get("ANGEL_TOTP", "").strip()
    return code or None
