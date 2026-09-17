import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './landing/Landing'
import { routeFor } from './shell/route'
import { Diamond } from './ui/Diamond'
import './styles.css'

// Each demo is its own chunk: the landing page and the trolley never download
// the music engraver (VexFlow is most of the bundle).
const MusicApp = lazy(() => import('./music/MusicApp'))
const TrolleyApp = lazy(() => import('./trolley/TrolleyApp'))

const route = routeFor(window.location.pathname)
document.title = route === 'music' ? 'Music · Jev Playground' : route === 'trolley' ? 'Trolley · Jev Playground' : 'Jev Playground'

/** Shown while a demo's chunk downloads: same shell, same heading position, so nothing jumps when it arrives. */
function RouteLoading({ name }: { name: string }) {
  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>
            <a className="home-link" href="/">Jev Playground</a> <span className="muted">/ {name}</span>
          </h1>
        </div>
      </header>
      <p className="route-loading-body">
        <Diamond className="diamond" /> Loading {name}…
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<RouteLoading name={route} />}>{route === 'music' ? <MusicApp /> : route === 'trolley' ? <TrolleyApp /> : <Landing />}</Suspense>
  </StrictMode>,
)
