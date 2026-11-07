import { defineStatus } from './base.mjs'
import { tremorBurstEvents } from './tremor-events.mjs'
import bleed from './bleed.mjs'

const bursts = tremorBurstEvents()
const actionContext = context => ({
  ...context,
  resolve: actor => context.resolve(actor, { mode: 'action' })
})

export default defineStatus({
  id: 'tremor-hemorrhage',
  name: 'Tremor - Hemorrhage',
  letter: 'H',
  tremorFamily: true,
  absorbs: ['bleed', 'tremor'],
  automationKey: 'autoTremorHemorrhage',
  damageTypeSetting: 'bleedType',
  description:
    'A creature suffering from Tremor - Hemorrhage is one that is currently bleeding out from countless cuts that move and worsen inside their being.',
  summary:
    'Healing removes 2 count; full healing or unconsciousness clears it. Bloodless creatures are immune.',
  fullDescription: [
    'A creature suffering from Tremor - Hemorrhage is one that is currently bleeding out from countless cuts that move and worsen inside their being.',
    "A creature with Tremor - Hemorrhage counts suffers 1d4 damage whenever they perform any action ( Each Attack counts as a different Action, also including Bonus Actions and Reactions, but not Free Actions ) and then the Condition's count is reduced by one count. Creatures that have no blood are immune to this effect.",
    'When a creature with Tremor - Hemorrhage suffers Tremor Burst by other means, they take a number of d6 damage equal to the total count of the Condition they are currently suffering from, then losing all remaining counts of the Condition. The Condition is also lost after the creature is knocked Unconscious, If they are healed to their Maximum Hit Points they instantly lose all counts of the Condition, also losing 2 counts whenever they are healed by any amount of Hit Points.'
  ],
  clearOnUnconscious: true,
  healingReduction: 2,
  clearOnFullHealing: true,
  resolveLabel: 'Tremor Burst',
  resolve: (count, { mode } = {}) =>
    mode === 'action'
      ? { formula: '1d4', type: 'untyped', next: Math.max(0, count - 1) }
      : { formula: `${count}d6`, type: 'untyped', next: 0 },
  preview: count => `${count}d6 damage; clears all count`,
  automationHint:
    'Resolve action damage, healing removal, unconsciousness and marked Tremor Bursts. Bloodless immunity is handled by disabling the effect.',
  fields: () => [
    {
      type: 'button',
      operation: 'burstAll',
      label: 'Burst all Tremor variants'
    }
  ],
  actions: { burstAll: ({ api, actor }) => api.burst(actor) },
  events: {
    ...bursts,
    async usage (context) {
      await bleed.events.usage(actionContext(context))
      await bursts.usage(context)
    },
    attackAction: context => bleed.events.attackAction(actionContext(context))
  }
})
