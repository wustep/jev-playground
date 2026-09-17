// What the decision means, shown rather than told: on the left, whoever was on
// the track the trolley took, each under a translucent ✕; on the right,
// whoever was spared. Pure presentation — it reads the scenario and the
// decision, nothing from Jev. Still a cartoon: emoji and a cross, no more.

import type { CSSProperties } from 'react'
import { groupEmoji, trackPhrase } from './describe'
import type { DecisionId, Group, Scenario } from './schema'

/** Emoji shown per group before collapsing the rest into "+N". */
const MAX_SHOWN = 12

function Cast({ groups, lost, offset }: { groups: readonly Group[]; lost: boolean; offset: number }) {
  if (groups.length === 0) return <p className="outcome-empty">nobody and nothing</p>
  let index = offset
  return (
    <div className="outcome-cast">
      {groups.map((group, g) => {
        const shown = Math.min(group.count, MAX_SHOWN)
        return (
          <span key={g} className="outcome-group">
            {Array.from({ length: shown }, (_, k) => (
              <span key={k} className={`outcome-figure ${lost ? 'is-lost' : 'is-saved'}`} style={{ '--i': index++ } as CSSProperties} aria-hidden="true">
                <span className="outcome-emoji">{groupEmoji(group)}</span>
              </span>
            ))}
            {group.count > shown && <span className="outcome-more">+{(group.count - shown).toLocaleString('en-US')}</span>}
          </span>
        )
      })}
    </div>
  )
}

export function Outcome({ scenario, decision }: { scenario: Scenario; decision: DecisionId }) {
  const lost = decision === 'pull_lever' ? scenario.siding : scenario.ahead
  const saved = decision === 'pull_lever' ? scenario.ahead : scenario.siding
  const lostShown = lost.reduce((sum, group) => sum + Math.min(group.count, MAX_SHOWN), 0)
  return (
    <div className="outcome" role="group" aria-label="What that decision means">
      <section className="outcome-side outcome-lost">
        <h3>Lost <span className="muted">— {decision === 'pull_lever' ? 'side track' : 'straight ahead'}</span></h3>
        <Cast groups={lost} lost offset={0} />
        <p className="outcome-caption">{trackPhrase(lost)}</p>
      </section>
      <section className="outcome-side outcome-saved">
        <h3>Saved <span className="muted">— {decision === 'pull_lever' ? 'straight ahead' : 'side track'}</span></h3>
        {/* The saved side waits for the crosses to land, then celebrates. */}
        <Cast groups={saved} lost={false} offset={lostShown + 4} />
        <p className="outcome-caption">{trackPhrase(saved)}</p>
      </section>
    </div>
  )
}
