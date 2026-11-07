import { defineStatus, integer } from './base.mjs'

export default defineStatus({
  id: 'rupture',
  name: 'Rupture',
  letter: 'R',
  description:
    "A creature suffering from the Rupture Condition takes an amount of extra damage die equal to half their current Rupture count whenever they suffer an attack hit. The additional damage die depend on the attacking creature's Proficiency Bonus, being d4 at +2 Bonus, d6 at +3 Bonus, d8 at +4 Bonus, d10 at +5 Bonus, a d12 for +6 Bonus and finally 2d6 at +7 Bonus and greater.",
  summary:
    "On a hit, take extra dice based on half the count and the attacker's proficiency, then clear Rupture.",
  fullDescription: [
    "A creature suffering from the Rupture Condition takes an amount of extra damage die equal to half their current Rupture count whenever they suffer an attack hit. The additional damage die depend on the attacking creature's Proficiency Bonus, being d4 at +2 Bonus, d6 at +3 Bonus, d8 at +4 Bonus, d10 at +5 Bonus, a d12 for +6 Bonus and finally 2d6 at +7 Bonus and greater.",
    'Once an attack successfully hits and the condition is triggered, they lose all of their remaining Rupture count.',
    'Ex: If a creature suffering from 5 Rupture would suffer a hit from a creature with a +4 Proficiency Bonus, they would take an additional 3d8 damage.'
  ],
  resolveLabel: 'Trigger Rupture',
  chatButton: 'Resolve Rupture',
  canCrit: true,
  automationHint:
    "Resolves on hit, copying the attack's damage type and using the attacker's proficiency.",
  resolve (
    count,
    { proficiency = 2, damageType = 'untyped', isCritical = false } = {}
  ) {
    const pb = integer(proficiency, 2, 20)
    const dice = Math.ceil(count / 2)
    return {
      formula: pb >= 7 ? `${dice * 2}d6` : `${dice}d${pb * 2}`,
      type: damageType,
      next: 0,
      isCritical
    }
  },
  fields: ({ damageTypes }) => [
    {
      name: 'proficiency',
      label: "Attacker's proficiency bonus",
      type: 'number',
      min: 2,
      max: 20,
      value: 2
    },
    {
      name: 'damageType',
      label: 'Attack damage type',
      type: 'select',
      options: Object.entries(damageTypes)
    }
  ],
  events: {
    async hit ({
      actor,
      target,
      activity,
      message,
      attackDamageType: getAttackDamageType,
      activeCount,
      resolve
    }) {
      if (!activeCount(target, 'rupture')) return
      const proficiency = Number(actor.system.attributes?.prof)
      if (!Number.isInteger(proficiency) || proficiency < 2)
        throw new Error(
          "Cannot resolve Rupture: the attacker's proficiency is unavailable."
        )
      await resolve(target, {
        proficiency,
        damageType: getAttackDamageType(activity),
        isCritical: message.rolls[0].isCritical === true
      })
    }
  }
})
