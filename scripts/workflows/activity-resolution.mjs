import {
  MODULE_ID,
  resolveMessageEffect,
  escapeHTML,
  isDowned,
  isPrimaryGM
} from '../core/runtime.mjs'
import {
  createActivityResolutionContext,
  getActivityOutcome,
  getStatusApplications,
  getApplicationTrigger,
  getActivityConversion
} from '../activities/activity-helpers.mjs'
import { CONDITIONS } from '../statuses/index.mjs'
import { integer } from '../statuses/base.mjs'

export async function processActivityStatuses (message, messageContext) {
  if (
    !isPrimaryGM() ||
    !['attack', 'save', 'usage'].includes(message.type) ||
    !message.system?.activity?.uuid
  )
    return
  const context =
    messageContext === undefined
      ? await createActivityResolutionContext(message)
      : messageContext
  const activity = context?.activity
  if (!activity) return
  const source = activity.actor ?? activity.item?.actor
  if (!source?.isOwner || isDowned(source)) return
  const entries = Object.entries(getStatusApplications(activity)).filter(
    ([id, value]) => Object.hasOwn(CONDITIONS, id) && value?.enabled === true
  )
  if (!entries.length) return
  if (
    message.type === 'usage' &&
    !message.system.cause &&
    message.getFlag(MODULE_ID, 'manualStatusPrompts') === undefined
  ) {
    const prompts = []
    for (const [condition, config] of entries) {
      if (getApplicationTrigger(activity, config) !== 'manual') continue
      const targets =
        config.recipient === 'self'
          ? [source.uuid]
          : (message.system.targets ?? []).map(t => t.actor)
      for (const uuid of new Set(targets.filter(Boolean))) {
        const actor = await context.actorFromUuid(uuid)
        if (!actor?.isOwner) continue
        prompts.push({
          key: `manual-status:${condition}:${uuid}`,
          condition,
          actorUuid: uuid,
          actorName: actor.name ?? uuid,
          formula: String(config.formula ?? '1'),
          description: String(config.description ?? '')
        })
      }
    }
    if (prompts.length) {
      await resolveMessageEffect(message, 'manual-status-prompt', async () => {
        const card = await ChatMessage.create({
          author: message.author?.id ?? game.user.id,
          speaker: message.speaker ?? ChatMessage.getSpeaker({ actor: source }),
          content: `<p><strong>Special/Manual: ${escapeHTML(
            activity.name ?? activity.item?.name ?? 'Status application'
          )}</strong></p>`,
          whisper: message.whisper ?? [],
          blind: message.blind ?? false,
          flags: {
            [MODULE_ID]: {
              manualStatusPrompts: prompts,
              manualStatusActivity: activity.uuid,
              manualStatusSource: message.uuid
            }
          }
        })
        await message.setFlag(
          MODULE_ID,
          'manualStatusPromptMessage',
          card.uuid ?? card.id
        )
      })
    }
  }
  const outcome = getActivityOutcome(message, activity)
  if (!outcome || (outcome.event === 'hit' && !outcome.targets.length)) return
  const { event, targets: targetUuids } = outcome
  let receipt = message
  const origin = message.system.origin
  const originMessage =
    typeof origin === 'string'
      ? game.messages.get(origin) ??
        (origin.includes('.') ? await fromUuid(origin) : null)
      : origin
  if (originMessage?.setFlag) receipt = originMessage
  for (const [condition, config] of entries) {
    if (getApplicationTrigger(activity, config) !== event) continue
    if (event !== 'use' && !targetUuids.some(Boolean)) continue
    const uuids = config.recipient === 'self' ? [source.uuid] : targetUuids
    for (const uuid of new Set(uuids.filter(Boolean))) {
      const actor = await context.actorFromUuid(uuid)
      if (!actor?.isOwner || isDowned(actor)) continue
      const key = `apply-status:${
        activity.id ?? activity.uuid
      }:${condition}:${uuid}`
      if ((receipt.getFlag(MODULE_ID, 'resolvedEffects') ?? []).includes(key))
        continue
      await resolveMessageEffect(
        receipt,
        key,
        async count => {
          if (count && !isDowned(actor))
            await game.modules
              .get(MODULE_ID)
              .api.addCount(actor, condition, count, { message })
        },
        {
          prepare: async () => {
            if (CONDITIONS[condition].counted === false) return 1
            const roll = await new Roll(
              String(config.formula ?? '1'),
              activity.getRollData?.() ?? source.getRollData?.() ?? {}
            ).evaluate()
            return integer(roll.total)
          }
        }
      )
    }
  }
}

export async function processActivityConversion (message, messageContext) {
  if (!isPrimaryGM() || !message.system?.activity?.uuid) return
  const context =
    messageContext === undefined
      ? await createActivityResolutionContext(message)
      : messageContext
  const activity = context?.activity
  const config = getActivityConversion(activity)
  const source = activity?.actor ?? activity?.item?.actor
  if (
    !config.enabled ||
    !config.sources?.length ||
    !source?.isOwner ||
    isDowned(source)
  )
    return
  const trigger = getApplicationTrigger(activity, config)
  const outcome = getActivityOutcome(message, activity)
  if (
    !outcome ||
    (trigger === 'manual' ? outcome.event !== 'use' : outcome.event !== trigger)
  )
    return
  const { targets } = outcome
  let receipt = message
  if (message.type === 'save') {
    const origin = message.system.origin
    receipt =
      typeof origin === 'string'
        ? game.messages.get(origin) ?? message
        : origin?.setFlag
        ? origin
        : message
  }
  if (trigger !== 'use' && trigger !== 'manual' && !targets.some(Boolean))
    return
  const uuids = config.recipient === 'self' ? [source.uuid] : targets
  const actors = (
    await Promise.all(
      [...new Set(uuids.filter(Boolean))].map(uuid =>
        context.actorFromUuid(uuid)
      )
    )
  ).filter(actor => actor?.isOwner && !isDowned(actor))
  const api = game.modules.get(MODULE_ID).api
  if (trigger === 'manual') {
    if (!actors.length) return
    await resolveMessageEffect(
      message,
      'manual-conversion-prompt',
      async () => {
        const prompts = actors.map(actor => ({
          kind: 'conversion',
          key: `conversion:${activity.id}:${actor.uuid}`,
          actorUuid: actor.uuid,
          actorName: actor.name,
          condition: config.destination,
          conversion: config,
          description: config.description ?? '',
          formula: 'conversion'
        }))
        await ChatMessage.create({
          author: message.author?.id ?? game.user.id,
          speaker: message.speaker,
          content: `<p><strong>Convert status count: ${escapeHTML(
            activity.name ?? ''
          )}</strong></p>`,
          whisper: message.whisper ?? [],
          blind: Boolean(message.blind),
          flags: {
            [MODULE_ID]: {
              manualStatusPrompts: prompts,
              manualStatusActivity: activity.uuid,
              manualStatusSource: message.uuid
            }
          }
        })
      }
    )
    return
  }
  for (const actor of actors)
    await api.convert(actor, config, {
      message: receipt,
      key: `conversion:${activity.id}:${actor.uuid}`,
      rollData: activity.getRollData?.() ?? source.getRollData?.() ?? {}
    })
}
