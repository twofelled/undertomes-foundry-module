import {
  MODULE_ID,
  isPrimaryGM,
  isDowned,
  conditionCount,
  resolveMessageEffect as once,
  createQueue,
  resolveMessageEffect
} from '../core/runtime.mjs'
import { createActivityResolutionContext } from '../activities/activity-helpers.mjs'
import { isStatusAutomated } from '../automation/settings.mjs'
import {
  dispatchStatusEvent,
  TREMOR_STATUSES,
  getStatus
} from '../statuses/index.mjs'
import { getAttackDamageType } from '../activities/weapon-damage.mjs'
import { recordAttackActions } from './attack-resolution.mjs'

const ACTION_TYPES = new Set([
  'action',
  'bonus',
  'reaction',
  'legendary',
  'lair',
  'attack',
  'minute',
  'hour'
])
const activeCount = (actor, id) => conditionCount(actor, id, true)

export function getNaturalAttackRoll (roll) {
  const die = roll?.d20 ?? roll?.dice?.find(d => d.faces === 20)
  const kept = die?.results?.filter(r => r.active !== false && !r.discarded)
  return kept?.length === 1 ? Number(kept[0].result) : null
}

export async function processCombatEffects (
  message,
  { resolveBursts = true, onlyBursts = false, messageContext } = {}
) {
  if (
    !isPrimaryGM() ||
    !['usage', 'attack', 'save'].includes(message.type) ||
    !message.system?.activity?.uuid
  )
    return
  const loaded =
    messageContext === undefined
      ? await createActivityResolutionContext(message)
      : messageContext
  const activity = loaded?.activity
  if (!activity) return
  const item = activity.item
  const actor = activity.actor ?? item?.actor ?? message.getAssociatedActor?.()
  if (!actor?.isOwner || isDowned(actor)) return
  const api = game.modules.get(MODULE_ID).api
  const origin = message.system.origin
  const receipt =
    typeof origin === 'string'
      ? game.messages.get(origin) ?? message
      : origin?.setFlag
      ? origin
      : message
  const context = {
    actor,
    activity,
    item,
    message,
    receipt,
    action: ACTION_TYPES.has(
      activity.activation?.type || item?.system?.activation?.type
    ),
    burst: activity.flags?.[MODULE_ID]?.tremorBurst,
    activeCount,
    naturalAttackRoll: getNaturalAttackRoll,
    attackDamageType: getAttackDamageType,
    actorFromUuid: loaded.actorFromUuid,
    notify: text => ui.notifications.warn(text),
    enabled: definition =>
      (!onlyBursts || definition.tremorFamily) && isStatusAutomated(definition),
    async resolveBurst (target, claimReceipt = message) {
      if (!resolveBursts) return
      if (!target?.isOwner) return
      if (
        !TREMOR_STATUSES.some(
          definition =>
            isStatusAutomated(definition) && activeCount(target, definition.id)
        )
      )
        return
      await once(claimReceipt, `tremor-burst:${target.uuid}`, () =>
        api.burst(target, { automatic: true })
      )
    },
    async resolveStatus (definition, target, options = {}, claim = {}) {
      if (onlyBursts) return
      if (
        !target?.isOwner ||
        isDowned(target) ||
        !activeCount(target, definition.id)
      )
        return
      await once(
        claim.receipt ?? message,
        `${claim.prefix ?? definition.id}:${target.uuid}`,
        () => api.trigger(target, definition.id, options)
      )
    }
  }
  if (message.type === 'save') {
    await dispatchStatusEvent('save', context)
    return
  }
  if (message.type === 'usage') {
    await dispatchStatusEvent('usage', context)
    return
  }
  if (message.rolls?.length !== 1) return
  await dispatchStatusEvent('attackAction', context)
  const hits = [
    ...new Set(
      (message.system.evaluatedTargets ?? [])
        .filter(t => t.isMiss === false)
        .map(t => t.actor)
        .filter(Boolean)
    )
  ]
  const targets = (
    await Promise.all(hits.map(uuid => loaded.actorFromUuid(uuid)))
  ).filter(a => a?.isOwner && !isDowned(a))
  if (!onlyBursts) await recordAttackActions(message, context, targets)
  for (const target of targets)
    await dispatchStatusEvent('hit', { ...context, target })
  await dispatchStatusEvent('attackComplete', { ...context, targets })
}

const enqueueDamageTargetUpdate = createQueue()

export function createDamageTargetDescriptor (actor) {
  const token = actor.token ?? actor.getActiveTokens?.(false, true)?.[0]
  return {
    actor: actor.uuid,
    token: token?.uuid ?? null,
    name: token?.name ?? actor.name,
    img: token?.texture?.src ?? actor.img,
    ac: actor.system?.attributes?.ac?.value ?? null
  }
}

export async function ensureRecordedDamageTarget (message) {
  if (
    !isPrimaryGM() ||
    message.type !== 'damage' ||
    message.system?.targets?.length
  )
    return
  const uuid = message.getFlag(MODULE_ID, 'targetUuid')
  if (!uuid || !message.getFlag(MODULE_ID, 'condition')) return
  return enqueueDamageTargetUpdate(
    message.uuid ?? message.id ?? message,
    async () => {
      if (message.system?.targets?.length) return
      const actor = await fromUuid(uuid)
      if (actor)
        await message.update({
          'system.targets': [createDamageTargetDescriptor(actor)]
        })
    }
  )
}

export async function rollEffectDamage (
  actor,
  condition,
  result,
  { targetActor } = {}
) {
  const definition = getStatus(condition)
  const type =
    result.type === 'untyped' && definition.damageTypeSetting
      ? game.settings.get(MODULE_ID, definition.damageTypeSetting)
      : result.type
  if (!CONFIG.DND5E.damageTypes[type])
    throw new Error('Choose a valid damage type before triggering the effect.')
  const RollClass = CONFIG.Dice.DamageRoll
  const recipient = definition.recipient === 'target' ? targetActor : actor
  if (!recipient)
    throw new Error('Target one creature to receive the bonus damage.')
  const roll = await new RollClass(
    `${result.formula}[${type}]`,
    {},
    { type, isCritical: Boolean(definition.canCrit && result.isCritical) }
  ).evaluate()
  const automatic =
    game.settings.get(MODULE_ID, 'autoApplyDamage') && recipient?.isOwner
  const state = {
    condition,
    type,
    actorUuid: actor.uuid,
    targetUuid: recipient?.uuid ?? null,
    automatic: Boolean(automatic),
    applied: false
  }
  const message = await roll.toMessage({
    type: 'damage',
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: '',
    system: { targets: [createDamageTargetDescriptor(recipient)] },
    flags: { [MODULE_ID]: state }
  })
  if (automatic) {
    await resolveMessageEffect(message, 'apply-status-damage', async () => {
      await recipient.applyDamage(
        [{ value: roll.total, type, properties: new Set() }],
        {
          origin: message
        }
      )
      await message.setFlag(MODULE_ID, 'applied', true)
    })
  }
  return { roll, message, automatic: Boolean(automatic) }
}
