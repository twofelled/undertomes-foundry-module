import { MODULE_ID, isPrimaryGM, createQueue } from '../core/runtime.mjs'
import { createActivityResolutionContext } from '../activities/activity-helpers.mjs'
import { processCombatEffects } from '../workflows/combat-effects.mjs'
import {
  processActivityStatuses,
  processActivityConversion
} from '../workflows/activity-resolution.mjs'

export function installStatusLifecycle () {
  const run = (actor, method, ...args) => {
    if (!isPrimaryGM() || actor?.documentName !== 'Actor' || !actor.isOwner)
      return
    const api = game.modules.get(MODULE_ID)?.api
    if (api)
      void api[method](actor, ...args).catch(error => {
        console.error(MODULE_ID, 'Status lifecycle:', error)
        ui.notifications.error(error.message)
      })
  }
  Hooks.on('dnd5e.healActor', (actor, changes) => {
    if (changes.hp > 0) run(actor, 'handleHealing')
  })
  Hooks.on('updateActor', (actor, changes) => {
    const hpChanged =
      changes.system?.attributes?.hp ||
      Object.keys(changes).some(key => key.startsWith('system.attributes.hp'))
    if (hpChanged && Number(actor.system?.attributes?.hp?.value) <= 0)
      run(actor, 'clearByRule', 'clearOnUnconscious')
  })
  for (const event of ['createActiveEffect', 'updateActiveEffect'])
    Hooks.on(event, effect => {
      if (
        !effect.disabled &&
        !effect.isSuppressed &&
        effect.statuses?.has('unconscious')
      )
        run(effect.parent, 'clearByRule', 'clearOnUnconscious')
    })
  Hooks.on('deleteCombat', combat => {
    for (const combatant of combat.combatants)
      run(combatant.actor, 'clearByRule', 'clearAfterCombat')
  })
  Hooks.on('updateCombat', (combat, changes) => {
    if (changes.round === 0)
      for (const combatant of combat.combatants)
        run(combatant.actor, 'clearByRule', 'clearAfterCombat')
  })
  Hooks.on('dnd5e.restCompleted', actor =>
    run(actor, 'clearByRule', 'clearOnRestOutsideCombat')
  )
}

const enqueueActivityMessage = createQueue()

export function installMessageAutomation () {
  Hooks.on('createChatMessage', message => {
    if (!isPrimaryGM() || !['usage', 'attack', 'save'].includes(message.type))
      return
    void enqueueActivityMessage('chat', async () => {
      if (!isPrimaryGM()) return
      const messageContext = await createActivityResolutionContext(message)
      if (!messageContext) return
      await processCombatEffects(message, {
        resolveBursts: false,
        messageContext
      })
      await processActivityStatuses(message, messageContext)
      await processActivityConversion(message, messageContext)
      await processCombatEffects(message, { onlyBursts: true, messageContext })
    }).catch(error => {
      console.error(MODULE_ID, 'Activity status resolution:', error)
      ui.notifications.error(
        `Status resolution stopped: ${error.message} Check HP and counts before resolving manually.`
      )
    })
  })
}

export function getCompletedTurn (combat, prior, current) {
  if (
    !prior?.combatantId ||
    prior.round < 1 ||
    prior.turn == null ||
    current?.turn == null
  )
    return null
  const forward =
    current.round > prior.round ||
    (current.round === prior.round && current.turn > prior.turn)
  if (!forward) return null
  const actor = combat.combatants.get(prior.combatantId)?.actor
  return actor
    ? { actor, key: `${combat.id}:${prior.round}:${prior.combatantId}` }
    : null
}

export function installTurnAutomation (endTurn, startTurn) {
  const enqueueTurns = createQueue()
  Hooks.on('combatTurnChange', (combat, prior, current) => {
    if (!isPrimaryGM()) return
    const completed = getCompletedTurn(combat, prior, current)
    const forward =
      current?.round >= 1 &&
      current.turn != null &&
      (!prior ||
        current.round > prior.round ||
        (current.round === prior.round &&
          (prior.turn == null || current.turn > prior.turn)))
    const starting = forward
      ? combat.combatants.get(current.combatantId)?.actor
      : null
    if (!completed && !starting) return
    return enqueueTurns(combat.id, async () => {
      if (!isPrimaryGM()) return
      if (completed)
        await endTurn(completed.actor, completed.key, { automatic: true })
      if (isPrimaryGM() && starting && startTurn)
        await startTurn(
          starting,
          `${combat.id}:${current.round}:${current.combatantId}`
        )
    }).catch(error => {
      console.error(MODULE_ID, error)
      ui.notifications.error('Status turn end processing failed.')
    })
  })
}
