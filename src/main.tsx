import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './landing/Landing'
import { routeFor } from './shell/route'
import { Diamond } from './ui/Diamond'
import { Masthead } from './ui/Masthead'
import './styles.css'

// Each demo is its own chunk: the landing page and the trolley / inbox /
// match demos never download the music engraver (VexFlow is most of the bundle).
const MusicApp = lazy(() => import('./music/MusicApp'))
const TrolleyApp = lazy(() => import('./trolley/TrolleyApp'))
const InboxApp = lazy(() => import('./inbox/InboxApp'))
const MatchApp = lazy(() => import('./match/MatchApp'))

const TITLES: Record<ReturnType<typeof routeFor>, string> = {
  landing: 'Jev Playground',
  music: 'Music · Jev Playground',
  trolley: 'Trolley · Jev Playground',
  inbox: 'Inbox · Jev Playground',
  match: 'Match · Jev Playground',
}

const route = routeFor(window.location.pathname)
document.title = TITLES[route]

/** Shown while a demo's chunk downloads: same shell, same heading position, so nothing jumps when it arrives. */
function RouteLoading({ name }: { name: string }) {
  return (
    <div className="app">
      <Masthead name={name} />
      <p className="route-loading-body">
        <Diamond className="diamond" /> Loading {name}…
      </p>
    </div>
  )
}

function Demo() {
  if (route === 'music') return <MusicApp />
  if (route === 'trolley') return <TrolleyApp />
  if (route === 'inbox') return <InboxApp />
  if (route === 'match') return <MatchApp />
  return <Landing />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<RouteLoading name={route} />}>
      <Demo />
    </Suspense>
  </StrictMode>,
)
