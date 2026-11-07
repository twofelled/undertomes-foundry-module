import { defineStatus } from './base.mjs'

export default defineStatus({
  id: 'burn',
  name: 'Burn',
  letter: 'B',
  description:
    'A Burning creature is set ablaze constantly, taking an amount of d4 fire damage equal to the number of Burn count on itself at the end of their turn, also halving its total count.',
  summary:
    'At turn end, take count d4 fire damage, then halve count (round down). Removed at one count after resolving.',
  fullDescription: [
    'A Burning creature is set ablaze constantly, taking an amount of d4 fire damage equal to the number of Burn count on itself at the end of their turn, also halving its total count.',
    "When at one Burn count, it extinguishes at the end of the creature's turn."
  ],
  resolveLabel: 'Resolve Burn',
  endTurn: true,
  resolve (count) {
    return {
      formula: `${count}d4`,
      type: 'fire',
      next: Math.floor(count / 2)
    }
  },
  preview: count =>
    `${count}d4 fire · ${count} → ${Math.floor(count / 2)} count`
})
