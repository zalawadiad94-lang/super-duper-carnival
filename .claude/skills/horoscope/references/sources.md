# Sources

Read this when fetching a reading. Use two independent sources, then synthesise.

## Choosing two

Pick from different rows — two sites syndicating the same column agree trivially
and tell you nothing. Astrology.com and Horoscope.com are both owned by the same
group but run separate editorial, so they're an acceptable pair; Astrostyle is
independently written and makes the strongest second source.

| Source | Voice | Best for |
|---|---|---|
| Horoscope.com | Short, plain, one paragraph | Fast daily; always has today |
| Astrology.com | Mid-length, practical | Daily, love, work variants |
| Astrostyle.com | Long, warm, specific | Weekly and monthly; richest prose |
| Cafe Astrology | Technical, transit-driven | Explaining *why* — names the aspects |
| The Cut / Elle / Refinery29 | Essayistic, weekly | Weekly, when voice matters more than detail |

## URL patterns

Substitute the lowercase sign slug (`aries` … `pisces`).

```
# Astrology.com — daily / weekly / monthly, plus variants
https://www.astrology.com/horoscope/daily/{sign}.html
https://www.astrology.com/horoscope/daily/love/{sign}.html
https://www.astrology.com/horoscope/weekly/{sign}.html
https://www.astrology.com/horoscope/monthly/{sign}.html

# Astrostyle
https://astrostyle.com/horoscopes/daily/{sign}/
https://astrostyle.com/horoscopes/weekly/{sign}/
https://astrostyle.com/horoscopes/monthly/{sign}/

# Cafe Astrology (daily overview for all signs on one page)
https://cafeastrology.com/todayshoroscope.html

# Horoscope.com — numeric sign id, see table below
https://www.horoscope.com/us/horoscopes/general/horoscope-general-daily-today.aspx?sign={id}
https://www.horoscope.com/us/horoscopes/general/horoscope-general-weekly.aspx?sign={id}
```

Horoscope.com sign ids: Aries 1, Taurus 2, Gemini 3, Cancer 4, Leo 5, Virgo 6,
Libra 7, Scorpio 8, Sagittarius 9, Capricorn 10, Aquarius 11, Pisces 12.

Astrology.com also accepts `?date=tomorrow` and `-yesterday` variants on the
daily path when the user asks ahead or back.

## Birth charts and transits

Chart calculation needs an ephemeris, which this skill doesn't bundle. For
moon/rising/houses, collect birth **date, exact time, and city**, then send the
user to one of these rather than estimating:

```
https://astro.com/cgi/chart.cgi          # Astrodienst — the reference implementation
https://cafeastrology.com/freehoroscopes.html
https://astro-charts.com/
```

For "is Mercury retrograde right now?" and similar dated questions:

```
https://ismercuryinretrograde.com/       # answers yes/no, with dates
https://cafeastrology.com/astrology-of-{year}.html   # full year's transit calendar
https://www.timeanddate.com/moon/phases/ # moon phase, non-astrological but accurate
```

## Reachable via search when direct fetches are blocked

These publish daily columns that surface well in `WebSearch` results, with
enough text in the snippet to build a reading from. Verified reachable this way
from a sandbox that blocked every direct fetch:

```
prokerala.com/astrology/horoscope/?sign={sign}     # general, love, health, career
yahoo.com/lifestyle/horoscope/{sign}/daily-{YYYYMMDD}/
aol.com/horoscopes/daily/{sign}                    # syndicated
yourtango.com                                      # daily tarot + sign
```

A search for `{sign} horoscope {Month D, YYYY}` typically returns several of
these at once, which is a cheap way to get the two independent sources this
skill wants.

## APIs

There's no reliable free horoscope API — the widely-cited ones die often. If a
session's environment blocks web fetches, these sometimes work, but treat a
success as luck and fall back to fetching pages:

```
https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign={Sign}&day=TODAY
https://horoscope-app-api.vercel.app/api/v1/get-horoscope/weekly?sign={Sign}
```

Sandboxed environments with an egress allowlist will refuse these outright (a
403 on CONNECT). That's a blocked host, not a bug to route around — fall back to
`WebFetch`/`WebSearch`, which go through different infrastructure.

## Fetching notes

- These pages are ad-heavy; the reading is usually one block of prose under the
  sign name. Ignore the "your daily lucky number" furniture unless asked.
- Confirm the date on the page matches today before relaying it. Cached or
  stale pages are the quiet failure mode — a reading is worthless if it's
  Tuesday's.
- If a page returns navigation chrome and no reading, it blocked the fetch.
  Move to the next source rather than salvaging fragments.
