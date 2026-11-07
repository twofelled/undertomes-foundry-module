import { defineStatus } from './base.mjs'

const keys = [
  'system.rolls.attack.bonus',
  'system.rolls.ability.check.bonus',
  'system.rolls.ability.save.bonus'
]
export default defineStatus({
  id: 'immobilized',
  name: 'Immobilized',
  letter: 'I',
  description:
    "A creature suffering from Immobilized is one who's suffering to move their stiffening limbs and joints. While enduring Immobilized, they take a penalty equal to the count of Immobilized they are currently afflicted with to all of their attack rolls, ability checks and saving throws. All Immobilized stacks are removed at the end of the creature's turn or after a minute has passed outside of combat.",
  summary:
    'Subtract count from attacks, checks and saves. Outside combat, clear manually after one minute.',
  fullDescription: [
    "A creature suffering from Immobilized is one who's suffering to move their stiffening limbs and joints. While enduring Immobilized, they take a penalty equal to the count of Immobilized they are currently afflicted with to all of their attack rolls, ability checks and saving throws. All Immobilized stacks are removed at the end of the creature's turn or after a minute has passed outside of combat."
  ],
  endTurn: true,
  effectKeys: keys,
  effectChanges: count =>
    keys.map(key => ({ key, type: 'add', value: -count, priority: 20 })),
  resolveLabel: 'Clear Immobilized',
  resolve: () => ({ next: 0 }),
  preview: () => 'Clear all Immobilized count.',
  automationHint:
    'Clear at turn end. One-minute expiry outside combat is handled manually.'
})
