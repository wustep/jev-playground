import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './landing/Landing'
import { routeFor } from './shell/route'
import './styles.css'

// Each demo is its own chunk: the landing page and the trolley never download
// the music engraver (VexFlow is most of the bundle).
const MusicApp = lazy(() => import('./music/MusicApp'))
const TrolleyApp = lazy(() => import('./trolley/TrolleyApp'))

const route = routeFor(window.location.pathname)
document.title = route === 'music' ? 'Music · Jev Playground' : route === 'trolley' ? 'Trolley · Jev Playground' : 'Jev Playground'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p className="route-loading">Loading…</p>}>{route === 'music' ? <MusicApp /> : route === 'trolley' ? <TrolleyApp /> : <Landing />}</Suspense>
  </StrictMode>,
)
