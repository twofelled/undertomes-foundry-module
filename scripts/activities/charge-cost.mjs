import { MODULE_ID, conditionEffect } from '../core/runtime.mjs'
import { getActivityEditorContext } from './activity-helpers.mjs'
import { integer } from '../statuses/base.mjs'

export const getChargeCost = activity =>
  integer(activity?.flags?.[MODULE_ID]?.chargeCost ?? 0)

export function checkChargeCost (activity) {
  const cost = getChargeCost(activity)
  if (!cost) return true
  const actor = activity.actor ?? activity.item?.actor
  const effect = conditionEffect(actor, 'charge', true)
  const available = Number(effect?.getFlag(MODULE_ID, 'count') ?? 0)
  if (!actor?.isOwner || available < cost) {
    ui.notifications.warn(
      `This action requires ${cost} Charge. ${available} available.`
    )
    return false
  }
  return true
}

export function consumeActivityCharge (activity, usage, messageConfig, updates) {
  if (!checkChargeCost(activity)) return false
  const cost = getChargeCost(activity)
  if (!cost) return
  const actor = activity.actor ?? activity.item.actor
  const effect = conditionEffect(actor, 'charge', true)
  const remaining = integer(effect.getFlag(MODULE_ID, 'count')) - cost
  updates.operations ??= []
  updates.operations.push(
    remaining === 0
      ? {
          action: 'delete',
          documentName: 'ActiveEffect',
          parent: actor,
          ids: [effect.id]
        }
      : {
          action: 'update',
          documentName: 'ActiveEffect',
          parent: actor,
          updates: [{ _id: effect.id, [`flags.${MODULE_ID}.count`]: remaining }]
        }
  )
  messageConfig.data ??= {}
  messageConfig.data.flags ??= {}
  messageConfig.data.flags[MODULE_ID] ??= {}
  messageConfig.data.flags[MODULE_ID].chargeSpent = {
    count: cost,
    remaining,
    actorUuid: actor.uuid
  }
}

export function addChargeCostControl (app, html, context = {}) {
  const editor = getActivityEditorContext(app, html, context)
  if (!editor) return
  const { activity, item, effect } = editor
  effect.querySelector('.ul-charge-cost')?.remove()
  const section = document.createElement('fieldset')
  section.className = 'ul-charge-cost standard-form'
  const legend = document.createElement('legend')
  legend.textContent = 'Charge cost'
  const group = document.createElement('div')
  group.className = 'form-group'
  const label = document.createElement('label')
  label.textContent = 'Charge required'
  const fields = document.createElement('div')
  fields.className = 'form-fields'
  const input = document.createElement('input')
  input.type = 'number'
  input.min = '0'
  input.max = '9999'
  input.step = '1'
  input.value = String(getChargeCost(activity))
  input.setAttribute('aria-label', 'Charge required')
  let saved = input.value
  input.addEventListener('change', async event => {
    event.stopPropagation()
    input.disabled = true
    try {
      if (!input.value.trim())
        throw new Error('Enter a Charge cost from 0 to 9999.')
      const cost = integer(input.value)
      await item.update({
        [`system.activities.${activity.id}.flags.${MODULE_ID}.chargeCost`]: cost
      })
      saved = String(cost)
    } catch (error) {
      input.value = saved
      ui.notifications.error(error.message)
    } finally {
      input.disabled = false
    }
  })
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent =
    'Spent when this action is used. Use of activity is blocked without enough Charge. Set 0 for no cost.'
  fields.append(input)
  group.append(label, fields)
  section.append(legend, group, hint)
  effect.append(section)
}

export function installChargeCosts () {
  Hooks.on('renderApplicationV2', addChargeCostControl)
  const guard = activity => {
    try {
      return checkChargeCost(activity) ? undefined : false
    } catch (error) {
      ui.notifications.error(error.message)
      return false
    }
  }
  Hooks.on('dnd5e.preUseActivity', guard)
  Hooks.on('dnd5e.preActivityConsumption', guard)
  Hooks.on('dnd5e.activityConsumption', consumeActivityCharge)
}
