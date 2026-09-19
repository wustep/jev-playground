# Public-domain reference MIDI

Keyboard/piano encodings for the **older dials only** (Bach, Beethoven, Chopin, Debussy). These are the pieces reverse-labelled in [`docs/fable-context/REFERENCE_PLAN_GAP.md`](../../fable-context/REFERENCE_PLAN_GAP.md) and sketched as closed `CompositionPlan` JSON under [`docs/fable-context/reference-plans/`](../../fable-context/reference-plans/).

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

`.gitignore` ignores `docs/ref-midi/**/*.mid` except this folder. Do not add Glass / Zimmer / Laufey / Fox MIDI here.
