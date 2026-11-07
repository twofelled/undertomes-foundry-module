import burn from './burn.mjs'
import bleed from './bleed.mjs'
import rupture from './rupture.mjs'
import tremor from './tremor.mjs'
import charge from './charge.mjs'
import poise from './poise.mjs'
import sinking from './sinking.mjs'
import immolation from './immolation.mjs'
import haste from './haste.mjs'
import bind from './bind.mjs'
import immobilized from './immobilized.mjs'
import heavyBleed from './heavy-bleed.mjs'
import hemorrhage from './tremor-hemorrhage.mjs'
import scorch from './tremor-scorch.mjs'
import nails from './nails.mjs'
import fanatic from './fanatic.mjs'
import { integer } from './base.mjs'

export function createStatusRegistry (definitions) {
  const registry = Object.create(null)
  for (const definition of definitions) {
    if (Object.hasOwn(registry, definition.id))
      throw new Error(`Duplicate status: ${definition.id}`)
    registry[definition.id] = definition
  }
  return Object.freeze(registry)
}

export const CONDITIONS = createStatusRegistry([
  burn,
  bleed,
  rupture,
  tremor,
  charge,
  poise,
  sinking,
  immolation,
  haste,
  bind,
  immobilized,
  heavyBleed,
  hemorrhage,
  scorch,
  nails,
  fanatic
])

export const STATUS_DEFINITIONS = Object.freeze(Object.values(CONDITIONS))
export const COUNTED_STATUSES = Object.freeze(
  STATUS_DEFINITIONS.filter(def => def.counted !== false)
)
export const TREMOR_STATUSES = Object.freeze(
  STATUS_DEFINITIONS.filter(def => def.tremorFamily)
)
export const TURN_END_STATUSES = Object.freeze(
  STATUS_DEFINITIONS.filter(def => def.endTurn)
)
export const TURN_START_STATUSES = Object.freeze(
  STATUS_DEFINITIONS.filter(def => def.startTurn)
)
const eventHandlers = new Map()
for (const definition of STATUS_DEFINITIONS) {
  for (const [event, handler] of Object.entries(definition.events)) {
    if (!eventHandlers.has(event)) eventHandlers.set(event, [])
    eventHandlers.get(event).push({ definition, handler })
  }
}

export function getStatus (id) {
  if (!Object.hasOwn(CONDITIONS, id)) throw new Error('Unknown condition.')
  return CONDITIONS[id]
}

export async function dispatchStatusEvent (event, context) {
  for (const { definition, handler } of eventHandlers.get(event) ?? []) {
    if (context.enabled(definition))
      await handler({
        ...context,
        resolve: (actor, options, receipt) =>
          context.resolveStatus(definition, actor, options, receipt)
      })
  }
}

export function resolve (id, count, options = {}) {
  const definition = getStatus(id)
  integer(count, 1)
  if (!definition.resolve)
    throw new Error(
      `${definition.name} is spent manually using Add or Set count.`
    )
  return definition.resolve(count, options)
}

export const STATUS_DESCRIPTIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(CONDITIONS).map(([id, definition]) => [
      id,
      definition.fullDescription ?? []
    ])
  )
)
