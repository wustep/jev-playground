// Three public routes, one bundle entry. No router library: the app has three
// pages and plain links between them (full navigations), so the History API
// isn't needed — only reading the path. Vercel rewrites make direct visits and
// refreshes on /music/ and /trolley/ serve index.html (vercel.json).

export type Route = 'landing' | 'music' | 'trolley'

export function routeFor(pathname: string): Route {
  const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase()
  if (first === 'music') return 'music'
  if (first === 'trolley') return 'trolley'
  return 'landing'
}
