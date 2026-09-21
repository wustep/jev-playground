// `/inbox/` — triage a fictional inbox with a Delete / Review / Leave triad.
//
// Same split as music/trolley: Jev-shaped scores (closed reason tags → a
// distribution), code owns the recommended action (argmax) and every sentence.
// This demo stays on the client heuristic stub; no /api/jev op.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { rng } from '../planner/pick'
import { shuffleInPlace } from '../shared/jevMath'
import { gmailBase64UrlToUtf8, senderName } from './gmail'
import { cloneInbox, INBOX_SEED } from './messages'
import { cloneSettings, DEFAULT_REASON_SETTINGS, jitterActivations, REASON_CATALOG, triageItem } from './triage'
import { REASON_IDS, TRIAGE_ACTIONS, type InboxItem, type ReasonId, type ReasonSettings, type TriageAction, type TriageResult } from './types'

const JEV_POST = 'https://typesafe.ai/blog/introducing-system-one-models-and-jev'
const ACCENT = '#3d5a80'

type Filter = 'all' | TriageAction

type RowModel = {
  item: InboxItem
  result: TriageResult
  override: TriageAction | undefined
  shown: TriageAction
}

const pct = (value: number) => `${Math.round(value * 100)}`

function ConfidenceTriad({ scores, pending }: { scores: TriageResult['scores']; pending: boolean }) {
  return (
    <div className={`triad-block ${pending ? 'is-pending' : ''}`}>
      {TRIAGE_ACTIONS.map((action) => (
        <div key={action} className="triad-meter">
          <span className="triad-meter-label">{action}</span>
          <span className="triad-meter-track">
            <span className={`triad-meter-fill action-${action.toLowerCase()}`} style={{ transform: `scaleX(${pending ? 0.08 : scores[action]})` }} />
          </span>
          <span className="triad-meter-val">{pending ? '—' : pct(scores[action])}</span>
        </div>
      ))}
    </div>
  )
}

function InboxRow({
  row,
  pending,
  open,
  onToggle,
  onOverride,
}: {
  row: RowModel
  pending: boolean
  open: boolean
  onToggle: () => void
  onOverride: (id: string, action: TriageAction) => void
}) {
  const message = row.item.message
  const unread = message.labelIds.includes('UNREAD')
  const topReasons = row.result.reasons.filter((reason) => reason.activation > 0.18 && reason.weight > 0).slice(0, 4)
  const plainPart = message.payload.parts?.find((part) => part.mimeType === 'text/plain')
  const decoded = plainPart?.body?.data ? gmailBase64UrlToUtf8(plainPart.body.data) : message.plaintextBody

  return (
    <article className={`inbox-item ${open ? 'is-open' : ''} ${unread ? 'is-unread' : ''}`} role="listitem">
      <button type="button" className="inbox-main" onClick={onToggle} aria-expanded={open}>
        <div className="inbox-meta">
          <span className={`inbox-unread ${unread ? 'on' : ''}`} aria-hidden="true" />
          <span className="inbox-from">{senderName(message.sender)}</span>
          <span className="inbox-date">
            {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(Number(message.internalDate)))}
          </span>
        </div>
        <p className="inbox-subject">{message.subject}</p>
        <p className="inbox-snippet">{message.snippet}</p>
        <div className="inbox-chips">
          {topReasons.map((reason) => (
            <span key={reason.id} className="inbox-chip">
              {REASON_CATALOG[reason.id].label}
            </span>
          ))}
        </div>
      </button>

      <div className="inbox-rec">
        <div className="inbox-rec-row">
          <span className={`inbox-pill action-${row.shown.toLowerCase()}`}>{row.shown}</span>
          {row.override ? (
            <span className="muted inbox-rec-note">
              override · stub {row.result.recommended} {pct(row.result.scores[row.result.recommended])}%
            </span>
          ) : (
            <span className="muted inbox-rec-note">{pending ? 'running…' : `${pct(row.result.choice.confidence)} certainty`}</span>
          )}
        </div>
        <ConfidenceTriad scores={row.result.scores} pending={pending} />
      </div>

      {open ? (
        <div className="inbox-detail">
          <div className="inbox-body">{decoded}</div>
          <div className="inbox-overrides">
            {TRIAGE_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                className={`ghost small inbox-override action-${action.toLowerCase()} ${row.override === action ? 'is-on' : ''}`}
                onClick={() => onOverride(message.id, action)}
              >
                {action}
              </button>
            ))}
          </div>
          <dl className="inbox-schema">
            <dt>id / threadId</dt>
            <dd>
              {message.id} · {message.threadId}
            </dd>
            <dt>labelIds</dt>
            <dd>{message.labelIds.join(', ')}</dd>
            <dt>historyId · internalDate · sizeEstimate</dt>
            <dd>
              {message.historyId} · {message.internalDate} · {message.sizeEstimate}
            </dd>
            <dt>payload.headers</dt>
            <dd>{message.payload.headers.map((h) => `${h.name}: ${h.value}`).join(' · ')}</dd>
            <dt>payload.parts</dt>
            <dd>{(message.payload.parts ?? []).map((part) => `${part.mimeType} (${part.body?.size ?? 0}b)`).join(' · ')}</dd>
            <dt>flattened</dt>
            <dd>
              {message.sender} → {message.toRecipients.join(', ')} · {message.date}
            </dd>
          </dl>
        </div>
      ) : null}
    </article>
  )
}

export default function InboxApp() {
  const [items, setItems] = useState<InboxItem[]>(() => cloneInbox())
  const [settings, setSettings] = useState<ReasonSettings>(() => cloneSettings(DEFAULT_REASON_SETTINGS))
  const [overrides, setOverrides] = useState<Record<string, TriageAction>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [running, setRunning] = useState(true)
  const [seed, setSeed] = useState(1)

  useEffect(() => {
    if (!running) return
    if (revealed >= items.length) {
      setRunning(false)
      return
    }
    const timer = window.setTimeout(() => setRevealed((n) => n + 1), 48)
    return () => window.clearTimeout(timer)
  }, [running, revealed, items.length])

  const runAll = useCallback(() => {
    setRevealed(0)
    setRunning(true)
    setOverrides({})
  }, [])

  const reshuffle = useCallback(() => {
    const random = rng(seed * 997 + 13)
    const next = shuffleInPlace(
      cloneInbox(INBOX_SEED).map((entry) => ({
        message: entry.message,
        reasons: jitterActivations(entry.reasons, random),
      })),
      random,
    )
    setItems(next)
    setSeed((n) => n + 1)
    setOverrides({})
    setExpanded(null)
    setRevealed(0)
    setRunning(true)
  }, [seed])

  const rows: RowModel[] = useMemo(
    () =>
      items.map((item) => {
        const result = triageItem(item, settings)
        const override = overrides[item.message.id]
        return { item, result, override, shown: override ?? result.recommended }
      }),
    [items, settings, overrides],
  )

  const visible = rows.filter((row, index) => {
    if (index >= revealed) return filter === 'all'
    if (filter === 'all') return true
    return row.shown === filter
  })

  const counts = rows.reduce(
    (acc, row, index) => {
      if (index >= revealed) return acc
      acc[row.shown] += 1
      return acc
    },
    { Delete: 0, Review: 0, Leave: 0 } as Record<TriageAction, number>,
  )

  const setWeight = (id: ReasonId, weight: number) => {
    setSettings((prev) => ({ ...prev, [id]: { ...prev[id], weight } }))
  }

  const setEnabled = (id: ReasonId, enabled: boolean) => {
    setSettings((prev) => ({ ...prev, [id]: { ...prev[id], enabled } }))
  }

  const overrideRow = (id: string, action: TriageAction) => {
    setOverrides((prev) => {
      if (prev[id] === action) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: action }
    })
  }

  return (
    <div className="app inbox" style={{ '--accent': ACCENT } as CSSProperties}>
      <header className="masthead">
        <div>
          <h1>
            <a className="home-link" href="/">
              Jev Playground
            </a>{' '}
            <span className="muted">/ inbox</span>
          </h1>
        </div>
        <div className="masthead-side">
          <span className="status-chip" title="This demo is a client heuristic stub — same pattern as the music planner when there is no key.">
            <span className="dot" />
            Jev offline · stub
          </span>
        </div>
      </header>

      <section className="panel inbox-intro">
        <p className="inbox-lede">
          <a href={JEV_POST}>Jev</a> is a System One model: it returns a distribution, not a paragraph. Each fictional message gets a Delete / Review / Leave
          confidence triad, driven by closed reason tags you can toggle and reweight. Sample data uses the Gmail <code>users.messages</code> shape; the people
          are made up.
        </p>
        <div className="inbox-toolbar">
          <button type="button" className="primary" onClick={runAll}>
            Run all
          </button>
          <button type="button" className="ghost" onClick={reshuffle}>
            Reshuffle
          </button>
          {(['all', ...TRIAGE_ACTIONS] as const).map((key) => (
            <button key={key} type="button" className={`ghost ${filter === key ? 'is-filter-on' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key === 'all' ? 'All' : key}
            </button>
          ))}
          <div className="inbox-counts" aria-live="polite">
            <span className="count-delete">{counts.Delete} Delete</span>
            <span className="count-review">{counts.Review} Review</span>
            <span className="count-leave">{counts.Leave} Leave</span>
          </div>
        </div>
      </section>

      <div className="inbox-frame">
        <section className="panel inbox-list" aria-label="Inbox">
          <div role="list">
            {visible.length === 0 ? (
              <p className="inbox-empty muted">Nothing in this filter.</p>
            ) : (
              visible.map((row) => {
                const index = items.findIndex((entry) => entry.message.id === row.item.message.id)
                return (
                  <InboxRow
                    key={row.item.message.id}
                    row={row}
                    pending={index >= revealed}
                    open={expanded === row.item.message.id}
                    onToggle={() => setExpanded((id) => (id === row.item.message.id ? null : row.item.message.id))}
                    onOverride={overrideRow}
                  />
                )
              })
            )}
          </div>
        </section>

        <aside className="panel inbox-reasons" aria-label="Reason weights">
          <header className="panel-head">
            <h2>Reasons</h2>
            <button type="button" className="ghost small" onClick={() => setSettings(cloneSettings(DEFAULT_REASON_SETTINGS))}>
              Reset
            </button>
          </header>
          <p className="inbox-reasons-lede muted">
            Closed tags with weights. Changing them recomputes the triad in code — the same composite-scoring pattern you’d use with live Jev Nouls.
          </p>
          <div className="reason-list">
            {REASON_IDS.map((id) => {
              const meta = REASON_CATALOG[id]
              const policy = settings[id]
              return (
                <label key={id} className={`reason-row ${policy.enabled ? '' : 'is-off'}`}>
                  <input type="checkbox" checked={policy.enabled} onChange={(event) => setEnabled(id, event.target.checked)} />
                  <span>
                    <span className="reason-head">
                      <span className="reason-label">{meta.label}</span>
                      <span className="muted reason-weight">{policy.weight.toFixed(2)}</span>
                    </span>
                    <span className="reason-blurb muted">{meta.blurb}</span>
                    <span className="reason-pull" aria-hidden="true">
                      {TRIAGE_ACTIONS.map((action) => (
                        <span key={action} className="reason-pull-bar">
                          <span className={`reason-pull-fill action-${action.toLowerCase()}`} style={{ transform: `scaleX(${meta.pull[action]})` }} />
                        </span>
                      ))}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2.4"
                      step="0.05"
                      value={policy.weight}
                      disabled={!policy.enabled}
                      onChange={(event) => setWeight(id, Number(event.target.value))}
                      aria-label={`${meta.label} weight`}
                    />
                  </span>
                </label>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
