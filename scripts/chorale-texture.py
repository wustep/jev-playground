#!/usr/bin/env python3
"""
Texture of Bach's four-part chorales, the reference for `StyleVoice.held`.

    pip install music21
    python3 scripts/chorale-texture.py

Reads every four-part 4/4 chorale in music21's bundled corpus (no download,
nothing written) and prints per-bar means from the first full bar on. A tied
continuation is not an attack. "Lower" is alto, tenor and bass together: the
distinct onsets under the soprano.

Compare with the generated `hymn` (Bach, `walking` over `sustained`) at the
same measures; docs/fable-context/REWRITE_MUSIC_FIRST_PRINCIPLES.md has both.
"""
import statistics

from music21 import corpus, meter, note


def attacks(part, start, end):
    out = []
    for n in part.flatten().notes:
        if n.tie is not None and n.tie.type in ('stop', 'continue'):
            continue
        offset = float(n.offset)
        if start <= offset < end:
            midi = n.pitch.midi if isinstance(n, note.Note) else max(p.midi for p in n.pitches)
            out.append((round(offset, 3), float(n.quarterLength), midi))
    return out


rows = []
for path in corpus.getComposer('bach'):
    try:
        score = corpus.parse(path)
    except Exception:
        continue
    signatures = score.recurse().getElementsByClass(meter.TimeSignature)
    if len(score.parts) != 4 or not signatures or signatures[0].ratioString != '4/4':
        continue
    offsets = [float(n.offset) for part in score.parts for n in part.flatten().notes]
    if not offsets:
        continue
    first = min(offsets)
    end_all = max(float(n.offset + n.quarterLength) for part in score.parts for n in part.flatten().notes)
    start = first if first % 4 == 0 else (first // 4 + 1) * 4
    bars = int((end_all - start) // 4)
    if bars < 4:
        continue
    s, a, t, b = (attacks(part, start, start + 4 * bars) for part in score.parts)
    beats = [round(start + k, 3) for k in range(4 * bars)]
    lower = {x[0] for voice in (a, t, b) for x in voice}
    moves = [abs(b[i][2] - b[i - 1][2]) for i in range(1, len(b))]
    rows.append({
        'soprano attacks a bar': len(s) / bars,
        'bass attacks a bar': len(b) / bars,
        'lower-voice onsets a bar': len(lower) / bars,
        'beats the lower voices strike': sum(x in lower for x in beats) / len(beats),
        'beats the soprano strikes': sum(x in {y[0] for y in s} for x in beats) / len(beats),
        'bass moves by step': sum(0 < m <= 2 for m in moves) / max(1, len(moves)),
        'bass repeats a note': sum(m == 0 for m in moves) / max(1, len(moves)),
        'bass notes that are eighths': sum(x[1] <= 0.5 for x in b) / max(1, len(b)),
        'bass register (MIDI)': statistics.mean(x[2] for x in b),
    })

print(f'{len(rows)} four-part chorales in 4/4')
for key in rows[0]:
    print(f'  {key:32s} {statistics.mean(r[key] for r in rows):6.2f}')
