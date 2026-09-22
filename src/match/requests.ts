// Everything the match demo asks Jev, as pure functions:
// MatchOp → { state, questions }. The browser posts the committed “you”
// profile plus candidate ids from the fictional pool. The server re-validates
// closed hobbies / looking-for / energy and looks the people up itself.
//
// Per candidate, in one parallel fan-out:
//   • Nouls for shared hobbies, looking-for overlap, and complement
//   • a Score for overall fit, judged on those same lists
// Code writes the hypothesis and every reason note. Free text (name, city,
// bio) is state data only, and only after the same narrow check the trolley
// custom label uses — never copied into instructions.
//
// NOTE: imported by the /api/jev serverless chain → explicit `.js` extensions.

import type { Json, NoulQuestion, Question, ScoreQuestion, SystemOneRequest } from '../planner/jev/systemOne.js'
import { PEOPLE } from './people.js'
import { ENERGIES, HOBBIES, LOOKING_FOR, type Energy, type Hobby, type LookingFor, type YouProfile } from './types.js'

export type MatchYouInput = {
  name: string
  city: string
  bio: string
  energy: Energy
  hobbies: Hobby[]
  lookingFor: LookingFor[]
}

export type MatchOp = { op: 'match_rank'; you: MatchYouInput; ids: string[] }

export class MatchValidationError extends Error {}

export const isMatchOp = (raw: unknown): boolean => (raw as { op?: unknown } | null)?.op === 'match_rank'

export const MATCH_SCORE_LEVELS = [
  'No match: hobbies and looking-for lists barely touch.',
  'A thin match: one shared interest, little else.',
  'A real match: several hobbies or wishes line up.',
  'A strong match: hobbies and looking-for both line up closely.',
] as const

const MAX_NAME = 48
const MAX_CITY = 48
const MAX_BIO = 240
const PLAIN = /^[\p{L}\p{N}][\p{L}\p{N} '’\-.,&!?]*$/u

const BY_ID = new Map(PEOPLE.map((person) => [person.id, person]))

export type MatchQuestionKind = 'hobbies' | 'looking_for' | 'complement' | 'fit'

export const matchQuestionId = (personId: string, kind: MatchQuestionKind) => `${personId}__${kind}`

const noul = (instructions: string, criteria: { true: string; false: string }): NoulQuestion => ({ type: 'noul', instructions, criteria })

const FIT: Omit<ScoreQuestion, 'instructions'> = {
  type: 'score',
  criteria: [...MATCH_SCORE_LEVELS],
}

function plain(value: unknown, path: string, max: number, allowEmpty: boolean): string {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(value)) {
    throw new MatchValidationError(`${path}: plain text only`)
  }
  const text = value.trim().replace(/ +/g, ' ')
  if (text.length === 0 && allowEmpty) return ''
  if (text.length < 1 || text.length > max || !PLAIN.test(text)) {
    throw new MatchValidationError(`${path}: 1–${max} letters, digits, spaces or ' - . , & ! ?`)
  }
  return text
}

function closedList<T extends string>(value: unknown, allowed: readonly T[], path: string): T[] {
  if (!Array.isArray(value) || value.length > allowed.length) throw new MatchValidationError(`${path}: expected a list from the closed table`)
  const out: T[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string' || !allowed.includes(entry as T)) throw new MatchValidationError(`${path}: not in the closed table`)
    if (seen.has(entry)) throw new MatchValidationError(`${path}: duplicate`)
    seen.add(entry)
    out.push(entry as T)
  }
  return out
}

export function parseYouProfile(raw: unknown): MatchYouInput {
  if (!raw || typeof raw !== 'object') throw new MatchValidationError('op.you: expected an object')
  const obj = raw as Record<string, unknown>
  const energy = obj.energy
  if (typeof energy !== 'string' || !ENERGIES.includes(energy as Energy)) throw new MatchValidationError('op.you.energy: not in the closed table')
  return {
    name: plain(obj.name, 'op.you.name', MAX_NAME, true),
    city: plain(obj.city, 'op.you.city', MAX_CITY, true),
    bio: plain(obj.bio, 'op.you.bio', MAX_BIO, true),
    energy: energy as Energy,
    hobbies: closedList(obj.hobbies, HOBBIES, 'op.you.hobbies'),
    lookingFor: closedList(obj.lookingFor, LOOKING_FOR, 'op.you.lookingFor'),
  }
}

/** The visitor as Jev sees them: descriptions, closed lists spelled out. */
export function describeYou(you: MatchYouInput): Json {
  return {
    name: you.name,
    city: you.city,
    bio: you.bio,
    energy: you.energy,
    hobbies: [...you.hobbies],
    looking_for: [...you.lookingFor],
  }
}

function describeCandidate(id: string): Json {
  const person = BY_ID.get(id)
  if (!person) throw new MatchValidationError(`op.ids: unknown candidate ${id}`)
  return {
    id: person.id,
    name: person.name,
    age: person.age,
    city: person.city,
    energy: person.energy,
    hobbies: [...person.hobbies],
    looking_for: [...person.lookingFor],
    bio: person.bio,
  }
}

export function buildMatchRequest(op: MatchOp, model: string): SystemOneRequest {
  const questions: Record<string, Question> = {}
  for (const id of op.ids) {
    questions[matchQuestionId(id, 'hobbies')] = noul(
      `Do the hobbies of candidate \`${id}\` in \`candidates\` overlap with the visitor in \`you\` in a way that would matter for spending time together?`,
      { true: 'They share hobbies that are a real reason to meet.', false: 'Their hobbies barely overlap with the visitor.' },
    )
    questions[matchQuestionId(id, 'looking_for')] = noul(
      `Is there real overlap between what the visitor in \`you\` is looking for and what candidate \`${id}\` in \`candidates\` is looking for?`,
      { true: 'They are looking for overlapping things.', false: 'Their looking-for lists do not overlap.' },
    )
    questions[matchQuestionId(id, 'complement')] = noul(
      `Do candidate \`${id}\`'s hobbies in \`candidates\` cover what the visitor in \`you\` listed under looking_for?`,
      { true: 'Their hobbies cover some of what the visitor asked for.', false: 'Their hobbies miss what the visitor asked for.' },
    )
    questions[matchQuestionId(id, 'fit')] = {
      ...FIT,
      instructions: `How good a match is candidate \`${id}\` in \`candidates\` for the visitor in \`you\`? Judge hobbies and what each person is looking for. Everyone here is fictional.`,
    }
  }
  return {
    model,
    state: {
      task: 'Rank fictional people for a visitor using closed hobby and looking-for lists.',
      note: 'Nobody here is a real person. Judge only the lists and short descriptions in state.',
      you: describeYou(op.you),
      candidates: op.ids.map(describeCandidate),
    },
    questions,
  }
}

/** Validate an untrusted op (server side). Throws MatchValidationError. */
export function parseMatchOp(raw: unknown): MatchOp {
  if (!raw || typeof raw !== 'object') throw new MatchValidationError('op: expected an object')
  const obj = raw as Record<string, unknown>
  if (obj.op !== 'match_rank') throw new MatchValidationError('op.op: expected "match_rank"')
  if (!Array.isArray(obj.ids) || obj.ids.length === 0 || obj.ids.length > PEOPLE.length) {
    throw new MatchValidationError(`op.ids: expected 1–${PEOPLE.length} candidate ids`)
  }
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of obj.ids) {
    if (typeof id !== 'string' || !BY_ID.has(id)) throw new MatchValidationError('op.ids: unknown candidate id')
    if (seen.has(id)) throw new MatchValidationError('op.ids: duplicate candidate id')
    seen.add(id)
    ids.push(id)
  }
  return { op: 'match_rank', you: parseYouProfile(obj.you), ids }
}

/** Client helper: a YouProfile is the same shape as the op’s visitor. */
export function youToOp(you: YouProfile): MatchYouInput {
  return parseYouProfile(you)
}
