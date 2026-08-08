#!/usr/bin/env python3
"""Compute a natal chart — Western (tropical) and Vedic (sidereal) side by side.

Sun sign alone comes from `sign.py` and needs only a birth date. Everything
else — moon sign, ascendant, house placements, nakshatra, dasha — depends on
birth time and place, and needs real ephemeris data. Estimating those produces
a chart that is confidently wrong in every house, so compute them here instead.

Requires: pip install pyswisseph

Usage:
    python3 chart.py --date 1997-06-21 --time 08:00 --tz 5.5 \
                     --lat 21.5222 --lon 70.4579
    python3 chart.py --date 1997-06-21 --time 08:00 --city junagadh
    python3 chart.py ... --json          # machine-readable

Latitude is + north, longitude is + east, tz is the UTC offset in hours at the
birth moment (historic DST is the caller's problem — check it for US/EU births
before 2000; India has never used DST).
"""

import argparse
import json
import sys

try:
    import swisseph as swe
except ImportError:
    sys.exit("pyswisseph is required:  pip install pyswisseph")

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
         "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]

RASHI = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula",
         "Vrischika", "Dhanu", "Makara", "Kumbha", "Meena"]

NAKSHATRA = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada",
    "Revati",
]

# Vimshottari: the nine dasha lords in order, with their period lengths in years.
DASHA = [("Ketu", 7), ("Venus", 20), ("Sun", 6), ("Moon", 10), ("Mars", 7),
         ("Rahu", 18), ("Jupiter", 16), ("Saturn", 19), ("Mercury", 17)]

BODIES = [("Sun", swe.SUN), ("Moon", swe.MOON), ("Mercury", swe.MERCURY),
          ("Venus", swe.VENUS), ("Mars", swe.MARS), ("Jupiter", swe.JUPITER),
          ("Saturn", swe.SATURN), ("Uranus", swe.URANUS),
          ("Neptune", swe.NEPTUNE), ("Pluto", swe.PLUTO)]

ASPECTS = [("conjunction", 0, 8), ("opposition", 180, 8), ("trine", 120, 7),
           ("square", 90, 7), ("sextile", 60, 5)]

# A few common birth cities, so the usual cases don't need a lookup.
CITIES = {
    "junagadh": (21.5222, 70.4579, 5.5), "ahmedabad": (23.0225, 72.5714, 5.5),
    "mumbai": (19.0760, 72.8777, 5.5), "delhi": (28.6139, 77.2090, 5.5),
    "bengaluru": (12.9716, 77.5946, 5.5), "chennai": (13.0827, 80.2707, 5.5),
    "kolkata": (22.5726, 88.3639, 5.5), "hyderabad": (17.3850, 78.4867, 5.5),
    "pune": (18.5204, 73.8567, 5.5), "jaipur": (26.9124, 75.7873, 5.5),
    "surat": (21.1702, 72.8311, 5.5), "rajkot": (22.3039, 70.8022, 5.5),
    "london": (51.5074, -0.1278, 0.0), "new york": (40.7128, -74.0060, -5.0),
}

DEG = 30.0
NAK_SPAN = 360.0 / 27      # 13°20'
PADA_SPAN = NAK_SPAN / 4   # 3°20'


def dms(lon):
    """Format an absolute ecliptic longitude as degrees within its sign.

    Arcminutes are truncated rather than rounded, which is what chart software
    conventionally does and avoids rounding 23°59.7' up to a nonsense "23°60'"
    — or worse, carrying 29°59.7' over a sign boundary it hasn't crossed.
    """
    d = lon % DEG
    return f"{int(d)}°{int((d % 1) * 60):02d}'"


def sign_of(lon):
    return int(lon // DEG) % 12


def nakshatra_of(lon):
    i = int(lon // NAK_SPAN) % 27
    pada = int((lon - i * NAK_SPAN) // PADA_SPAN) + 1
    return NAKSHATRA[i], pada, i


def house_of(lon, cusps):
    for i in range(12):
        a, b = cusps[i], cusps[(i + 1) % 12]
        if (a <= lon < b) if a <= b else (lon >= a or lon < b):
            return i + 1
    return None


def aspects_between(pos):
    found = []
    keys = list(pos)
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = keys[i], keys[j]
            sep = abs(pos[a] - pos[b]) % 360
            if sep > 180:
                sep = 360 - sep
            for name, angle, orb in ASPECTS:
                if abs(sep - angle) <= orb:
                    found.append({"a": a, "b": b, "aspect": name,
                                  "orb": round(abs(sep - angle), 2)})
    return sorted(found, key=lambda x: x["orb"])


def vimshottari(moon_sidereal, birth_year_frac, count=6):
    """Vimshottari dasha sequence, seeded by the moon's nakshatra position.

    The birth period is entered partway through, in proportion to how far the
    moon has travelled into its nakshatra — that remainder is the 'balance'.
    """
    _, _, ni = nakshatra_of(moon_sidereal)
    idx = ni % 9
    travelled = (moon_sidereal % NAK_SPAN) / NAK_SPAN
    balance = DASHA[idx][1] * (1 - travelled)

    out = [{"lord": DASHA[idx][0], "start": None, "end": round(birth_year_frac + balance, 2),
            "balance_years": round(balance, 2)}]
    t = birth_year_frac + balance
    for k in range(1, count):
        lord, yrs = DASHA[(idx + k) % 9]
        out.append({"lord": lord, "start": round(t, 2), "end": round(t + yrs, 2)})
        t += yrs
    return out


def compute(date, time_str, tz, lat, lon):
    y, m, d = (int(x) for x in date.split("-"))
    hh, mm = (int(x) for x in time_str.split(":"))
    ut = hh + mm / 60 - tz
    jd = swe.julday(y, m, d, ut)

    cusps, ascmc = swe.houses(jd, lat, lon, b"P")
    asc, mc = ascmc[0], ascmc[1]

    swe.set_sid_mode(swe.SIDM_LAHIRI)
    ayanamsa = swe.get_ayanamsa_ut(jd)

    tropical, sidereal, pos = {}, {}, {}
    for name, body in BODIES + [("Rahu", swe.TRUE_NODE)]:
        x, _ = swe.calc_ut(jd, body)
        l, speed = x[0], x[3]
        pos[name] = l
        sid = (l - ayanamsa) % 360
        nak, pada, _ = nakshatra_of(sid)
        tropical[name] = {"lon": round(l, 4), "sign": SIGNS[sign_of(l)],
                          "deg": dms(l), "house": house_of(l, cusps),
                          "retrograde": speed < 0}
        sidereal[name] = {"lon": round(sid, 4), "rashi": RASHI[sign_of(sid)],
                          "sign": SIGNS[sign_of(sid)], "deg": dms(sid),
                          "nakshatra": nak, "pada": pada}
        if name == "Rahu":
            ketu = (l + 180) % 360
            ks = (ketu - ayanamsa) % 360
            kn, kp, _ = nakshatra_of(ks)
            tropical["Ketu"] = {"lon": round(ketu, 4), "sign": SIGNS[sign_of(ketu)],
                                "deg": dms(ketu), "house": house_of(ketu, cusps),
                                "retrograde": True}
            sidereal["Ketu"] = {"lon": round(ks, 4), "rashi": RASHI[sign_of(ks)],
                                "sign": SIGNS[sign_of(ks)], "deg": dms(ks),
                                "nakshatra": kn, "pada": kp}

    pos["ASC"], pos["MC"] = asc, mc
    sid_asc = (asc - ayanamsa) % 360
    moon_sid = sidereal["Moon"]["lon"]
    nak, pada, _ = nakshatra_of(moon_sid)

    return {
        "input": {"date": date, "time": time_str, "tz": tz, "lat": lat, "lon": lon,
                  "ut_hours": round(ut, 3), "julian_day": jd},
        "western": {
            "sun_sign": tropical["Sun"]["sign"],
            "moon_sign": tropical["Moon"]["sign"],
            "ascendant": {"sign": SIGNS[sign_of(asc)], "deg": dms(asc)},
            "midheaven": {"sign": SIGNS[sign_of(mc)], "deg": dms(mc)},
            "houses": [{"house": i + 1, "sign": SIGNS[sign_of(c)], "deg": dms(c)}
                       for i, c in enumerate(cusps[:12])],
            "placements": tropical,
            "aspects": aspects_between(pos),
        },
        "vedic": {
            "ayanamsa_lahiri": round(ayanamsa, 4),
            "rashi_moon_sign": RASHI[sign_of(moon_sid)],
            "rashi_western_name": SIGNS[sign_of(moon_sid)],
            "nakshatra": nak, "pada": pada,
            "lagna": {"rashi": RASHI[sign_of(sid_asc)],
                      "sign": SIGNS[sign_of(sid_asc)], "deg": dms(sid_asc)},
            "sun_rashi": RASHI[sign_of(sidereal["Sun"]["lon"])],
            "placements": sidereal,
            "dasha": vimshottari(moon_sid, y + (m - 1) / 12 + d / 365.25),
        },
    }


def render(c):
    w, v = c["western"], c["vedic"]
    L = []
    L.append("=== WESTERN (tropical, Placidus) ===")
    L.append(f"  Sun {w['placements']['Sun']['deg']} {w['sun_sign']}   "
             f"Moon {w['placements']['Moon']['deg']} {w['moon_sign']}   "
             f"ASC {w['ascendant']['deg']} {w['ascendant']['sign']}")
    L.append("")
    for n, p in w["placements"].items():
        L.append(f"  {n:8s} {p['deg']:>7s} {p['sign']:<12s} house {p['house']:<3}"
                 f"{' R' if p['retrograde'] else ''}")
    L.append("\n  Tightest aspects:")
    for a in w["aspects"][:6]:
        L.append(f"    {a['a']:8s} {a['aspect']:12s} {a['b']:8s} orb {a['orb']}°")

    L.append(f"\n=== VEDIC (sidereal, Lahiri ayanamsa {v['ayanamsa_lahiri']}°) ===")
    L.append(f"  Rashi (moon sign): {v['rashi_moon_sign']} ({v['rashi_western_name']})"
             f"   <- what 'my sign' usually means in India")
    L.append(f"  Nakshatra: {v['nakshatra']} pada {v['pada']}")
    L.append(f"  Lagna: {v['lagna']['rashi']} ({v['lagna']['sign']}) {v['lagna']['deg']}")
    L.append("")
    for n, p in v["placements"].items():
        L.append(f"  {n:8s} {p['deg']:>7s} {p['rashi']:<10s} {p['nakshatra']:<18s} "
                 f"pada {p['pada']}")
    L.append("\n  Vimshottari dasha:")
    for d in v["dasha"]:
        start = f"{d['start']:.2f}" if d["start"] else "birth"
        L.append(f"    {d['lord']:8s} {start:>7s} -> {d['end']:.2f}")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", required=True, help="birth date, YYYY-MM-DD")
    ap.add_argument("--time", required=True, help="local birth time, HH:MM (24h)")
    ap.add_argument("--city", help=f"known city: {', '.join(sorted(CITIES))}")
    ap.add_argument("--lat", type=float, help="latitude, + north")
    ap.add_argument("--lon", type=float, help="longitude, + east")
    ap.add_argument("--tz", type=float, help="UTC offset in hours at birth")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    if a.city:
        key = a.city.strip().lower()
        if key not in CITIES:
            ap.error(f"unknown city {a.city!r}; pass --lat/--lon/--tz instead")
        lat, lon, tz = CITIES[key]
        if a.tz is not None:
            tz = a.tz
    else:
        if a.lat is None or a.lon is None or a.tz is None:
            ap.error("give --city, or all of --lat --lon --tz")
        lat, lon, tz = a.lat, a.lon, a.tz

    c = compute(a.date, a.time, tz, lat, lon)
    print(json.dumps(c, indent=2) if a.json else render(c))
    return 0


if __name__ == "__main__":
    sys.exit(main())
