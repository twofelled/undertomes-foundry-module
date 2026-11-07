import { defineStatus, integer } from './base.mjs'

export function poiseThreshold (count) {
  return count > 0 ? 20 - Math.min(integer(count), 4) : null
}

export default defineStatus({
  id: 'poise',
  name: 'Poise',
  letter: 'P',
  description:
    'A creature benefitting from being Poised has their stance slowly being perfected to enter "the zone" while fighting, being able to perform a Posture Critical hit whenever they roll at least a 19 on attack, before adding any modifiers. This threshold is reduced by each additional count of Poise they have after the first, up to 4 ( Triggering a Posture Critical Hit on a roll of 16 or higher) and removing all Poise count from them when they land a Posture Critical hit.',
  summary:
    'A natural attack roll that hits deals separate bonus damage, then clears Poise.',
  fullDescription: [
    'A creature benefitting from being Poised has their stance slowly being perfected to enter "the zone" while fighting, being able to perform a Posture Critical hit whenever they roll at least a 19 on attack, before adding any modifiers. This threshold is reduced by each additional count of Poise they have after the first, up to 4 ( Triggering a Posture Critical Hit on a roll of 16 or higher) and removing all Poise count from them when they land a Posture Critical hit.',
    'When this effect is triggered, this creature deals an additional 2d6 damage on a hit of type equal to your attacks damage type.',
    'If they have 6 or more stacks of Poise, they deal an extra d6 of damage for each two count above 6, to a maximum of 6d6 total. A Posture Critical Hit is not a regular Critical Hit.'
  ],
  resolveLabel: 'Posture Critical',
  chatButton: 'Posture Critical',
  chatEligible: (count, action) =>
    action.natural !== null && action.natural >= poiseThreshold(count),
  recipient: 'target',
  automationHint:
    "Resolves on qualifying hit, copying the attack's damage type.",
  resolve: (count, { damageType = 'untyped' } = {}) => ({
    formula: `${Math.min(6, 2 + Math.floor(Math.max(0, count - 6) / 2))}d6`,
    type: damageType,
    next: 0
  }),
  facts: count => [
    { label: 'Natural roll', value: `${poiseThreshold(count) ?? '-'}+` }
  ],
  factsNote: 'The attack must hit.',
  fields: ({ damageTypes }) => [
    {
      name: 'damageType',
      label: 'Attack damage type',
      type: 'select',
      options: Object.entries(damageTypes),
      note: 'Target one creature to receive this bonus damage.'
    }
  ],
  events: {
    async attackComplete ({
      actor,
      targets,
      message,
      activity,
      activeCount,
      naturalAttackRoll: getNaturalAttackRoll,
      attackDamageType: getAttackDamageType,
      notify,
      resolve
    }) {
      const count = activeCount(actor, 'poise')
      const natural = getNaturalAttackRoll(message.rolls[0])
      if (
        !count ||
        !targets.length ||
        natural === null ||
        natural < poiseThreshold(count)
      )
        return
      if (targets.length !== 1) {
        notify('Poise needs one hit target.')
        return
      }
      await resolve(actor, {
        targetActor: targets[0],
        damageType: getAttackDamageType(activity)
      })
    }
  }
})
