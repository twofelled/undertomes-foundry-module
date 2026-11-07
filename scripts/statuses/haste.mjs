import { defineStatus } from './base.mjs'
import { hasteChanges } from './movement.mjs'

export default defineStatus({
  id: 'haste',
  name: 'Haste',
  letter: 'H',
  description:
    'A creature that is going through Haste has a spring to their step, pushing themselves to move faster or are being carried through magical effects to become nimble as the breeze.',
  summary:
    'Speed bonus capped at 5 × proficiency + 5 ft. Clears at turn start.',
  fullDescription: [
    'A creature that is going through Haste has a spring to their step, pushing themselves to move faster or are being carried through magical effects to become nimble as the breeze.',
    "This creature gains 5-ft. of additional walking speed and, if already available, flying speed for each Haste count they are benefitting from, to a maximum value of 5 times their proficiency bonus plus 5. All count of the Condition is lost at the start of the creature's next turn."
  ],
  startTurn: true,
  contextualChanges: true,
  effectKeys: [
    'system.attributes.movement.speeds.walk',
    'system.attributes.movement.speeds.fly'
  ],
  effectChanges: hasteChanges,
  resolveLabel: 'Clear Haste',
  resolve: () => ({ next: 0 }),
  preview: () => 'Clear all Haste count.',
  automationHint:
    'Clear count at turn start. Speed bonuses remain active while count is present.'
})
