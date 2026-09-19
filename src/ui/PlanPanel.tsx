import { useEffect, useState } from 'react'
import {
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  PlanValidationError,
  parsePlan,
  type CompositionPlan,
  type ContourId,
  type GlobalField,
} from '../plan/schema'
import type { Decision } from '../planner'
import { keyInfo } from '../render/harmony'
import { scoreBarForPlan, type Score } from '../render/score'

const FIELD_LABEL: Record<GlobalField, string> = {
  character: 'Character',
  form: 'Form',
  key: 'Key',
  meter: 'Meter',
  texture: 'Texture',
  palette: 'Palette',
  tempo: 'Tempo',
  dynamics: 'Dynamics',
  dynamicShape: 'Shape',
  defaultInstrument: 'Instrument',
  arrangement: 'Arrangement',
  opening: 'Opening',
  pedal: 'Pedal',
  phrasing: 'Phrasing',
  hookBars: 'Hook',
}

function pretty(field: GlobalField, plan: CompositionPlan): string {
  if (field === 'key') return keyInfo(plan.key).label
  if (field === 'meter') return GLOBAL_FIELDS.meter[plan.meter].split(' — ')[0]
  return String(plan[field]).replace(/_/g, ' ')
}

/** Top alternatives, for the hover title: "what else was on the table". */
function runnersUp(decision: Decision | undefined): string {
  if (!decision) return ''
  return Object.entries(decision.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([option, p]) => `${option} ${(p * 100).toFixed(0)}%`)
    .join(' · ')
}

export function Confidence({ value, caption }: { value: number | undefined; caption?: string }) {
  if (value == null) return null
  const percent = Math.round(value * 100)
  const title = caption
    ? `${percent}% confidence — how sure this rating is, not how well it matches`
    : `${percent}% confidence`
  const bar = (
    <span className="confidence" title={caption ? undefined : title}>
      <span className="confidence-fill" style={{ width: `${percent}%` }} />
    </span>
  )
  if (!caption) return bar
  return (
    <span className="confidence-block" title={title}>
      {bar}
      <span className="confidence-caption">{caption}</span>
    </span>
  )
}

interface Props {
  plan: CompositionPlan
  score: Score
  decisions: Decision[]
  /** True once the JSON was edited by hand: decisions no longer describe it. */
  edited: boolean
  onApply: (plan: CompositionPlan) => void
  /** When false/omitted, hide the editable Plan JSON block. */
  debug?: boolean
}

export function PlanPanel({ plan, score, decisions, edited, onApply, debug = false }: Props) {
  const byField = new Map(decisions.map((d) => [d.field, d]))
  const canonical = JSON.stringify(plan, null, 2)
  const [draft, setDraft] = useState(canonical)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setDraft(canonical)
    setError(null)
  }, [canonical])

  const apply = () => {
    try {
      onApply(parsePlan(JSON.parse(draft)))
      setError(null)
    } catch (cause) {
      setError(cause instanceof PlanValidationError || cause instanceof SyntaxError ? cause.message : String(cause))
    }
  }

  return (
    <aside className="panel plan-panel">
      <header className="panel-head">
        <h2>CompositionPlan</h2>
        <span className="tag">{edited ? 'edited by hand' : 'from planner'}</span>
      </header>

      <dl className="plan-fields">
        {GLOBAL_FIELD_IDS.map((field) => {
          const decision = edited ? undefined : byField.get(field)
          const description = plan[field] != null ? (GLOBAL_FIELDS[field] as Record<string, string>)[plan[field] as string] : undefined
          return (
            <div key={field} className="plan-field" title={[description, runnersUp(decision)].filter(Boolean).join('\n\n')}>
              <dt>{FIELD_LABEL[field]}</dt>
              <dd>
                {pretty(field, plan)}
                <Confidence value={decision?.confidence} />
              </dd>
            </div>
          )
        })}
      </dl>

      {/* Always 4 bars per row — 8-wide was unreadable in the plan panel. */}
      <ol className="bar-strip" data-cols="4">
        {plan.bars.map((bar, i) => {
          const decision = edited ? undefined : byField.get(`bars[${i}].chord`)
          const body = scoreBarForPlan(score, i)
          return (
            <li key={i} className={`bar-cell role-${bar.role}`} title={runnersUp(decision)}>
              <span className="bar-number">{i + 1}</span>
              <span className="bar-chord">{bar.chord2 ? `${bar.chord} · ${bar.chord2}` : bar.chord}</span>
              <span className="bar-symbol">{body?.split ? `${body.chordSymbol} · ${body.split.chordSymbol}` : body?.chordSymbol}</span>
              <span className="bar-role">{bar.role.replace(/_/g, ' ')}</span>
              <span className="bar-contour">{CONTOUR_GLYPH[bar.contour]}</span>
              <Confidence value={decision?.confidence} />
            </li>
          )
        })}
      </ol>

      {debug && (
      <details className="plan-json" open>
        <summary>
          Plan JSON{' '}
          <span className="muted">
            — this object is all the renderer sees. Edit it and apply. (<code>form</code> is the planner’s label for the layout; the renderer reads each bar’s <code>role</code>.)
          </span>
        </summary>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          aria-label="Composition plan JSON"
          rows={Math.min(30, draft.split('\n').length + 1)}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="row">
          <button type="button" onClick={apply} disabled={draft === canonical}>
            Apply to renderer
          </button>
          <button type="button" className="ghost" onClick={() => setDraft(canonical)} disabled={draft === canonical}>
            Reset
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(canonical).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              })
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </details>
      )}
    </aside>
  )
}

const CONTOUR_GLYPH: Record<ContourId, string> = { rise: '↗', fall: '↘', arch: '∩', dip: '∪', static: '→', wave: '∿', leap_fall: '⤴↘', drop_rise: '⤵↗', pendulum: '⇅' }
