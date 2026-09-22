import { choiceConfidence, clamp01, softmax } from '../shared/jevMath'
import {
  REASON_IDS,
  TRIAGE_ACTIONS,
  type ActionScores,
  type ChoiceLike,
  type InboxItem,
  type ReasonActivations,
  type ReasonId,
  type ReasonSettings,
  type TriageAction,
  type TriageResult,
} from './types'

export { choiceConfidence, clamp01, softmax } from '../shared/jevMath'

export const REASON_CATALOG: Record<
  ReasonId,
  {
    label: string
    blurb: string
    /** How this reason pulls the Delete / Review / Leave triad. */
    pull: ActionScores
  }
> = {
  spam: {
    label: 'Spam',
    blurb: 'Scam, phishing, or bulk junk with no relationship.',
    pull: { Delete: 1, Review: 0.12, Leave: 0 },
  },
  promotional: {
    label: 'Promotional',
    blurb: 'Sales, coupons, win-backs, abandoned-cart pings.',
    pull: { Delete: 0.74, Review: 0.2, Leave: 0.06 },
  },
  someday: {
    label: 'Maybe later',
    blurb: 'Could be useful one day; not a reason to keep it on top.',
    pull: { Delete: 0.16, Review: 0.64, Leave: 0.2 },
  },
  person: {
    label: 'Real person',
    blurb: 'A human wrote this to you, not a list or a bot.',
    pull: { Delete: 0.02, Review: 0.28, Leave: 0.9 },
  },
  receipt: {
    label: 'Receipt / bill',
    blurb: 'Transaction, invoice, statement — keep or file, do not chat.',
    pull: { Delete: 0.08, Review: 0.46, Leave: 0.56 },
  },
  reminder: {
    label: 'Reminder',
    blurb: 'A pledge, calendar ping, or nag you set up on purpose.',
    pull: { Delete: 0.04, Review: 0.34, Leave: 0.82 },
  },
  recruiting: {
    label: 'Recruiting',
    blurb: 'Jobs, sourcers, inbound roles — usually worth a glance.',
    pull: { Delete: 0.22, Review: 0.72, Leave: 0.16 },
  },
  newsletter: {
    label: 'Newsletter',
    blurb: 'Opt-in digest or list mail. Fine to sweep.',
    pull: { Delete: 0.5, Review: 0.34, Leave: 0.16 },
  },
  security: {
    label: 'Security',
    blurb: 'Sign-in, password, or account risk. A person should look.',
    pull: { Delete: 0.02, Review: 0.9, Leave: 0.24 },
  },
}

export const DEFAULT_REASON_SETTINGS: ReasonSettings = {
  spam: { enabled: true, weight: 1 },
  promotional: { enabled: true, weight: 1 },
  someday: { enabled: true, weight: 0.7 },
  person: { enabled: true, weight: 1.15 },
  receipt: { enabled: true, weight: 1 },
  reminder: { enabled: true, weight: 1.1 },
  recruiting: { enabled: true, weight: 0.9 },
  newsletter: { enabled: true, weight: 0.85 },
  security: { enabled: true, weight: 1.25 },
}

const ZERO_ACTIVATIONS: ReasonActivations = {
  spam: 0,
  promotional: 0,
  someday: 0,
  person: 0,
  receipt: 0,
  reminder: 0,
  recruiting: 0,
  newsletter: 0,
  security: 0,
}

export function emptyActivations(): ReasonActivations {
  return { ...ZERO_ACTIVATIONS }
}

export function argmaxAction(scores: ActionScores): TriageAction {
  let best: TriageAction = 'Review'
  let bestScore = Number.NEGATIVE_INFINITY
  for (const action of TRIAGE_ACTIONS) {
    const score = scores[action]
    if (score > bestScore) {
      best = action
      bestScore = score
    }
  }
  return best
}

export function effectiveWeight(settings: ReasonSettings, id: ReasonId): number {
  const policy = settings[id]
  if (!policy.enabled) return 0
  return Math.max(0, policy.weight)
}

export function scoreActions(activations: ReasonActivations, settings: ReasonSettings): TriageResult {
  const raw: ActionScores = { Delete: 0, Review: 0, Leave: 0 }
  const reasons: TriageResult['reasons'] = []
  let mass = 0

  for (const id of REASON_IDS) {
    const activation = clamp01(activations[id] ?? 0)
    const weight = effectiveWeight(settings, id)
    const contribution = activation * weight
    reasons.push({ id, weight, activation })
    if (contribution <= 0) continue
    mass += contribution
    const pull = REASON_CATALOG[id].pull
    raw.Delete += contribution * pull.Delete
    raw.Review += contribution * pull.Review
    raw.Leave += contribution * pull.Leave
  }

  const logits = mass <= 1e-6 ? [1, 1, 1] : TRIAGE_ACTIONS.map((action) => raw[action] / mass)

  const [deleteP, reviewP, leaveP] = softmax(logits)
  const scores: ActionScores = {
    Delete: deleteP ?? 1 / 3,
    Review: reviewP ?? 1 / 3,
    Leave: leaveP ?? 1 / 3,
  }
  const recommended = argmaxAction(scores)
  const choice: ChoiceLike = {
    type: 'choice',
    choice: recommended,
    confidence: choiceConfidence([scores.Delete, scores.Review, scores.Leave]),
    probabilities: scores,
  }

  const ranked = reasons.toSorted((a, b) => b.activation * b.weight - a.activation * a.weight)

  return { recommended, scores, reasons: ranked, choice }
}

export function triageItem(item: InboxItem, settings: ReasonSettings): TriageResult {
  return scoreActions(item.reasons, settings)
}

function normalizeScores(scores: ActionScores): ActionScores {
  const sum = TRIAGE_ACTIONS.reduce((total, action) => total + Math.max(0, scores[action] ?? 0), 0)
  if (sum <= 1e-8) return { Delete: 1 / 3, Review: 1 / 3, Leave: 1 / 3 }
  return {
    Delete: Math.max(0, scores.Delete) / sum,
    Review: Math.max(0, scores.Review) / sum,
    Leave: Math.max(0, scores.Leave) / sum,
  }
}

/**
 * Geometric mix of the code triad (tags × weights) and Jev’s Delete / Review /
 * Leave Choice. Either side can move the result; a later weight edit re-mixes
 * without asking Jev again. Reasons stay the tag list from `scoreActions`.
 */
export function mixActionScores(fromTags: ActionScores, fromChoice: ActionScores): ActionScores {
  const tags = normalizeScores(fromTags)
  const choice = normalizeScores(fromChoice)
  const raw = TRIAGE_ACTIONS.map((action) => Math.sqrt(tags[action] * choice[action]))
  const sum = raw.reduce((total, value) => total + value, 0)
  if (sum <= 1e-8) return { Delete: 1 / 3, Review: 1 / 3, Leave: 1 / 3 }
  return {
    Delete: (raw[0] ?? 0) / sum,
    Review: (raw[1] ?? 0) / sum,
    Leave: (raw[2] ?? 0) / sum,
  }
}

export function scoreActionsWithChoice(activations: ReasonActivations, settings: ReasonSettings, jevChoice: ActionScores | null): TriageResult {
  const coded = scoreActions(activations, settings)
  if (!jevChoice) return coded
  const scores = mixActionScores(coded.scores, jevChoice)
  const recommended = argmaxAction(scores)
  return {
    ...coded,
    recommended,
    scores,
    choice: {
      type: 'choice',
      choice: recommended,
      confidence: choiceConfidence([scores.Delete, scores.Review, scores.Leave]),
      probabilities: scores,
    },
  }
}

export function cloneSettings(settings: ReasonSettings): ReasonSettings {
  const next = { ...DEFAULT_REASON_SETTINGS }
  for (const id of REASON_IDS) {
    const policy = settings[id]
    next[id] = { enabled: policy.enabled, weight: policy.weight }
  }
  return next
}

export function jitterActivations(activations: ReasonActivations, random: () => number, spread = 0.07): ReasonActivations {
  const next = emptyActivations()
  for (const id of REASON_IDS) {
    next[id] = clamp01((activations[id] ?? 0) + (random() - 0.5) * 2 * spread)
  }
  return next
}
