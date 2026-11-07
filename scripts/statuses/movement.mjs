import { storedEffectChanges } from '../core/runtime.mjs'

export function movementAmount (feet, actor) {
  const units = actor?.system?.attributes?.movement?.units ?? 'ft'
  return (
    globalThis.dnd5e?.utils?.convertLength?.(feet, 'ft', units, {
      strict: false
    }) ?? (/^(m|meters?|metres?)$/i.test(units) ? feet * 0.3048 : feet)
  )
}

export function hasteChanges (count, { actor } = {}) {
  const proficiency = Number(actor?.system?.attributes?.prof ?? 2)
  const bonus = movementAmount(Math.min(count * 5, proficiency * 5 + 5), actor)
  const own = actor?.effects?.find(
    effect => effect.getFlag('undertomes-limbus', 'condition') === 'haste'
  )
  const previousFly =
    own && !own.disabled && !own.isSuppressed
      ? Number(
          storedEffectChanges(own).find(
            change => change.key === 'system.attributes.movement.speeds.fly'
          )?.value ?? 0
        )
      : 0
  const flying =
    Number(actor?.system?.attributes?.movement?.speeds?.fly ?? 0) -
      previousFly >
    0
  return ['walk', ...(flying ? ['fly'] : [])].map(mode => ({
    key: `system.attributes.movement.speeds.${mode}`,
    type: 'add',
    value: bonus,
    priority: 30
  }))
}
