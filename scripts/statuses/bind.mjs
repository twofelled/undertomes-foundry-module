import { defineStatus } from './base.mjs'
import { movementAmount } from './movement.mjs'

export default defineStatus({
  id: 'bind',
  name: 'Bind',
  letter: 'B',
  description:
    'A creature suffering from Bind is being slowed down in some form, reducing their movement speed by 5-ft. per count of the Condition they currently have.',
  summary: 'Lose 5 ft. movement per count; clear at the end of your next turn.',
  fullDescription: [
    'A creature suffering from Bind is being slowed down in some form, reducing their movement speed by 5-ft. per count of the Condition they currently have.',
    "All count is lost at the end of the creature's next turn."
  ],
  endTurn: true,
  nextTurnEnd: true,
  contextualChanges: true,
  effectKeys: ['system.attributes.movement.bonus'],
  effectChanges: (count, { actor } = {}) => [
    {
      key: 'system.attributes.movement.bonus',
      type: 'add',
      value: -movementAmount(5 * count, actor),
      priority: 20
    }
  ],
  resolveLabel: 'Clear Bind',
  resolve: () => ({ next: 0 }),
  preview: () => 'Clear all Bind count.'
})
