import { defineStatus } from './base.mjs'

export const nailsAttackBonus = count => Math.min(3, Math.floor(count / 15))
export default defineStatus({
  id: 'nails',
  name: 'Nails',
  letter: 'N',
  description:
    'A creature suffering from Nails has a number of them embedded in their flesh, drawing out blood and the faith of certain individuals in equal measure. At the end of their turns, a Nailed creature halves their Nail count and gains the same value halved as Bleed count instead.',
  fullDescription: [
    'A creature suffering from Nails has a number of them embedded in their flesh, drawing out blood and the faith of certain individuals in equal measure. At the end of their turns, a Nailed creature halves their Nail count and gains the same value halved as Bleed count instead.',
    'Fanatical creatures gain a +1 bonus modifier to attack rolls against Nailed creatures for each 15 Nails* they are currently suffering from, to a maximum of +3.'
  ],
  endTurn: true,
  resolveLabel: 'Resolve Nails',
  resolve: count => ({
    next: Math.floor(count / 2),
    grants: [{ condition: 'bleed', count: Math.floor(count / 2) }]
  }),
  preview: count =>
    `${Math.floor(count / 2)} Nails remain; gain ${Math.floor(
      count / 2
    )} Bleed.`,
  facts: count => [
    { label: 'Fanatic attack bonus', value: `+${nailsAttackBonus(count)}` }
  ]
})
