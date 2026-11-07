import { defineStatus, integer } from './base.mjs'

export function sinkingPenalties (count) {
  integer(count)
  return {
    attack: -Math.min(5, Math.floor(count / 3)) || 0,
    wisdom: -Math.min(3, Math.floor(count / 10)) || 0
  }
}

export function sinkingChanges (count) {
  const { attack, wisdom } = sinkingPenalties(count)
  return [
    ...(attack
      ? [
          {
            key: 'system.rolls.attack.bonus',
            type: 'add',
            value: attack,
            priority: 20
          }
        ]
      : []),
    ...(wisdom
      ? [
          {
            key: 'system.abilities.wis.save.roll.bonus',
            type: 'add',
            value: wisdom,
            priority: 20
          }
        ]
      : [])
  ]
}

export default defineStatus({
  id: 'sinking',
  name: 'Sinking',
  letter: 'S',
  description:
    'A creature that is Sinking has trouble focusing on anything as a deep unease washes over them, making way for pure leg-shaking terror or difficulty performing what they must. While suffering Sinking the afflicted creature has a negative modifier to Attack Rolls for each 3 Sinking afflicted to them, to a maximum of -5. Additionally, they have their Wisdom Saving Throws reduced by a negative modifier for each 10 Sinking, to a maximum of -3.',
  summary:
    'Attack penalty: -1 per 3 count (max -5). Wisdom save penalty: -1 per 10 (max -3). Halve count at turn end, round up; remove at one.',
  fullDescription: [
    'A creature that is Sinking has trouble focusing on anything as a deep unease washes over them, making way for pure leg-shaking terror or difficulty performing what they must. While suffering Sinking the afflicted creature has a negative modifier to Attack Rolls for each 3 Sinking afflicted to them, to a maximum of -5. Additionally, they have their Wisdom Saving Throws reduced by a negative modifier for each 10 Sinking, to a maximum of -3.',
    'Sinking count is halved at the end of a creatures turn, rounded up. Upon having one count remaining it is removed entirely instead.',
    'Ex: A creature with 12 stacks of Sinking suffers a -4 penalty to Hit. Additionally, that creature has their Wisdom Saving Throws reduced by a negative modifier for each 10 Sinking, to a maximum of -3.'
  ],
  resolveLabel: 'Reduce Sinking',
  endTurn: true,
  effectKeys: [
    'system.rolls.attack.bonus',
    'system.abilities.wis.save.roll.bonus'
  ],
  effectChanges: sinkingChanges,
  resolve: count => ({ next: count === 1 ? 0 : Math.ceil(count / 2) }),
  facts: count => {
    const p = sinkingPenalties(count)
    return [
      { label: 'Attack', value: p.attack },
      { label: 'Wisdom save', value: p.wisdom }
    ]
  },
  factsNote: 'Applied automatically to attack rolls and Wisdom saves.',
  preview: count => `${count} → ${count <= 1 ? 0 : Math.ceil(count / 2)} count`
})
