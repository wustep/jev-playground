// Public routes, one bundle entry. No router library: the app has a handful
// of pages and plain links between them (full navigations), so the History API
// isn't needed — only reading the path. Vercel rewrites make direct visits and
// refreshes on /music/, /trolley/, /inbox/ and /match/ serve index.html
// (vercel.json).

export type Route = 'landing' | 'music' | 'trolley' | 'inbox' | 'match'

export function routeFor(pathname: string): Route {
  const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase()
  if (first === 'music') return 'music'
  if (first === 'trolley') return 'trolley'
  if (first === 'inbox') return 'inbox'
  if (first === 'match') return 'match'
  return 'landing'
}
