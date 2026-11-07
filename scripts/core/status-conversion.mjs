import { CONDITIONS } from '../statuses/index.mjs'
import { integer } from '../statuses/base.mjs'

export const conversionSourceId = id => id
export function conversionSources (config) {
  const requested = [...new Set(config.sources ?? [])]
  if (
    !requested.length ||
    requested.some(
      id => !Object.hasOwn(CONDITIONS, id) || CONDITIONS[id].counted === false
    )
  )
    throw new Error('Choose at least one source status.')
  if (
    !Object.hasOwn(CONDITIONS, config.destination) ||
    CONDITIONS[config.destination].counted === false
  )
    throw new Error('Choose a counted destination status.')
  if (requested.includes(config.destination))
    throw new Error('The destination must be a different status.')
  return requested
}

export async function planConversion (counts, config, rollData = {}) {
  const sources = conversionSources(config)
  if (!['all', 'half', 'fixed', 'formula'].includes(config.amount ?? 'all'))
    throw new Error('Choose a valid conversion amount.')
  const multiplier = Number(config.multiplier ?? 1)
  if (!Number.isFinite(multiplier) || multiplier < 0)
    throw new Error('Output multiplier must be zero or positive.')
  const round = config.rounding === 'up' ? Math.ceil : Math.floor
  const before = {},
    after = {}
  let consumed = 0
  for (const id of sources) {
    const count = integer(Number(counts[id] ?? 0))
    before[id] = count
    after[id] = count
    let amount = count
    if (config.amount === 'half') amount = round(count / 2)
    else if (config.amount === 'fixed')
      amount = integer(Number(config.value ?? 1))
    else if (config.amount === 'formula') {
      const roll = await new Roll(String(config.value ?? '@count'), {
        ...rollData,
        count
      }).evaluate()
      if (!Number.isFinite(roll.total) || roll.total < 0)
        throw new Error(
          'Conversion formula cannot produce a negative number.'
        )
      amount = round(roll.total)
    }
    amount = Math.min(count, amount)
    consumed += amount
    after[id] -= amount
  }
  const gained = integer(round(consumed * multiplier))
  const destination = config.destination
  before[destination] = integer(Number(counts[destination] ?? 0))
  after[destination] = integer(before[destination] + gained)
  return { before, after, gained, consumed, destination }
}
