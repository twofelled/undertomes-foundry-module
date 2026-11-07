import { defineStatus } from './base.mjs'
import { conditionCount } from '../core/runtime.mjs'
import {
  installFanaticAutomation,
  isMeleeWeaponAttack
} from '../automation/fanatic-automation.mjs'

export default defineStatus({
  id: 'fanatic',
  name: 'Fanatic',
  letter: 'F',
  counted: false,
  description:
    "Whenever you enter your Rage you may choose to instead enter a state of sheer Fanaticism. While in that stage you have all the features you'd gain by being Raging, alongside the following:",
  fullDescription: [
    "Whenever you enter your Rage you may choose to instead enter a state of sheer Fanaticism. While in that stage you have all the features you'd gain by being Raging, alongside the following:",
    "Your faith burns brighter than anything, drawing holy wrath down the wounds poked into your foes. You deal an additional 1d6 radiant damage on and inflict Immolation count equal to the target's Nails count on a melee weapon attack hit.",
    'Your blind fanaticism may propel you to do grand things, but it also has you convinced of certain tribulations you simply must suffer entirely. Whenever you would be forced to make a saving throw or ability check, you may roll a d4. On an odd result, you gain a bonus modifier equal to your proficiency bonus. On an even result, you get the same value as a negative modifier to the roll. If you are below half your Maximum Hit Points, you must always roll this d4.'
  ],
  install: installFanaticAutomation,
  recipient: 'target',
  canCrit: true,
  manualResolution: false,
  resolveOptions: ({ targetActor }) => ({
    nails: conditionCount(targetActor, 'nails', true)
  }),
  resolve: (_, { nails = 0, isCritical = false } = {}) => ({
    formula: '1d6',
    type: 'radiant',
    next: 1,
    isCritical,
    grants: [{ condition: 'immolation', count: nails, recipient: 'target' }]
  }),
  preview: () =>
    "1d6 radiant damage; inflict Immolation equal to the target's Nails.",
  events: {
    async hit ({ actor, target, activity, message, activeCount, resolve }) {
      if (
        !activeCount(actor, 'fanatic') ||
        !isMeleeWeaponAttack(activity, message.system)
      )
        return
      await resolve(
        actor,
        {
          targetActor: target,
          isCritical: Boolean(message.rolls?.[0]?.isCritical)
        },
        { prefix: `fanatic-hit:${target.uuid}` }
      )
    }
  }
})
