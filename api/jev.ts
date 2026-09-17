// Vercel serverless function (Node runtime, Web-standard signature).
// All logic lives in server/jevHandler.ts so `npm run dev` can serve the same
// endpoint from Vite middleware.

import { handleJev } from '../server/jevHandler.js'

// Module-scoped so this file type-checks without @types/node (see api/tsconfig.json).
declare const process: { env: Record<string, string | undefined> }

export const GET = (request: Request) => handleJev(request, process.env)
export const POST = (request: Request) => handleJev(request, process.env)
