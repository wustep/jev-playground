// Engineer debug view (off by default; `?debug=1` or the header switch).
//
// Same view for both planners: JevPlanner shows the System One requests it
// really sent plus the raw responses; the HeuristicPlanner shows the requests
// Jev WOULD have been sent for the same plan (built by the same pure builders
// in src/planner/jev/requests.ts), marked "not sent".

import { useState } from 'react'
import { STYLE_IDS, STYLE_LABELS, type CompositionPlan, type StyleId, type StyleMatchScore } from '../plan/schema'
import type { Decision, Exchange, PlanInput, PlanTrace, SongQualityScore } from '../planner'
import { NOTES_MODE_DEBUG, type NotesMode } from '../music/notesMode'
import { scoreBarForPlan, type Score } from '../render/score'

interface Props {
  plan: CompositionPlan
  score: Score
  input: PlanInput
  trace: PlanTrace
  /** Exchanges in effect (the trace's own, or shadow ones after a hand edit). */
  exchanges: Exchange[]
  matchExchanges: Exchange[]
  matches: Partial<Record<StyleId, StyleMatchScore>> | null
  /** `song_quality` from the same `score` POST as the style matches (raw 0–3). */
  songQuality?: SongQualityScore | null
  edited: boolean
  notice: string | null
  /** How the singing line was produced. */
  notes: NotesMode
}

const percent = (value: number | undefined) => (value == null ? '—' : `${(value * 100).toFixed(0)}%`)

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="ghost small"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2)
  return (
    <div className="json-block">
      <div className="json-head">
        <span>{label}</span>
        <CopyButton text={text} />
      </div>
      <pre>{text}</pre>
    </div>
  )
}

function ExchangeRow({ exchange, index, defaultOpen }: { exchange: Exchange; index: number; defaultOpen: boolean }) {
  const questionCount = Object.keys(exchange.request.questions).length
  return (
    <details className="exchange" open={defaultOpen}>
      <summary>
        <span className="exchange-index">{index + 1}</span>
        <span className="exchange-label">{exchange.label}</span>
        <span className="muted">
          {questionCount} question{questionCount === 1 ? '' : 's'}
          {exchange.response ? ` · ${exchange.response.usage?.input_tokens ?? '?'} tok` : ''}
          {exchange.latencyMs != null ? ` · ${Math.round(exchange.latencyMs)} ms` : ''}
        </span>
        <span className={`tag ${exchange.sent ? 'tag-live' : ''}`}>{exchange.sent ? 'sent' : 'not sent — stub'}</span>
      </summary>
      <JsonBlock label="POST /v1/systemone — request body" value={exchange.request} />
      <JsonBlock label="POST /api/jev — what the browser sends to the proxy" value={exchange.op} />
      {exchange.response ? (
        <JsonBlock label="response" value={exchange.response} />
      ) : (
        <p className="muted json-note">No response: the heuristic stub decided locally. This is the payload JevPlanner would send for the same plan.</p>
      )}
    </details>
  )
}

export function DebugPanel({ plan, score, input, trace, exchanges, matchExchanges, matches, songQuality, edited, notice, notes }: Props) {
  const byField = new Map<string, Decision>(edited ? [] : trace.decisions.map((d) => [d.field, d]))
  const globals = edited ? [] : trace.decisions.filter((d) => !d.field.startsWith('bars['))
  const live = trace.planner === 'jev'

  return (
    <section className="panel debug-panel" aria-label="Engineer debug view">
      <header className="panel-head">
        <h2>Debug</h2>
        <span className="tag">{live ? 'live Jev' : 'heuristic stub'}</span>
      </header>

      <div className="debug-grid">
        <div>
          <h3>Summary</h3>
          <table className="kv">
            <tbody>
              <tr><th>style</th><td>“{STYLE_LABELS[plan.style]}” <code>{plan.style}</code></td></tr>
              <tr><th>planner</th><td><code>{trace.planner}</code>{trace.model ? <> · model <code>{trace.model}</code></> : null}</td></tr>
              <tr><th>requests</th><td>{live ? trace.requests : `0 sent (${exchanges.length} would be)`} · {Math.round(trace.latencyMs)} ms{trace.inputTokens ? ` · ${trace.inputTokens} input tokens` : ''}</td></tr>
              <tr><th>policy</th><td><code>{input.pick}</code> · seed <code>{input.seed}</code> · bars <code>{String(input.bars)}</code> · style brief <code>{input.brief ? 'on' : 'off'}</code></td></tr>
              <tr><th>render</th><td>{score.keySignature} · {score.meter.num}/{score.meter.den} · ♩={score.bpm} · pedal {score.pedal}</td></tr>
              <tr><th>notes</th><td>{NOTES_MODE_DEBUG[notes]}</td></tr>
              {edited && <tr><th>note</th><td>Plan JSON was edited by hand — confidences hidden, payloads rebuilt for the edited plan.</td></tr>}
              {notice && <tr><th>notice</th><td>{notice}</td></tr>}
            </tbody>
          </table>

          <h3>Bars — chord + role sequence</h3>
          <div className="table-scroll">
            <table className="grid-table">
              <thead>
                <tr><th>#</th><th>chord</th><th>resolved</th><th>conf.</th><th>role</th><th>conf.</th><th>contour</th></tr>
              </thead>
              <tbody>
                {plan.bars.map((bar, i) => {
                  const body = scoreBarForPlan(score, i)
                  return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><code>{bar.chord}</code>{bar.chord2 && <> | <code>{bar.chord2}</code></>}</td>
                    <td>{body?.chordSymbol}{body?.split && ` | ${body.split.chordSymbol}`}</td>
                    <td>{percent(byField.get(`bars[${i}].chord`)?.confidence)}</td>
                    <td><code>{bar.role}</code></td>
                    <td>{percent(byField.get(`bars[${i}].role`)?.confidence)}</td>
                    <td><code>{bar.contour}</code></td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="sequence">
            {plan.bars.map((bar) => (bar.chord2 ? `${bar.chord} | ${bar.chord2}` : bar.chord)).join(' → ')}
          </p>
        </div>

        <div>
          <h3>Global decisions</h3>
          {globals.length === 0 ? (
            <p className="muted">No planner decisions for a hand-edited plan.</p>
          ) : (
            <div className="table-scroll">
              <table className="grid-table">
                <thead>
                  <tr><th>field</th><th>choice</th><th>conf.</th><th>runner-up</th></tr>
                </thead>
                <tbody>
                  {globals.map((d) => {
                    const runnerUp = Object.entries(d.probabilities).filter(([option]) => option !== d.choice).sort((a, b) => b[1] - a[1])[0]
                    return (
                      <tr key={d.field}>
                        <td>{d.field}</td>
                        <td><code>{d.choice}</code> <span className="muted">{percent(d.probabilities[d.choice])}</span></td>
                        <td>{percent(d.confidence)}</td>
                        <td className="muted">{runnerUp ? `${runnerUp[0]} ${percent(runnerUp[1])}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h3>Style match</h3>
          {matches ? (
            <div className="table-scroll">
              <table className="grid-table">
                <thead>
                  <tr><th>style</th><th>match</th><th>conf.</th><th>raw 0–2</th></tr>
                </thead>
                <tbody>
                  {STYLE_IDS.filter((style) => matches[style]).map((style) => (
                    <tr key={style} className={style === plan.style ? 'row-target' : undefined}>
                      <td>{STYLE_LABELS[style]}</td>
                      <td><code>{matches[style]!.match}</code></td>
                      <td>{percent(matches[style]!.confidence)}</td>
                      <td>{matches[style]!.raw.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Not scored yet.</p>
          )}

          <h3>Song quality</h3>
          {songQuality ? (
            <table className="kv">
              <tbody>
                <tr><th>level 0–3</th><td><code>{Math.max(0, Math.min(3, Math.round(songQuality.raw)))}</code></td></tr>
                <tr><th>conf.</th><td>{percent(songQuality.confidence)}</td></tr>
                <tr><th>raw 0–3</th><td>{songQuality.raw.toFixed(2)}</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">Not scored yet.</p>
          )}
        </div>
      </div>

      <h3>
        Payloads <span className="muted">— {live && !edited ? 'exactly what was sent to Jev, in order' : 'what JevPlanner would send for this plan, in order'}</span>
      </h3>
      <div className="exchanges">
        {[...exchanges, ...matchExchanges].map((exchange, i) => (
          <ExchangeRow key={`${exchange.label}-${i}`} exchange={exchange} index={i} defaultOpen={i === 0} />
        ))}
      </div>
    </section>
  )
}
