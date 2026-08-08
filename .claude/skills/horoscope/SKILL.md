---
name: horoscope
description: Fetches real daily, weekly, or monthly horoscope readings from live astrology sites, computes accurate natal charts from birth date/time/place, and answers astrology questions in both the Western and Vedic (jyotish) traditions — sun/moon/rising, houses and aspects, compatibility, and Indian-system rashi, nakshatra, lagna, kundli, and Vimshottari dasha. Use this skill whenever the user mentions their horoscope, star sign, zodiac sign, rashi or birth chart, asks "what do the stars say", wants a reading for today or the week ahead, asks whether two signs are compatible, asks what a placement, dasha, or transit means, or mentions astrology in any form — including casual asides like "typical Scorpio" or "is Mercury still retrograde?" Use it even when they don't say the word "horoscope", and use it rather than answering from memory, because readings change daily and chart positions must be computed rather than recalled.
---

# Horoscope & astrology

Two kinds of request land here, and they need different handling:

- **A reading** — "what's my horoscope today?" This is dated content that changes
  daily. It has to be fetched. See *Delivering a reading*.
- **An astrology question** — "what does a Virgo rising mean?", "are we
  compatible?", "is Mercury retrograde?" This is interpretive knowledge, not
  dated content. See *Answering astrology questions*.

Many requests are both. "What's my horoscope, and why do I keep clashing with my
Aries boss?" wants a fetched reading plus an interpretation.

## The one rule that matters most

**Never write a horoscope yourself.** A reading you invent reads exactly like a
real one — same warm, plausible, slightly vague register — which means the user
has no way to tell they're being handed fiction. That is the failure mode this
skill exists to prevent. If the fetch fails, say so plainly and offer options.
Astrology's own claims are the user's business; silently fabricating the source
is yours, and it's the one thing that makes this skill worse than useless.

The same goes for a reading you fetched yesterday, or one you half-remember from
training. Today's reading exists only on today's page.

## "My sign" is ambiguous — find out which one they mean

Western astrology means the **sun** sign. Vedic astrology (jyotish), which is
the default across India, means the **moon** sign — the *rashi*. Same birth
data, two different answers, and for most people they're different signs.

This matters more than it sounds. Someone born 21 June 1997 in Gujarat is a
Gemini by western reckoning and Dhanu (Sagittarius) by rashi. Tell them they're
"actually" a Gemini and you've contradicted what their family, their local
astrologer, and every Indian newspaper column have told them their whole life —
and you're the one who's wrong, because they were answering a different
question. The two systems are separate maps, not competing claims.

So when someone states a sign that doesn't match what you'd compute:

- **Don't correct them.** Work out which system makes their answer true —
  usually their rashi. Run `scripts/chart.py` and check.
- If the numbers line up, say so directly: their sign is right, and here's the
  system it belongs to.
- Ask which tradition they want when it's genuinely unclear, especially for
  users in India or the wider South Asian diaspora. Matchmaking, muhurta, and
  temple readings are always Vedic; a horoscope app is western.

Where the systems agree — often the ascendant — say so. It's reassuring and
it's true.

## Resolving the sign

Work down this list and stop at the first that gives an answer:

1. **Config** — read `config.json` next to this skill if present (copy
   `assets/config.example.json` to create one). It holds a default sign and
   optionally other people to read for.
2. **The conversation** — they may have already said their sign or birthday.
3. **A birth date** — run the bundled resolver rather than working it out by
   hand, since the boundaries are fiddly and the cusp cases are where reasoning
   slips:

   ```bash
   python3 scripts/sign.py 1994-08-08     # ISO, "August 8", "3rd of May", or "leo"
   python3 scripts/sign.py --list         # all twelve with date ranges
   ```

   It returns the sign plus element, modality, ruling planet, and date range —
   useful context for the reading. When it reports `cusp: true`, the birthday is
   within two days of a boundary and the true sign depends on birth year and
   time; say so and ask rather than picking one.
4. **Ask.** One short question — "what's your sign?" — not a form.

If the user names a sign directly, take it and don't interrogate them about
birth dates.

## Delivering a reading

Fetch from **two independent sources** and read both before writing anything.
`references/sources.md` has the working URL patterns, per-sign identifiers, and
what each site is good for — read it when fetching.

`WebFetch` on two of those URLs is the best path, since you get the full column.
But some environments run an egress allowlist that blocks astrology sites
outright — an `EGRESS_BLOCKED` error, or a 403 on CONNECT from `curl`. That's a
network policy, not a flaky site, so **don't work down the source list retrying
it**; every host will fail the same way. Switch straight to `WebSearch` for
`<sign> horoscope <today's date>`, which reaches different infrastructure and
returns enough reading text from the result snippets to work with. Say which
route you used in the source line, and don't route around a blocked host.

Two sources matter because
any single daily horoscope is one writer's improvisation; where two independently
land on the same theme, that's the part actually worth relaying, and where they
diverge, saying so is more honest and more interesting than picking one.

Present it in this shape:

```
## <Sign> — <weekday, date>
<element · modality · ruled by X>

<The reading itself: 2-4 short paragraphs, synthesised from the sources.
Write it as prose, in the second person, the way a horoscope column reads.>

**Where the sources agree:** <the shared theme, one line>
**Where they differ:** <only if they meaningfully do — otherwise drop this line>

<Sources: site names, linked>
```

On tone: play it straight. The user asked for a horoscope, so give them one
that's fun to read — warm, specific, a little evocative. Hedging every sentence
with "astrology isn't scientifically supported" is patronising and makes the
output worthless to someone who just wants their reading. One quiet source line
at the bottom does all the honesty work needed, because it shows exactly where
the words came from. Don't editorialise about whether astrology is real unless
the user actually asks what you think.

Never sand a reading down because it's gloomy. If the sources say it's a rough
week for money, relay that — softening it is a different kind of fabrication.
But don't extend a downbeat reading into health, death, or financial advice the
sources didn't make; if a reading edges that way, relay it and stop there.

**Weekly and monthly** work the same way, with the horizon swapped. Match the
period the user asked for; if they said "this week", don't hand them today.

**Several people at once** — a shared reading for a couple, a household, a team
— fetch each sign, keep each one short, and add a line at the end on how the
week's themes interact. Don't pad twelve signs to equal length.

### When the fetch fails

Sites go down, block automated fetches, or move their markup. When you can't get
a real reading:

1. If the failure was site-specific (a 404, a page of navigation chrome, a
   timeout), try the next source in `references/sources.md`.
2. If it was an egress block, or if a second site fails too, go to `WebSearch`
   as described above — syndicated columns are widely republished, and search
   snippets usually carry the reading itself.
3. If even search comes back empty, say so plainly: *"I couldn't reach a live
   horoscope source just now — astrology.com and astrostyle are both blocked
   from this environment, and search didn't turn up today's column."* Offer to
   retry, or to talk through what the current transits mean for their sign —
   which is interpretive, needs no fetch, and is honestly a different thing.

Do not fill the gap with your own writing, and do not present option 3 as if it
were the reading.

## Answering astrology questions

These don't need a fetch — they need the interpretive vocabulary.
`references/astrology.md` covers the western system: placements, houses,
aspects, compatibility, transits. `references/vedic.md` covers jyotish — rashi,
nakshatra and pada, lagna, the ayanamsa, and Vimshottari dasha. Read whichever
matches the tradition the user is working in, and both when they want the
comparison. Answer from within the tradition: explain what
astrologers mean by a thing, confidently and specifically, the way you'd explain
any other system of ideas. "Saturn return" has a real, teachable meaning.

Two places to be straight with the user:

- **Moon and rising signs need an exact birth time and place**, not just a date.
  Sun sign is the only one a birthday alone determines. Collect date, time, and
  city, then compute — never estimate. A guessed ascendant misplaces all twelve
  houses, so it isn't a rough answer, it's a different chart:

  ```bash
  pip install pyswisseph          # once
  python3 scripts/chart.py --date 1997-06-21 --time 08:00 --city junagadh
  python3 scripts/chart.py --date 1990-02-03 --time 14:20 \
          --lat 51.5074 --lon -0.1278 --tz 0    # any location
  ```

  It prints both systems at once: western placements by house with aspects and
  orbs, and the Vedic side — rashi, nakshatra and pada, lagna, and the
  Vimshottari dasha timeline. `--json` for structured output. If the user has
  no birth time, say which parts of the chart that rules out rather than
  quietly filling them in; noon is a common convention but the ascendant it
  produces is meaningless.
- **Current transits are dated facts** — whether Mercury is retrograde *right
  now*, where the moon is today. Look those up rather than recalling them; your
  training data has a cutoff and the sky doesn't.

## Where this skill stops

Horoscopes are entertainment, and read that way they're harmless. When a request
turns on a real decision with real consequences — whether to take the job, leave
the relationship, have the surgery, make the trade — give the reading if that's
what was asked for, then be a person about it: the stars aren't load-bearing for
that choice, and you're glad to help think it through on its own terms. Say it
once, kindly, without a lecture.

If someone appears to be in genuine distress and is looking to the reading for
an answer, drop the format entirely and respond to the person.
