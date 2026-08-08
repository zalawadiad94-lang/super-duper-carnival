# super-duper-carnival

Home of the **horoscope** skill for Claude Code.

## The skill

`.claude/skills/horoscope/` — fetches real daily, weekly, and monthly horoscope
readings from live astrology sites, and answers astrology questions generally
(sun/moon/rising, birth charts, compatibility, houses, transits).

It triggers on its own whenever you mention your horoscope, your star sign, or
astrology — including asides like "is Mercury still retrograde?" You can also
invoke it directly:

```
what's my horoscope today?
read this week for me and my partner
what does a Virgo rising actually mean?
```

### Layout

```
.claude/skills/horoscope/
├── SKILL.md                     # workflow: resolve sign → fetch → present
├── references/
│   ├── sources.md               # URL patterns per site, chart calculators, fallbacks
│   └── astrology.md             # signs, planets, houses, aspects, transits
├── scripts/
│   └── sign.py                  # birth date → sign, element, modality, ruler
└── assets/
    └── config.example.json      # copy to config.json to set a default sign
```

### Setup (optional)

Save your sign so it stops asking:

```bash
cp .claude/skills/horoscope/assets/config.example.json \
   .claude/skills/horoscope/config.json
# then edit default_sign
```

### The sign resolver

Standalone, no dependencies beyond the standard library:

```bash
python3 .claude/skills/horoscope/scripts/sign.py 1994-08-08
python3 .claude/skills/horoscope/scripts/sign.py "August 8"
python3 .claude/skills/horoscope/scripts/sign.py --list
```

It flags cusp birthdays (within two days of a boundary, where the real sign
depends on birth year and time) and refuses ambiguous `8/11`-style dates rather
than guessing month-first — the two readings land on different signs.

## Design notes

The skill's central rule is that it **never writes a horoscope itself**. An
invented reading is indistinguishable from a real one, so if every source is
unreachable it says so instead of improvising. When an environment's egress
policy blocks astrology sites outright, it pivots to web search rather than
retrying host after host.
