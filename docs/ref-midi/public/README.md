# Public-domain reference MIDI

Keyboard/piano encodings for the **classical dials only** (Bach, Beethoven, Chopin, Debussy). These are the pieces reverse-labelled in [`docs/fable-context/REFERENCE_PLAN_GAP.md`](../../fable-context/REFERENCE_PLAN_GAP.md) and sketched as closed `CompositionPlan` JSON under [`docs/fable-context/reference-plans/`](../../fable-context/reference-plans/).

**Why they are here.** So the gap study can point at a real, redistributable encoding instead of “Mutopia, analysed locally, gitignored.” Living-artist dials (Glass, Zimmer, Laufey, Fox) have **JSON only** — no MIDI in this folder, no commercial transcriptions anywhere in the repo.

**What is not here.** Anything under `docs/ref-midi/local/` (gitignored), crowd/pop transcriptions, or the misnamed files FIDELITY warned about (`bach_invention_01.mid`, `chopin_nocturne.mid`).

All files below were fetched from [Mutopia](https://www.mutopiaproject.org/). The musical works are public domain. The *encodings* are Mutopia’s LilyPond MIDI, licensed as listed (Public Domain or CC BY-SA — keep attribution on the CC files).

| File | Piece | Mutopia source | Encoding licence | Mutopia id |
| --- | --- | --- | --- | --- |
| [`bach-bwv846-wtk1-prelude1.mid`](bach-bwv846-wtk1-prelude1.mid) | Bach, WTC I Prelude in C, BWV 846 | [wtk1-prelude1](https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.mid) | Public Domain | Mutopia-2011/09/12-5 |
| [`bach-bwv772-invention-01.mid`](bach-bwv772-invention-01.mid) | Bach, Invention 1, BWV 772 | [bach-invention-01](https://www.mutopiaproject.org/ftp/BachJS/BWV772/bach-invention-01/bach-invention-01.mid) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Mutopia-2008/06/15-40 |
| [`beethoven-op13-pathetique-2.mid`](beethoven-op13-pathetique-2.mid) | Beethoven, Op. 13 *Pathétique* II (Adagio cantabile) | [pathetique-2](https://www.mutopiaproject.org/ftp/BeethovenLv/O13/pathetique-2/pathetique-2.mid) | Public Domain | Mutopia-2011/10/25-295 |
| [`beethoven-op27-2-moonlight-1.mid`](beethoven-op27-2-moonlight-1.mid) | Beethoven, Op. 27/2 *Moonlight* I | movement 1 from [moonlight-mids.zip](https://www.mutopiaproject.org/ftp/BeethovenLv/O27/moonlight/moonlight-mids.zip) | [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/) | Mutopia-2007/02/11-276 |
| [`chopin-op9-2-nocturne.mid`](chopin-op9-2-nocturne.mid) | Chopin, Nocturne Op. 9/2 | [chopin_nocturne_op9_n2](https://www.mutopiaproject.org/ftp/ChopinFF/O9/chopin_nocturne_op9_n2/chopin_nocturne_op9_n2.mid) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Mutopia-2014/12/18-1590 |
| [`chopin-op28-4-prelude.mid`](chopin-op28-4-prelude.mid) | Chopin, Prelude Op. 28/4 | [Chop-28-4](https://www.mutopiaproject.org/ftp/ChopinFF/O28/Chop-28-4/Chop-28-4.mid) | Public Domain | Mutopia-2016/10/28-468 |
| [`debussy-l66-arabesque-1.mid`](debussy-l66-arabesque-1.mid) | Debussy, *Première Arabesque* L. 66 | [debussy_Arabesque_1](https://www.mutopiaproject.org/ftp/DebussyC/L66/debussy_Arabesque_1/debussy_Arabesque_1.mid) | Public Domain | Mutopia-2011/10/25-1777 |
| [`debussy-l75-clair-de-lune.mid`](debussy-l75-clair-de-lune.mid) | Debussy, *Clair de lune* (Suite bergamasque) L. 75 | [debussy_Ste_Bergamesq_Clair](https://www.mutopiaproject.org/ftp/DebussyC/L75/debussy_Ste_Bergamesq_Clair/debussy_Ste_Bergamesq_Clair.mid) | Public Domain | Mutopia-2010/12/21-1778 |
| [`chopin-op6-1-mazurka.mid`](chopin-op6-1-mazurka.mid) | Chopin, Mazurka Op. 6/1 | [Mazurka-Op6-No1](https://www.mutopiaproject.org/ftp/ChopinFF/O6/Mazurka-Op6-No1/Mazurka-Op6-No1.mid) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Mutopia-2009/06/23-1687 |
| [`beethoven-woo59-fur-elise.mid`](beethoven-woo59-fur-elise.mid) | Beethoven, *Für Elise* WoO 59 | [fur_Elise_WoO59](https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.mid) | Public Domain | Mutopia-2015/08/18-931 |
| [`debussy-l117-prelude-4.mid`](debussy-l117-prelude-4.mid) | Debussy, Préludes I/4 *Les sons et les parfums tournent dans l'air du soir* L. 117 | [L117-prel-4](https://www.mutopiaproject.org/ftp/DebussyC/L117/L117-prel-4/L117-prel-4.mid) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Mutopia-2015/03/25-2002 |

The last three were added so the variants with no reference had one: Chopin's dances (a quarter of Chopin draws), a second lyrical Beethoven, and Debussy's slow haze. Licences were read from each piece's Mutopia info page, not from the listing.

`.gitignore` ignores `docs/ref-midi/**/*.mid` except this folder. Do not add Glass / Zimmer / Laufey / Fox MIDI here.

## Living artists: acquisition status

No living artist's music is in this repository, and none will be. Owned or
locally held files go in `docs/ref-midi/local/`, which is gitignored; the
harness uses them when present and skips them when absent.

| Artist | What exists | Where | Status |
| --- | --- | --- | --- |
| Philip Glass | Étude No. 6, notation-software MIDI, 308 bars | local only | Measured locally (top voice 65.6, 6 attacks a 3/4 bar). Its own notes record it as byte-identical to a downloaded file, so its licence is unknown: analysis only, never shipped. Official material: Dunvagen Music Publishers. |
| Elijah Fox | "Wyoming", MuseScore export of an owned score, 18 bars | local only | Measured locally (top voice 71.4, 16.4 attacks a bar). |
| Laufey | Owned sheet-music PDFs only (thirteen songs) | not in repo | **Gap.** No MIDI. A hand transcription of one owned score into MuseScore would fill it, local only. |
| Hans Zimmer | Nothing | — | **Gap.** Do not source film-score MIDI from download sites; licensed piano arrangements (e.g. Hal Leonard) could be transcribed, local only. |

## Hand / staff tracks

These Mutopia piano encodings are **one track per engraved staff**, not a
musical voice analysis. Compare metrics (`src/compare/compareMetrics.ts`)
split on this rule:

| Hand | Staff-name tokens | What we score |
| --- | --- | --- |
| Melody / figure (RH) | `upper`, `up`, `rh`, `right`, `one`, `soprano`, `treble`, `figure` | Register, occupancy, `ret4` |
| Accompaniment (LH) | `lower`, `down`, `lh`, `left`, `two`, `bass`, `bottom` | Reported separately |

**Track index is not the hand.** BWV 846 puts `lower` on track 0 and `upper`
on track 1. Channel numbers are not reliable either (some files 0/1, others
1/2). If a file has no staff name, the helper falls back to the higher-mean
note-bearing track.

The split is right for the files in this folder (checked against the `.ly`
staves in the zoom-out after #48) and would not generalise to an arbitrary
MIDI.

**The melody is the top voice of the upper staff, not the whole staff.** An
upper-staff track often carries the tune *and* an inner accompaniment — Op. 13
II's right hand plays its murmuring sixteenths under the tune. Counting every
note-on made that tune look like 10.9 attacks a bar at MIDI 62; its top voice
attacks 3.2 times a bar at 66.3. So an attack counts as melody only when
nothing higher is still sounding over it (`topVoice`). Moonlight I is the
known exception it cannot fix: the tune does not enter until bar 5, so its
first bars' top line is the triplet figure.

**Thematic start.** `ret4` / `ret8` skip intro/prelude bars that are not the
theme. Pickup is aligned to the first accompaniment downbeat when the melody
starts an anacrusis earlier (Op. 9/2: RH eighth at tick 0, theme + LH at
192). Debussy Arabesque is a file-specific override: the tune is `s1 | s1`
then enters, so thematic bar 2. Beethoven Pathétique II and BWV 846 start at
bar 0.
