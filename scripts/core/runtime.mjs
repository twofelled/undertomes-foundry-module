export const MODULE_ID = 'undertomes-limbus'
export const STATUS_MANAGER_LABEL = 'LC Status Manager (selected token)'
export const RESOLUTION_TRANSITIONS = Object.freeze({
  awaiting: Object.freeze({ START: 'preparing' }),
  preparing: Object.freeze({ READY: 'applying', FAIL: 'failed' }),
  failed: Object.freeze({ START: 'preparing' }),
  applying: Object.freeze({ COMPLETE: 'completed', FAIL: 'uncertain' }),
  completed: Object.freeze({}),
  uncertain: Object.freeze({})
})

export function getNextResolutionState (state, event) {
  const next = RESOLUTION_TRANSITIONS[state]?.[event]
  if (!next)
    throw new Error(`Invalid resolution transition: ${state} / ${event}`)
  return next
}

export function storedEffectChanges (effect) {
  const changes =
    effect.system?.toObject?.().changes ??
    effect.toObject?.().system?.changes ??
    effect.system?.changes ??
    effect.changes ??
    []
  return changes.map(({ effect: owner, ...change }) => change)
}

export function statusEffectName (definition, currentName) {
  if (
    currentName?.startsWith(definition.name) &&
    /^\s+\(\d+\)$/.test(currentName.slice(definition.name.length))
  )
    return definition.name
  return currentName || definition.name
}

export function escapeHTML (value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }
  return String(value).replace(/[&<>"']/g, character => entities[character])
}

export function conditionEffect (actor, condition, activeOnly = false) {
  return actor?.effects.find(effect => {
    if (effect.getFlag(MODULE_ID, 'condition') !== condition) return false
    return !activeOnly || (!effect.disabled && !effect.isSuppressed)
  })
}

export function conditionCount (actor, condition, activeOnly = false) {
  const effect = conditionEffect(actor, condition, activeOnly)
  return effect?.getFlag(MODULE_ID, 'uncounted')
    ? 1
    : Number(effect?.getFlag(MODULE_ID, 'count') ?? 0)
}

export function createQueue () {
  const pendingOperations = new Map()
  return async function enqueue (key, operation) {
    const previous = pendingOperations.get(key) ?? Promise.resolve()
    const current = previous.catch(() => {}).then(operation)
    pendingOperations.set(key, current)
    try {
      return await current
    } finally {
      if (pendingOperations.get(key) === current) pendingOperations.delete(key)
    }
  }
}

const enqueueResolution = createQueue()
export function getResolutionState (message, key) {
  const stored = message
    .getFlag(MODULE_ID, 'resolutionStates')
    ?.find(entry => entry.key === key)
  if (stored) return stored
  return {
    key,
    state: (message.getFlag(MODULE_ID, 'resolvedEffects') ?? []).includes(key)
      ? 'completed'
      : 'awaiting'
  }
}

export function resolveMessageEffect (
  message,
  key,
  operation,
  { prepare = async () => undefined } = {}
) {
  return enqueueResolution(message.uuid ?? message.id ?? message, async () => {
    let record = getResolutionState(message, key)
    if (record.state === 'completed') return
    if (!['awaiting', 'failed'].includes(record.state))
      throw new Error(
        'This resolution was interrupted or may already have applied. Check damage and counts before resolving manually.'
      )
    const move = async (event, extra = {}) => {
      const next = {
        ...record,
        key,
        state: getNextResolutionState(record.state, event),
        ...extra
      }
      const records = message.getFlag(MODULE_ID, 'resolutionStates') ?? []
      const nextRecords = [...records.filter(entry => entry.key !== key), next]
      const retained =
        message.documentName === 'Actor'
          ? [
              ...nextRecords.filter(entry => entry.state !== 'completed'),
              ...nextRecords
                .filter(entry => entry.state === 'completed')
                .slice(-200)
            ]
          : nextRecords
      await message.setFlag(MODULE_ID, 'resolutionStates', retained)
      record = next
    }
    await move('START')
    try {
      const prepared = await prepare()
      await move(
        'READY',
        prepared?.workflowPlan ? { plan: prepared.workflowPlan } : {}
      )
      const result = await operation(prepared)
      await move('COMPLETE')
      const done = message.getFlag(MODULE_ID, 'resolvedEffects') ?? []
      if (!done.includes(key))
        await message.setFlag(
          MODULE_ID,
          'resolvedEffects',
          message.documentName === 'Actor'
            ? [...done, key].slice(-200)
            : [...done, key]
        )
      return result
    } catch (error) {
      if (record.state === 'preparing' || record.state === 'applying')
        await move('FAIL', { error: error.message })
      throw error
    }
  })
}

export function createBatchRefresh (refresh) {
  const pendingOperations = new Set()
  let scheduled = false
  return {
    add (document) {
      if (!document) return
      pendingOperations.add(document)
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        const batch = [...pendingOperations]
        pendingOperations.clear()
        for (const entry of batch) refresh(entry)
      })
    },
    clear () {
      pendingOperations.clear()
    }
  }
}

export function isDowned (actor) {
  const hp = actor?.system?.attributes?.hp?.value
  return hp !== undefined && hp !== null && Number(hp) <= 0
}

export function isPrimaryGM () {
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}
