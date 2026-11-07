import {
  MODULE_ID,
  escapeHTML,
  getResolutionState,
  isPrimaryGM
} from '../core/runtime.mjs'
import { integer } from '../statuses/base.mjs'
import { CONDITIONS, STATUS_DEFINITIONS } from '../statuses/index.mjs'

const legacyTypes = ['tremor-hemorrhage', 'tremor-scorch']
export function getTremorAllocationTypes (split) {
  const ids = [...new Set(split.destinations ?? legacyTypes)]
  if (
    ids.length < 2 ||
    ids.some(id => !CONDITIONS[id]?.tremorFamily || id === 'tremor')
  )
    throw new Error(
      'This allocation needs at least two registered Tremor subtypes.'
    )
  return ids
    .map(id => CONDITIONS[id])
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

export function createDefaultTremorAllocation (
  count,
  types = legacyTypes.map(id => CONDITIONS[id])
) {
  integer(count)
  if (types.length < 2) throw new Error('Choose at least two Tremor subtypes.')
  if (new Set(types.map(type => type.id)).size !== types.length)
    throw new Error('Allocation destinations must be unique.')
  const sorted = [...types].sort((a, b) => a.name.localeCompare(b.name, 'en'))
  const base = Math.floor(count / sorted.length),
    extra = count % sorted.length
  return Object.fromEntries(
    sorted.map((type, index) => [type.id, base + Number(index < extra)])
  )
}

export function redistributeTremor (values, id, requested) {
  const result = { ...values }
  const total = Object.values(result).reduce(
    (sum, value) => sum + integer(value),
    0
  )
  if (!Object.hasOwn(result, id))
    throw new Error('Unknown allocation target.')
  if (!Number.isSafeInteger(requested))
    throw new Error('Enter a valid allocation count.')
  const next = Math.max(0, Math.min(total, requested))
  let difference = next - result[id]
  const others = Object.keys(result).filter(key => key !== id)
  if (difference < 0) result[others[0]] -= difference
  else
    for (const key of others) {
      const take = Math.min(difference, result[key])
      result[key] -= take
      difference -= take
    }
  result[id] = next
  return result
}

export function getTremorAllocationCounts (split, allocation) {
  const types = getTremorAllocationTypes(split)
  const raw = allocation.counts ?? {
    'tremor-hemorrhage': allocation.hemorrhage,
    'tremor-scorch': allocation.scorch
  }
  if (Object.keys(raw).some(id => !types.some(type => type.id === id)))
    throw new Error('Unexpected allocation destination.')
  const counts = Object.fromEntries(
    types.map(type => [type.id, integer(raw[type.id])])
  )
  if (
    Object.values(counts).reduce((sum, count) => sum + count, 0) !== split.count
  )
    throw new Error(`The allocation must total ${split.count}.`)
  return counts
}

export async function createTremorAllocationPrompt (
  actor,
  count,
  { message } = {}
) {
  const destinations = STATUS_DEFINITIONS.filter(def => {
    const effect = actor.effects.find(
      effect => effect.getFlag(MODULE_ID, 'condition') === def.id
    )
    return (
      def.tremorFamily &&
      def.id !== 'tremor' &&
      effect &&
      !effect.disabled &&
      !effect.isSuppressed &&
      Number(effect.getFlag(MODULE_ID, 'count')) > 0
    )
  }).map(def => def.id)
  getTremorAllocationTypes({ destinations })
  return ChatMessage.create({
    author: message?.author?.id ?? game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<header class="ul-tremor-split-heading"><img src="${escapeHTML(
      CONDITIONS.tremor.icon
    )}" alt="" width="24" height="24"><strong>Allocate ${count} Tremor</strong></header><p>${escapeHTML(
      actor.name
    )}</p>`,
    whisper: message?.whisper ?? [],
    blind: Boolean(message?.blind),
    flags: {
      [MODULE_ID]: {
        tremorSplit: { actorUuid: actor.uuid, count, destinations }
      }
    }
  })
}

export async function resolveTremorAllocation (message) {
  if (!isPrimaryGM()) return
  const split = message.getFlag(MODULE_ID, 'tremorSplit'),
    allocation = message.getFlag(MODULE_ID, 'tremorSplitChoice')
  if (!split || !allocation) return
  const actor = await fromUuid(split.actorUuid)
  if (!actor?.isOwner)
    throw new Error('The recipient is unavailable or cannot be edited.')
  return game.modules
    .get(MODULE_ID)
    .api.applyTremorSplit(actor, split.count, allocation, message)
}

export function installTremorAllocation () {
  Hooks.on('updateChatMessage', (message, changes) => {
    if (
      !Object.hasOwn(changes.flags?.[MODULE_ID] ?? {}, 'tremorSplitChoice') &&
      !Object.hasOwn(changes, `flags.${MODULE_ID}.tremorSplitChoice`)
    )
      return
    if (isPrimaryGM())
      void resolveTremorAllocation(message).catch(error =>
        ui.notifications.error(error.message)
      )
  })
  Hooks.on('renderChatMessageHTML', (message, html) => {
    if (message.isContentVisible === false) return
    const split = message.getFlag(MODULE_ID, 'tremorSplit')
    if (!split) return
    const types = getTremorAllocationTypes(split)
    html.querySelector('.ul-tremor-split')?.remove()
    const group = document.createElement('div')
    group.className = 'ul-tremor-split standard-form'
    const state = getResolutionState(message, 'allocate-tremor').state
    const editable =
      ['awaiting', 'failed'].includes(state) &&
      (isPrimaryGM() || message.isOwner)
    const choice = message.getFlag(MODULE_ID, 'tremorSplitChoice')
    let values
    try {
      values = choice
        ? getTremorAllocationCounts(split, choice)
        : createDefaultTremorAllocation(split.count, types)
    } catch {
      values = createDefaultTremorAllocation(split.count, types)
    }
    const inputs = {},
      controls = []
    let submitting = false
    const adjust = (id, amount) => {
      if (!editable || submitting) return
      values = redistributeTremor(values, id, amount)
      for (const type of types) inputs[type.id].value = String(values[type.id])
    }
    for (const type of types) {
      const row = document.createElement('label'),
        heading = document.createElement('span'),
        icon = document.createElement('img')
      heading.className = 'ul-tremor-split-heading'
      icon.src = type.icon
      icon.alt = ''
      icon.width = icon.height = 24
      heading.append(icon, document.createTextNode(type.name))
      row.append(heading)
      const input = document.createElement('input')
      input.type = 'number'
      input.min = '0'
      input.max = String(split.count)
      input.step = '1'
      input.value = String(values[type.id])
      input.disabled = !editable
      input.setAttribute('aria-label', `${type.name} allocation`)
      input.addEventListener('change', () => {
        const amount = Number(input.value)
        if (
          input.value.trim() &&
          Number.isSafeInteger(amount) &&
          amount >= 0 &&
          amount <= split.count
        )
          adjust(type.id, amount)
        else input.value = String(values[type.id])
      })
      inputs[type.id] = input
      const counter = document.createElement('div')
      counter.className = 'ul-tremor-split-counter'
      const buttons = [-1, 1].map(delta => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = delta < 0 ? '−' : '+'
        button.disabled = !editable
        button.setAttribute(
          'aria-label',
          `${delta < 0 ? 'Decrease' : 'Increase'} ${type.name}`
        )
        button.addEventListener('click', () =>
          adjust(type.id, values[type.id] + delta)
        )
        return button
      })
      counter.append(buttons[0], input, buttons[1])
      controls.push(...buttons, input)
      row.append(counter)
      group.append(row)
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent =
      state === 'completed'
        ? 'Applied'
        : ['applying', 'preparing', 'uncertain'].includes(state)
        ? 'Check current counts'
        : 'Apply allocation'
    button.disabled = !editable
    button.addEventListener('click', async () => {
      if (submitting) return
      submitting = true
      for (const control of [...controls, button]) control.disabled = true
      try {
        if (!isPrimaryGM() && !game.users.activeGM)
          throw new Error('An active GM is required.')
        const allocation = {
          counts: Object.fromEntries(
            types.map(type => [type.id, integer(Number(inputs[type.id].value))])
          ),
          attempt: (choice?.attempt ?? 0) + 1
        }
        getTremorAllocationCounts(split, allocation)
        await message.setFlag(MODULE_ID, 'tremorSplitChoice', allocation)
        await resolveTremorAllocation(message)
      } catch (error) {
        ui.notifications.error(error.message)
        const retry = ['awaiting', 'failed'].includes(
          getResolutionState(message, 'allocate-tremor').state
        )
        for (const control of [...controls, button]) control.disabled = !retry
      } finally {
        submitting = false
      }
    })
    group.append(button)
    ;(html.querySelector('.message-content') ?? html).append(group)
  })
}
