import { MODULE_ID, createQueue, isPrimaryGM } from '../core/runtime.mjs'
import { CONDITIONS } from '../statuses/index.mjs'
import { integer } from '../statuses/base.mjs'

export const MANUAL_TRANSITIONS = Object.freeze({
  awaiting: Object.freeze({ CONFIRM: 'preparing', SKIP: 'skipped' }),
  preparing: Object.freeze({ READY: 'applying', FAIL: 'failed' }),
  failed: Object.freeze({ CONFIRM: 'preparing', SKIP: 'skipped' }),
  applying: Object.freeze({ COMPLETE: 'applied', FAIL: 'uncertain' }),
  applied: Object.freeze({}),
  skipped: Object.freeze({}),
  uncertain: Object.freeze({})
})

export function getNextManualResolutionState (state, event) {
  const next = MANUAL_TRANSITIONS[state]?.[event]
  if (!next)
    throw new Error(
      `Invalid manual application transition: ${state} / ${event}`
    )
  return next
}

export function getManualResolutionState (message, key) {
  const stored = message
    .getFlag(MODULE_ID, 'manualApplicationStates')
    ?.find(record => record.key === key)
  if (stored) return stored
  if ((message.getFlag(MODULE_ID, 'resolvedEffects') ?? []).includes(key)) {
    const skipped =
      message
        .getFlag(MODULE_ID, 'manualStatusDecisions')
        ?.find(record => record.key === key)?.choice === 'skip'
    return { key, state: skipped ? 'skipped' : 'applied' }
  }
  return { key, state: 'awaiting' }
}

const enqueue = createQueue()
export function resolveManualStatusApplications (message) {
  if (!isPrimaryGM()) return Promise.resolve()
  return enqueue(message.uuid ?? message.id ?? message, async () => {
    const decisions = new Map(
      (message.getFlag(MODULE_ID, 'manualStatusDecisions') ?? []).map(d => [
        d.key,
        d
      ])
    )
    for (const request of message.getFlag(MODULE_ID, 'manualStatusPrompts') ??
      []) {
      const decision = decisions.get(request.key)
      if (!decision || !['confirm', 'skip'].includes(decision.choice)) continue
      let record = getManualResolutionState(message, request.key)
      if (!['awaiting', 'failed'].includes(record.state)) continue
      const attempt = decision.attempt ?? 1
      if (record.state === 'failed' && record.attempt === attempt) continue
      const move = async (event, extra = {}) => {
        const next = {
          key: request.key,
          state: getNextManualResolutionState(record.state, event),
          attempt,
          ...extra
        }
        const records =
          message.getFlag(MODULE_ID, 'manualApplicationStates') ?? []
        await message.setFlag(MODULE_ID, 'manualApplicationStates', [
          ...records.filter(r => r.key !== request.key),
          next
        ])
        record = next
      }
      if (decision.choice === 'skip') {
        await move('SKIP')
        continue
      }
      await move('CONFIRM')
      try {
        const uuid =
          message.getFlag(MODULE_ID, 'manualStatusActivity') ??
          message.system?.activity?.uuid
        const activity = uuid ? await fromUuid(uuid) : null
        const actor = await fromUuid(request.actorUuid)
        if (!activity || !actor?.isOwner || !CONDITIONS[request.condition])
          throw new Error('Unexpected Error.')
        if (request.kind === 'conversion') {
          const api = game.modules.get(MODULE_ID).api
          const rollData =
            activity.getRollData?.() ?? activity.actor?.getRollData?.() ?? {}
          const plan = await api.planConversion(
            actor,
            request.conversion,
            rollData
          )
          await move('READY', { plan })
          await api.convert(actor, request.conversion, {
            message,
            key: request.key,
            rollData,
            preparedPlan: plan
          })
          await move('COMPLETE', { plan })
          continue
        }
        const count =
          CONDITIONS[request.condition].counted === false
            ? 1
            : integer(
                (
                  await new Roll(
                    request.formula,
                    activity.getRollData?.() ??
                      activity.actor?.getRollData?.() ??
                      {}
                  ).evaluate()
                ).total
              )
        await move('READY', { count })
        if (count)
          await game.modules
            .get(MODULE_ID)
            .api.addCount(actor, request.condition, count, { message })
        await move('COMPLETE', { count })
      } catch (error) {
        if (['preparing', 'applying'].includes(record.state))
          await move('FAIL', { error: error.message })
        ui.notifications.error(error.message)
      }
    }
  })
}
