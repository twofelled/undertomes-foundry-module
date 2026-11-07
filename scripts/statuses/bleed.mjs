import { defineStatus, integer } from './base.mjs'
import { treatBleed } from '../automation/bleed-treatment.mjs'

export default defineStatus({
  id: 'bleed',
  name: 'Bleed',
  letter: 'L',
  description:
    'A Bleeding creature is well, bleeding! They take 1d4 damage when they perform any action ( Each attack is considered a different action, this also includes Bonus Actions, Legendary Actions, Lair Actions and Reactions, but not Free Actions ), and then Bleed is reduced by a count. They may have all Bleed count removed if any creature passes a successful Medicine check on them as an Action. Otherwise, half their current Bleed count is removed upon receiving healing through an item or through a 4th level or lower spell. It is also fully removed upon the use of an item such as a potion of Greater Healing or a 5th level or greater spell.',
  summary:
    'Actions and attacks deal 1d4 damage and spend 1 count. Spells deal (level + 1)d4 and spend that much count. Remains at 1 Count.',
  fullDescription: [
    'A Bleeding creature is well, bleeding! They take 1d4 damage when they perform any action ( Each attack is considered a different action, this also includes Bonus Actions, Legendary Actions, Lair Actions and Reactions, but not Free Actions ), and then Bleed is reduced by a count. They may have all Bleed count removed if any creature passes a successful Medicine check on them as an Action. Otherwise, half their current Bleed count is removed upon receiving healing through an item or through a 4th level or lower spell. It is also fully removed upon the use of an item such as a potion of Greater Healing or a 5th level or greater spell.',
    "On the case of casting a spell, they suffer an amount of d4 damage and lose an amount count equal to the spell's level plus one. ( Cantrips only deal 1d4 damage, 1st Level Spells deal 2d4 and so on. ) If a creature is suffering from lesser count than the spell slot level spent, they still suffer the maximum damage and remain at a single count.",
    'The DC for this is 10 + their current Bleed count. If they have only one Bleed count, it may only be reduced through a Medicine check.',
    'While out of combat, you may spend one minute to safely tend to your wounds and remove this Condition without taking further Bleed damage.'
  ],
  resolveLabel: 'Trigger Bleed',
  commands: count =>
    count > 0
      ? [
          {
            operation: 'treatBleed',
            label: `Treat Bleed (Action, DC ${10 + count})`
          }
        ]
      : [],
  actions: { treatBleed: ({ actor }) => treatBleed(actor) },
  damageTypeSetting: 'bleedType',
  automationHint:
    'When doing attacks, bonus actions, or other types of actions and spellcasting. Free actions are excluded.',
  resolve (count, { spellLevel = null } = {}) {
    const dice = spellLevel === null ? 1 : integer(spellLevel, 0, 9) + 1
    return {
      formula: `${dice}d4`,
      type: 'untyped',
      next: Math.max(1, count - dice)
    }
  },
  fields: () => [
    {
      name: 'spellLevel',
      valueType: 'number',
      label: 'Action type',
      type: 'select',
      options: [
        ['', 'Ordinary action / attack · 1d4'],
        ...Array.from({ length: 10 }, (_, n) => [
          n,
          `${n ? `Level ${n} spell` : 'Cantrip'} · ${n + 1}d4`
        ])
      ]
    }
  ],
  events: {
    async usage ({ item, activity, action, message, actor, resolve }) {
      const spell = item?.type === 'spell'
      if (
        !action ||
        (!spell && activity.type === 'attack') ||
        message.system.cause
      )
        return
      const spellLevel = spell
        ? Math.max(
            0,
            Math.min(
              9,
              Number(item.system.level ?? 0) +
                Number(message.system.scaling ?? 0)
            )
          )
        : null
      await resolve(actor, { spellLevel })
    },
    async attackAction ({ item, action, actor, resolve }) {
      if (item?.type !== 'spell' && action) await resolve(actor)
    }
  }
})
