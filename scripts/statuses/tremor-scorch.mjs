import { defineStatus } from './base.mjs'
import { tremorBurstEvents } from './tremor-events.mjs'

export default defineStatus({
  id: 'tremor-scorch',
  name: 'Tremor - Scorch',
  letter: 'S',
  tremorFamily: true,
  absorbs: ['burn', 'tremor'],
  automationKey: 'autoTremorScorch',
  endTurn: true,
  clearOnUnconscious: true,
  clearAfterCombat: true,
  clearOnRestOutsideCombat: true,
  description:
    'A creature suffering from Tremor - Scorch is one currently suffering from a blazing inferno that is eating them from inside out, with each flicker of flame reverberating across their entire being.',
  fullDescription: [
    'A creature suffering from Tremor - Scorch is one currently suffering from a blazing inferno that is eating them from inside out, with each flicker of flame reverberating across their entire being.',
    "A creature with Tremor - Scorch counts suffers an amount of d4 fire damage equal to their current Tremor - Scorch count divided by 3, to a maximum of 8d4 per turn. After suffering this damage, the Condition's total count is halved.",
    'When a creature with Tremor - Scorch suffers Tremor Burst by other means, they take a number of d6 fire damage equal to the total count of Tremor - Scorch they currently have, then losing all counts of Tremor - Scorch. The Condition is also lost after the creature is knocked unconscious, if they are fully submerged in non-flammable liquid or combat is over or on the next short rest, if it was gained outside of combat.'
  ],
  resolveLabel: 'Tremor Burst',
  resolve (count, { mode } = {}) {
    if (mode !== 'turnEnd')
      return { formula: `${count}d6`, type: 'fire', next: 0 }
    const dice = Math.min(8, Math.floor(count / 3))
    return {
      formula: dice ? `${dice}d4` : null,
      type: 'fire',
      next: Math.floor(count / 2)
    }
  },
  preview: count => `${count}d6 fire; clears all count`,
  fields: () => [
    {
      type: 'button',
      operation: 'burstAll',
      label: 'Burst all Tremor variants'
    }
  ],
  actions: { burstAll: ({ api, actor }) => api.burst(actor) },
  events: tremorBurstEvents()
})
