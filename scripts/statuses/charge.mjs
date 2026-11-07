import { defineStatus } from './base.mjs'

export default defineStatus({
  id: 'charge',
  name: 'Charge',
  letter: 'C',
  description:
    'A creature that is Charging is amassing an amount of energy - electrical, magical or otherwise, having jolts and arcs surround her body as the quantity intensifies.',
  summary: 'Spend Charge to activate abilities. It has no effect by itself.',
  fullDescription: [
    'A creature that is Charging is amassing an amount of energy - electrical, magical or otherwise, having jolts and arcs surround her body as the quantity intensifies.',
    'Charge and its unique counterparts do not affect a character by itself, instead being a renewable resource to be spent for activating certain abilities and effects.'
  ]
})
