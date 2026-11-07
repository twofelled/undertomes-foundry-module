import {
  MODULE_ID,
  isPrimaryGM,
  createQueue,
  statusEffectName,
  storedEffectChanges
} from '../core/runtime.mjs'
import { CONDITIONS } from '../statuses/index.mjs'

const enqueueSync = createQueue()
const canonical = changes =>
  JSON.stringify(
    changes
      .map(({ key, type, value, priority, phase }) => ({
        key,
        type: type ?? 'add',
        value: String(value),
        priority: Number(priority ?? 20),
        phase: phase ?? 'initial'
      }))
      .sort((a, b) => a.key.localeCompare(b.key))
  )

export function syncStatusEffect (effect) {
  return enqueueSync(effect.uuid ?? effect, () => synchronize(effect))
}

async function synchronize (effect) {
  if (!isPrimaryGM()) return
  const definition = CONDITIONS[effect.getFlag(MODULE_ID, 'condition')]
  if (!definition) return
  const update = {}
  const name = statusEffectName(definition, effect.name)
  if (name !== effect.name) update.name = name
  const keys = new Set(definition.effectKeys)
  const current = storedEffectChanges(effect)
  const expected = definition.effectChanges(
    effect.getFlag(MODULE_ID, 'uncounted')
      ? 1
      : Number(effect.getFlag(MODULE_ID, 'count') ?? 0),
    { actor: effect.parent }
  )
  const changes = [...current.filter(c => !keys.has(c.key)), ...expected]
  if (
    definition.effectKeys.length &&
    canonical(current.filter(c => keys.has(c.key))) !== canonical(expected)
  )
    update['system.changes'] = changes
  if (Object.keys(update).length) await effect.update(update)
}

export async function syncExistingEffects () {
  if (!isPrimaryGM()) return
  const actors = [
    ...(game.actors?.contents ?? []),
    ...(game.scenes?.contents ?? []).flatMap(scene =>
      [...scene.tokens].map(token => token.actor).filter(Boolean)
    )
  ]
  for (const actor of new Map(actors.map(a => [a.uuid, a])).values()) {
    const retired = [...(actor.items ?? [])].filter(
      item => item.getFlag(MODULE_ID, 'statusAction') === 'fanatic'
    )
    if (retired.length)
      await actor.deleteEmbeddedDocuments(
        'Item',
        retired.map(item => item.id)
      )
    for (const effect of actor.effects) await syncStatusEffect(effect)
  }
}

export function installEffectSync () {
  const sync = effect => {
    if (!isPrimaryGM() || !CONDITIONS[effect.getFlag(MODULE_ID, 'condition')])
      return
    void syncStatusEffect(effect).catch(error => {
      console.error(MODULE_ID, error)
      ui.notifications.error(
        'Could not synchronize status penalties. Check the effect before rolling.'
      )
    })
  }
  const syncContextual = actor => {
    if (!isPrimaryGM() || actor?.documentName !== 'Actor') return
    for (const effect of actor.effects)
      if (CONDITIONS[effect.getFlag(MODULE_ID, 'condition')]?.contextualChanges)
        sync(effect)
  }
  for (const hook of ['createActiveEffect', 'updateActiveEffect'])
    Hooks.on(hook, effect => {
      sync(effect)
      syncContextual(effect.parent)
    })
  Hooks.on('deleteActiveEffect', effect => syncContextual(effect.parent))
  Hooks.on('updateActor', (actor, changes) => {
    if (
      changes.system ||
      Object.keys(changes).some(key => key.startsWith('system.'))
    )
      syncContextual(actor)
  })
  Hooks.on('canvasReady', () => {
    if (!isPrimaryGM()) return
    const actors = new Map(
      (globalThis.canvas?.tokens?.placeables ?? [])
        .filter(token => token.actor)
        .map(token => [token.actor.uuid, token.actor])
    )
    for (const actor of actors.values())
      for (const effect of actor.effects) sync(effect)
  })
}
