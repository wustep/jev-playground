// `/` — deliberately plain: what this is, and the demo doors.

const DEMOS = [
  {
    href: '/music/',
    name: 'Music',
    blurb: 'Pick a composer. Jev chooses only labels — character, form, key, chords — and code writes every note, the sheet and the sound.',
    accent: '#9a6a1c',
  },
  {
    href: '/trolley/',
    name: 'Trolley',
    blurb: 'Absurd trolley problems. Put anyone or anything on either track, or let Jev cast one, then see what it would do and how sure it is.',
    accent: '#b3261e',
  },
  {
    href: '/inbox/',
    name: 'Inbox',
    blurb: 'A fictional inbox. Closed reason tags score Delete, Review or Leave; reweight them and the triad moves. Gmail-shaped, nobody real.',
    accent: '#3d5a80',
  },
  {
    href: '/match/',
    name: 'Match',
    blurb: 'Fictional nobodies only. Jev-shaped questions over hobbies and looking-for; each candidate gets a hypothesis, a fit and reasons.',
    accent: '#5c4a7a',
  },
]

export function Landing() {
  return (
    <div className="app landing">
      <header className="masthead">
        <h1>Jev Playground</h1>
      </header>
      <p className="landing-lede">
        Small experiments with <a href="https://typesafe.ai/blog/introducing-system-one-models-and-jev">Jev</a>, a System One model: it never writes text, it
        makes typed decisions with probabilities. Code does the rest.
      </p>
      <nav className="landing-cards" aria-label="Demos">
        {DEMOS.map((demo) => (
          <a key={demo.href} className="landing-card" href={demo.href} style={{ '--stop': demo.accent } as React.CSSProperties}>
            <span className="landing-card-name">{demo.name}</span>
            <span className="landing-card-blurb">{demo.blurb}</span>
            <span className="landing-card-go">Open →</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
