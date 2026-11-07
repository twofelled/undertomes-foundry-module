import { defineStatus } from './base.mjs'

export default defineStatus({
  id: 'immolation',
  name: 'Immolation',
  letter: 'I',
  description:
    'A creature beset by Immolation is suffering from the holiest of flames, taking an amount of d4 radiant damage equal to their current Immolation count at the end of their turns, also halving its total count.',
  summary:
    'At turn end, take count d4 radiant damage, then halve count (round down). Removed at one count after resolving.',
  fullDescription: [
    'A creature beset by Immolation is suffering from the holiest of flames, taking an amount of d4 radiant damage equal to their current Immolation count at the end of their turns, also halving its total count.',
    "When at one Immolation count, it extinguishes at the end of the creature's turn."
  ],
  resolveLabel: 'Resolve Immolation',
  endTurn: true,
  resolve: count => ({
    formula: `${count}d4`,
    type: 'radiant',
    next: Math.floor(count / 2)
  }),
  preview: count =>
    `${count}d4 radiant · ${count} → ${Math.floor(count / 2)} count`
})
