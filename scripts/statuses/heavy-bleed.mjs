import { defineStatus } from './base.mjs'
import { treatBleed } from '../automation/bleed-treatment.mjs'
import bleed from './bleed.mjs'

export default defineStatus({
  id: 'heavy-bleed',
  name: 'Heavy Bleed',
  letter: 'H',
  automationKey: 'autoHeavyBleed',
  description:
    'Heavily Bleeding creatures are bleeding intensely, instead causing the afflicted creature to suffer 2d6 damage on the same triggers as the Bleed Condition and 2 count are removed every time it is triggered. The Medicine Check required to remove this Condition is increased by 5.',
  summary:
    'Separate count from Bleed. Actions and spell casts trigger 2d6 damage and spend 2 count.',
  fullDescription: [
    'Heavily Bleeding creatures are bleeding intensely, instead causing the afflicted creature to suffer 2d6 damage on the same triggers as the Bleed Condition and 2 count are removed every time it is triggered. The Medicine Check required to remove this Condition is increased by 5.'
  ],
  damageTypeSetting: 'bleedType',
  resolveLabel: 'Trigger Heavy Bleed',
  automationHint:
    'Resolve on the same actions and spell casts as Bleed. Uses its own count.',
  resolve: count => ({
    formula: '2d6',
    type: 'untyped',
    next: Math.max(0, count - 2)
  }),
  events: bleed.events,
  commands: count =>
    count > 0
      ? [
          {
            operation: 'treatBleed',
            label: `Treat Heavy Bleed (Action, DC ${15 + count})`
          }
        ]
      : [],
  actions: {
    treatBleed: ({ actor }) => treatBleed(actor, { condition: 'heavy-bleed' })
  }
})
