import type { ReactNode } from 'react'
import type { JevChipPhase } from '../shared/jevStatus'

/** Every demo's header: the home link, the route name, and whatever sits on the right (status chip, Debug switch). */
export function Masthead({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <header className="masthead">
      <div>
        <h1>
          <a className="home-link" href="/">
            Jev Playground
          </a>{' '}
          <span className="muted">/ {name}</span>
        </h1>
      </div>
      {children ? <div className="masthead-side">{children}</div> : null}
    </header>
  )
}

const CHIP_LABEL: Record<JevChipPhase, string> = {
  checking: 'Checking Jev…',
  loading: 'Asking Jev…',
  live: 'Jev connected',
  offline: 'Jev offline · stub',
  error: 'Jev error · stub',
}

/** Live / offline / loading / error. Same chip the trolley masthead uses, plus a failure state that is not a fake success. */
export function JevStatusChip({ phase, detail }: { phase: JevChipPhase; detail?: string | null }) {
  const label = CHIP_LABEL[phase]
  const on = phase === 'live' || phase === 'loading'
  return (
    <span className={`status-chip${on ? ' on' : ''}${phase === 'error' ? ' is-error' : ''}`} title={detail || label} role="status">
      <span className="dot" />
      {label}
    </span>
  )
}
