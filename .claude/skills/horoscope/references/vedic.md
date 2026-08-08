# Vedic astrology (jyotish)

Read this when the user is working in the Indian system — or when they state a
sign that doesn't match a western calculation, which usually means they're
telling you their rashi.

Compute everything here with `scripts/chart.py`; none of it can be recalled
accurately, and the nakshatra/pada boundaries in particular are narrow enough
that arithmetic by hand goes wrong.

## The core difference

Western astrology uses the **tropical** zodiac, anchored to the equinox. Vedic
uses the **sidereal** zodiac, anchored to the fixed stars. The two drifted
apart over centuries and now differ by the **ayanamsa** — about **24°** today
(Lahiri, the Indian government standard).

24° is most of a sign. So a chart converted from one system to the other
usually moves nearly every planet back one sign. Neither is a mistake; they
measure from different starting points.

The second difference matters just as much: **"my sign" means the moon sign in
India**, not the sun sign. Newspaper columns, matchmaking, and temple readings
all use the rashi.

## Rashi (moon sign)

The sign the moon occupied at birth, in the sidereal zodiac. It needs a birth
time — the moon moves through a sign in about 2¼ days, so a date alone leaves
real ambiguity.

| Rashi | Western | Rashi | Western |
|---|---|---|---|
| Mesha | Aries | Tula | Libra |
| Vrishabha | Taurus | Vrischika | Scorpio |
| Mithuna | Gemini | Dhanu | Sagittarius |
| Karka | Cancer | Makara | Capricorn |
| Simha | Leo | Kumbha | Aquarius |
| Kanya | Virgo | Meena | Pisces |

**Lagna** is the ascendant — the rising sign, and the chart's anchor. Vedic
practice reads the whole chart from the lagna, so it carries more weight than
the western ascendant does.

## Nakshatra

The 27 lunar mansions, each 13°20′ wide, subdivided into four **padas** of
3°20′. The moon's nakshatra is the most personal point in a Vedic chart — it
seeds the dasha timeline, and traditionally guides naming and matchmaking.

Each has a ruling planet, cycling Ketu → Venus → Sun → Moon → Mars → Rahu →
Jupiter → Saturn → Mercury, three times through the 27.

A few that come up often:
- **Ashwini** (Ketu) — speed, healing, beginnings
- **Rohini** (Moon) — beauty, fertility, material comfort
- **Mrigashira** (Mars) — searching, curiosity, restlessness
- **Ardra** (Rahu) — storm, upheaval, breakthrough after difficulty
- **Pushya** (Saturn) — nourishment, the most auspicious for most purposes
- **Magha** (Ketu) — ancestry, throne, inherited authority
- **Chitra** (Mars) — craft, design, brilliance
- **Anuradha** (Saturn) — friendship, devotion, success abroad
- **Mula** (Ketu) — the root; digging to the bottom, early upheaval, later depth
- **Shravana** (Moon) — listening, learning, scholarship
- **Revati** (Mercury) — safe passage, endings, kindness

**Gandanta** — the junctions between water and fire signs (the last 3°20′ of
Cancer/Scorpio/Pisces and the first 3°20′ of Leo/Sagittarius/Aries) are treated
as tender, karmically knotted degrees. Worth naming if a moon lands there.

## Vimshottari dasha

The main Vedic timing system: life divided into planetary periods
(*mahadasha*) totalling 120 years, in fixed order and length.

| Lord | Years | Lord | Years | Lord | Years |
|---|---|---|---|---|---|
| Ketu | 7 | Moon | 10 | Jupiter | 16 |
| Venus | 20 | Mars | 7 | Saturn | 19 |
| Sun | 6 | Rahu | 18 | Mercury | 17 |

The sequence starts from the moon's nakshatra lord, and birth lands *partway
into* that first period — the unelapsed remainder is the **balance**, set by
how far the moon had travelled into its nakshatra.

Reading them: each mahadasha colours a decade or two with its planet's themes.
Venus — relationships, comfort, art, money. Saturn — work, restriction, slow
maturity. Moon — home, mind, emotion, family. Sun — status, authority, ego.
Rahu — ambition, foreignness, disruption. Jupiter — growth, teaching, children.
Each subdivides into *antardasha* periods, which is where finer timing lives.

A dasha change is the single most useful timing fact to give someone — it
explains a shift in life texture better than any transit, and `chart.py` prints
the sequence with dates.

## What to say about the two systems

When both are relevant, give the user the rashi first if they're Indian, then
the western reading as the other map. Don't rank them, don't present one as a
correction of the other, and don't force a merged interpretation — they have
different rules and mixing them produces nonsense in both.

The ascendant often lands on the same sign in both systems for the same birth.
When it does, it's worth pointing out.
