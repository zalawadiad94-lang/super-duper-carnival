#!/usr/bin/env python3
"""Resolve a Western (tropical) zodiac sign from a birth date, and print the
canonical metadata a reading needs: element, modality, ruling planet, date range.

Why this is a script and not a table in SKILL.md: the sign boundaries are fixed
arithmetic, and the cusp cases (a birthday within a day or two of a boundary)
are exactly where hand-reasoning slips. Running this keeps the answer stable.

Usage:
    python3 sign.py 1994-08-08     # ISO date
    python3 sign.py "August 8"     # month + day, year optional
    python3 sign.py leo            # look up metadata for a known sign
    python3 sign.py --list         # every sign with its date range
"""

import argparse
import json
import re
import sys
from datetime import date

# (name, start_month, start_day, element, modality, ruling planet)
# Ranges are the conventional tropical dates. The sun's true ingress drifts by
# up to ~1 day year to year, which is what CUSP_DAYS below accounts for.
# Kept in calendar order so that lookup is a simple descending scan; Capricorn
# is last because its window opens in December and closes the following January.
SIGNS = [
    ("Aquarius",     1, 20, "Air",   "Fixed",    "Uranus (traditionally Saturn)"),
    ("Pisces",       2, 19, "Water", "Mutable",  "Neptune (traditionally Jupiter)"),
    ("Aries",        3, 21, "Fire",  "Cardinal", "Mars"),
    ("Taurus",       4, 20, "Earth", "Fixed",    "Venus"),
    ("Gemini",       5, 21, "Air",   "Mutable",  "Mercury"),
    ("Cancer",       6, 21, "Water", "Cardinal", "the Moon"),
    ("Leo",          7, 23, "Fire",  "Fixed",    "the Sun"),
    ("Virgo",        8, 23, "Earth", "Mutable",  "Mercury"),
    ("Libra",        9, 23, "Air",   "Cardinal", "Venus"),
    ("Scorpio",     10, 23, "Water", "Fixed",    "Pluto (traditionally Mars)"),
    ("Sagittarius", 11, 22, "Fire",  "Mutable",  "Jupiter"),
    ("Capricorn",   12, 22, "Earth", "Cardinal", "Saturn"),
]
CAPRICORN = len(SIGNS) - 1

CUSP_DAYS = 2  # flag birthdays this close to a boundary as uncertain

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _ordered_from(month, day):
    """Index into SIGNS of the sign whose window contains (month, day)."""
    for i in range(len(SIGNS) - 1, -1, -1):
        _, sm, sd, *_ = SIGNS[i]
        if (month, day) >= (sm, sd):
            return i
    # January 1-19 precedes Aquarius, so it belongs to the Capricorn window
    # that opened on December 22 of the previous year.
    return CAPRICORN


def _range_text(i):
    _, sm, sd, *_ = SIGNS[i]
    _, em, ed, *_ = SIGNS[(i + 1) % len(SIGNS)]
    end = date.fromordinal(date(2001, em, ed).toordinal() - 1)
    return f"{date(2001, sm, sd):%B %-d} – {end:%B %-d}"


def _days_to_boundary(month, day, i):
    """Distance in days to the nearer of this sign's two boundaries."""
    ref = 2001  # non-leap reference year; Feb 29 is handled by the caller
    try:
        d = date(ref, month, day)
    except ValueError:
        return CUSP_DAYS + 1
    _, sm, sd, *_ = SIGNS[i]
    _, em, ed, *_ = SIGNS[(i + 1) % len(SIGNS)]
    out = []
    for m, dd in ((sm, sd), (em, ed)):
        b = date(ref, m, dd)
        delta = abs((d - b).days)
        out.append(min(delta, 365 - delta))
    return min(out)


def describe(i, month=None, day=None):
    name, sm, sd, element, modality, ruler = SIGNS[i]
    info = {
        "sign": name,
        "element": element,
        "modality": modality,
        "ruling_planet": ruler,
        "date_range": _range_text(i),
        "slug": name.lower(),
    }
    if month is not None:
        near = _days_to_boundary(month, day, i)
        info["cusp"] = near <= CUSP_DAYS
        if info["cusp"]:
            info["cusp_note"] = (
                f"This birthday sits within {CUSP_DAYS} days of a sign boundary. "
                "The exact sun sign depends on birth year, time, and time zone — "
                "confirm with the person rather than assuming."
            )
    return info


def parse(text):
    """Return (index, month, day). month/day are None for a bare sign name."""
    t = text.strip().lower()

    for i, (name, *_rest) in enumerate(SIGNS):
        if t == name.lower():
            return i, None, None

    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", t)
    if m:
        _, mo, dy = (int(g) for g in m.groups())
    else:
        m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?", t)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            # 8/11 is August 11 to an American and 8 November to everyone else,
            # and the two readings land on different signs. Guessing silently is
            # the worst option here, so only accept the unambiguous cases.
            if a > 12 >= b:
                mo, dy = b, a
            elif b > 12 >= a:
                mo, dy = a, b
            else:
                raise ValueError(
                    f"{text!r} is ambiguous — it could be month/day or day/month, "
                    "which resolve to different signs. Use an ISO date "
                    "(1994-08-11) or a month name ('August 11')."
                )
        else:
            m = re.fullmatch(
                r"([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*\d{4})?", t
            )
            if not m:
                m2 = re.fullmatch(
                    r"(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})"
                    r"(?:,?\s*\d{4})?", t
                )
                if not m2:
                    raise ValueError(
                        f"Could not read {text!r} as a date or a sign name. "
                        "Try an ISO date like 1994-08-08, 'August 8', or 'leo'."
                    )
                dy, mon = int(m2.group(1)), m2.group(2)[:3]
            else:
                mon, dy = m.group(1)[:3], int(m.group(2))
            if mon not in MONTHS:
                raise ValueError(f"Unknown month in {text!r}.")
            mo = MONTHS[mon]

    if not 1 <= mo <= 12:
        raise ValueError(f"Month {mo} out of range in {text!r}.")
    max_day = 29 if mo == 2 else [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
    if not 1 <= dy <= max_day:
        raise ValueError(f"Day {dy} out of range for month {mo} in {text!r}.")

    return _ordered_from(mo, dy), mo, dy


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("value", nargs="?", help="birth date or sign name")
    ap.add_argument("--list", action="store_true", help="print all signs and ranges")
    args = ap.parse_args()

    if args.list:
        print(json.dumps([describe(i) for i in range(len(SIGNS))], indent=2))
        return 0
    if not args.value:
        ap.error("give a birth date, a sign name, or --list")

    try:
        i, mo, dy = parse(args.value)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    print(json.dumps(describe(i, mo, dy), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
