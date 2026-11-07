import {
  MODULE_ID,
  resolveMessageEffect,
  getResolutionState,
  isDowned,
  isPrimaryGM
} from '../core/runtime.mjs'
import { CONDITIONS, dispatchStatusEvent } from '../statuses/index.mjs'

export async function recordAttackActions (message, context, targets) {
  if (message.getFlag(MODULE_ID, 'attackActions') !== undefined) return
  const actions = []
  const collect = {
    ...context,
    notify: () => {},
    enabled: definition => Boolean(definition.chatButton),
    async resolveStatus (definition, actor, options = {}) {
      if (
        !actor?.isOwner ||
        isDowned(actor) ||
        !context.activeCount(actor, definition.id)
      )
        return
      const { targetActor, ...values } = options
      actions.push({
        key: `${definition.id}:${actor.uuid}`,
        condition: definition.id,
        actorUuid: actor.uuid,
        targetUuid: targetActor?.uuid ?? null,
        targetName: (targetActor ?? actor).name ?? '',
        natural: context.naturalAttackRoll(message.rolls[0]),
        options: values
      })
    }
  }
  for (const target of targets)
    await dispatchStatusEvent('hit', { ...collect, target })
  await dispatchStatusEvent('attackComplete', { ...collect, targets })
  await message.setFlag(MODULE_ID, 'attackActions', actions)
}

export async function resolveAttackAction (message, key) {
  if (!isPrimaryGM()) throw new Error('The active GM resolves status effects.')
  const action = message
    .getFlag(MODULE_ID, 'attackActions')
    ?.find(entry => entry.key === key)
  const definition = CONDITIONS[action?.condition]
  if (!definition?.chatButton) return
  if (getResolutionState(message, key).state === 'completed') return
  const actor = await fromUuid(action.actorUuid)
  const targetActor = action.targetUuid
    ? await fromUuid(action.targetUuid)
    : null
  const effect = actor?.effects.find(
    e =>
      e.getFlag(MODULE_ID, 'condition') === action.condition &&
      !e.disabled &&
      !e.isSuppressed
  )
  const count = Number(effect?.getFlag(MODULE_ID, 'count') ?? 0)
  if (
    !actor?.isOwner ||
    isDowned(actor) ||
    !count ||
    (action.targetUuid && (!targetActor?.isOwner || isDowned(targetActor))) ||
    (definition.chatEligible && !definition.chatEligible(count, action))
  )
    throw new Error(
      'This effect no longer applies. Check the current status and target.'
    )
  return resolveMessageEffect(message, key, () =>
    game.modules.get(MODULE_ID).api.trigger(actor, action.condition, {
      ...action.options,
      ...(targetActor ? { targetActor } : {})
    })
  )
}

export function installAttackActions () {
  Hooks.on('renderChatMessageHTML', (message, html) => {
    if (message.isContentVisible === false) return
    const actions = message.getFlag(MODULE_ID, 'attackActions')
    if (!actions?.length) return
    html.querySelector('.ul-attack-actions')?.remove()
    const group = document.createElement('div')
    group.className = 'ul-attack-actions'
    const done = message.getFlag(MODULE_ID, 'resolvedEffects') ?? []
    for (const action of actions) {
      const definition = CONDITIONS[action.condition]
      if (!definition?.chatButton) continue
      const workflow = getResolutionState(message, action.key)
      const resolved =
        done.includes(action.key) || workflow.state === 'completed'
      const blocked = ['preparing', 'applying', 'uncertain'].includes(
        workflow.state
      )
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = `${definition.chatButton}${
        action.targetName ? `: ${action.targetName}` : ''
      }${resolved ? ' (resolved)' : blocked ? ' (check current state)' : ''}`
      button.disabled = resolved || blocked || !isPrimaryGM()
      if (blocked)
        button.title =
          'Check damage and counts before resolving. The operation may already have been applied.'
      if (!resolved && !isPrimaryGM())
        button.title = 'The active GM resolves status effects.'
      button.addEventListener('click', async () => {
        button.disabled = true
        try {
          await resolveAttackAction(message, action.key)
          button.textContent = `${definition.chatButton} (resolved)`
        } catch (error) {
          ui.notifications.error(error.message)
          button.disabled = [
            'preparing',
            'applying',
            'uncertain',
            'completed'
          ].includes(getResolutionState(message, action.key).state)
        }
      })
      group.append(button)
    }
    ;(html.querySelector('.message-content') ?? html).append(group)
  })
}
