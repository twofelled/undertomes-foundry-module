import { tremorBurstEvents } from './tremor-events.mjs'
import { defineStatus } from './base.mjs'
import { installItemTremorControls } from '../activities/tremor-burst.mjs'

export default defineStatus({
  id: 'tremor',
  name: 'Tremor',
  letter: 'T',
  tremorFamily: true,
  fields: () => [
    {
      type: 'button',
      operation: 'burstAll',
      label: 'Burst all Tremor variants'
    }
  ],
  actions: { burstAll: ({ api, actor }) => api.burst(actor) },
  description:
    'A creature suffering from Tremor is one suffering from immeasurable shaking and vibrations inside their body.',
  summary: 'Tremor Burst deals count d4 thunder damage and clears Tremor.',
  fullDescription: [
    'A creature suffering from Tremor is one suffering from immeasurable shaking and vibrations inside their body.',
    'When a Tremoring creature suffers Tremor Burst by other means, they take a number of d4 thunder damage equal to their current Tremor count, then losing all remaining count.',
    'The Condition is also lost after combat is over or at the end of the next short or long rest, if it was gained outside of combat.'
  ],
  resolveLabel: 'Tremor Burst',
  install () {
    installItemTremorControls()
  },
  automationHint:
    'Only abilities explicitly marked as Tremor Burst resolve it automatically.',
  resolve: count => ({ formula: `${count}d4`, type: 'thunder', next: 0 }),
  preview: count => `${count}d4 thunder · clears all count`,
  events: tremorBurstEvents()
})
