import type { ReactNode } from 'react'

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

/** The chip for demos that only ever run the client heuristic stub. */
export function StubChip() {
  return (
    <span className="status-chip" title="This demo runs a client heuristic stub — same pattern as the music planner when there is no key.">
      <span className="dot" />
      Jev offline · stub
    </span>
  )
}
