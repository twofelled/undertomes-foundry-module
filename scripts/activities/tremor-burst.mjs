import { MODULE_ID } from '../core/runtime.mjs'
import { getActivityEditorContext } from './activity-helpers.mjs'

export function addTremorItemControls (app, html, context = {}) {
  const editor = getActivityEditorContext(app, html, context)
  if (!editor) return
  const { activity, item, effect } = editor
  effect.querySelector('.fell-tremor-burst')?.remove()
  const section = document.createElement('fieldset')
  section.className = 'fell-tremor-burst standard-form'
  const legend = document.createElement('legend')
  legend.textContent = 'Tremor Burst'
  const group = document.createElement('div')
  group.className = 'form-group'
  const label = document.createElement('label')
  label.textContent = 'Trigger Tremor Burst'
  const fields = document.createElement('div')
  fields.className = 'form-fields'
  const enabled = document.createElement('input')
  enabled.type = 'checkbox'
  enabled.setAttribute('aria-label', 'Trigger Tremor Burst')
  const trigger =
    activity.type === 'attack'
      ? 'hit'
      : activity.type === 'save'
      ? 'saveFail'
      : 'use'
  let saved = activity.flags?.[MODULE_ID]?.tremorBurst ?? ''
  enabled.checked = saved === trigger
  enabled.addEventListener('change', async event => {
    event.stopPropagation()
    enabled.disabled = true
    try {
      const value = enabled.checked ? trigger : ''
      await item.update({
        [`system.activities.${activity.id}.flags.${MODULE_ID}.tremorBurst`]:
          value
      })
      saved = value
    } catch (error) {
      enabled.checked = saved === trigger
      ui.notifications.error(error.message)
    } finally {
      enabled.disabled = false
    }
  })
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent = `Burst Tremor on the target ${
    trigger === 'hit'
      ? 'on a confirmed hit'
      : trigger === 'saveFail'
      ? 'on a failed save'
      : 'on use'
  }.`
  fields.append(enabled)
  group.append(label, fields)
  section.append(legend, group, hint)
  effect.append(section)
}

export function installItemTremorControls () {
  Hooks.on('renderApplicationV2', addTremorItemControls)
}

export async function configureTremorAbilities (
  actor = canvas.tokens.controlled[0]?.actor
) {
  if (!actor?.isOwner)
    throw new Error('Select a token whose abilities you can edit.')
  const activities = [...actor.items].flatMap(item =>
    [...(item.system.activities?.values() ?? [])].map(activity => ({
      item,
      activity
    }))
  )
  if (!activities.length) {
    ui.notifications.warn('This actor has no activities to configure.')
    return
  }
  const content = document.createElement('div')
  const note = document.createElement('p')
  note.textContent = 'Choose when each ability causes Tremor Burst.'
  content.append(note)
  const list = document.createElement('div')
  list.className = 'ul-tremor-activities standard-form'
  content.append(list)
  activities.forEach(({ item, activity }, index) => {
    const group = document.createElement('div')
    group.className = 'form-group'
    const label = document.createElement('label')
    label.textContent = `${item.name} - ${activity.name}`
    const select = document.createElement('select')
    select.name = `activity${index}`
    select.add(new Option('No Tremor Burst', ''))
    const trigger =
      activity.type === 'attack'
        ? 'hit'
        : activity.type === 'save'
        ? 'saveFail'
        : 'use'
    select.add(
      new Option(
        trigger === 'hit'
          ? 'On hit'
          : trigger === 'saveFail'
          ? 'On failed save'
          : 'On use',
        trigger
      )
    )
    select.value = activity.flags?.[MODULE_ID]?.tremorBurst ?? ''
    group.append(label, select)
    list.append(group)
  })
  const values = await foundry.applications.api.DialogV2.input({
    window: {
      title: `Tremor Burst Abilities - ${actor.name}`,
      resizable: true
    },
    position: { width: 560 },
    content,
    ok: { label: 'Save' }
  })
  if (!values) return
  for (const [index, { item, activity }] of activities.entries()) {
    const value = values[`activity${index}`] ?? ''
    if (value !== (activity.flags?.[MODULE_ID]?.tremorBurst ?? ''))
      await item.update({
        [`system.activities.${activity.id}.flags.${MODULE_ID}.tremorBurst`]:
          value
      })
  }
  ui.notifications.info('Tremor Burst ability triggers saved.')
}
