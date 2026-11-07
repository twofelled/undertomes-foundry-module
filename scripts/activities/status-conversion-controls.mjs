import { MODULE_ID } from '../core/runtime.mjs'
import {
  getActivityEditorContext,
  addSectionToggle,
  getApplicationTriggerChoices,
  getApplicationTrigger,
  getActivityConversion
} from './activity-helpers.mjs'
import {
  conversionSources,
  conversionSourceId
} from '../core/status-conversion.mjs'
import { CONDITIONS } from '../statuses/index.mjs'

const selectedConversionSources = new WeakMap()

export function addConversionControls (app, html, context = {}) {
  const editor = getActivityEditorContext(app, html, context)
  if (!editor) return
  const { activity, item, effect } = editor
  effect.querySelector('.ul-activity-conversion')?.remove()
  const section = document.createElement('fieldset')
  section.className = 'ul-activity-conversion standard-form'
  const legend = document.createElement('legend')
  legend.textContent = 'Convert status count'
  const saved = {
    sources: [],
    destination: 'tremor-scorch',
    amount: 'all',
    value: '1',
    multiplier: 1,
    rounding: 'down',
    recipient: 'target',
    ...getActivityConversion(activity)
  }
  const activeSources = new Set(saved.sources.map(conversionSourceId))
  const enabled = document.createElement('input')
  enabled.type = 'checkbox'
  const enableLabel = document.createElement('label')
  enableLabel.className = 'ul-inline-status-toggle'
  enableLabel.append(enabled)
  const body = document.createElement('div')
  body.className = 'standard-form ul-conversion-fields'
  const field = (label, input, parent = body) => {
    const row = document.createElement('label')
    row.textContent = label
    input.setAttribute('aria-label', label)
    row.append(input)
    parent.append(row)
    return row
  }
  const select = choices => {
    const element = document.createElement('select')
    for (const [value, label] of choices) element.add(new Option(label, value))
    return element
  }
  const statuses = Object.entries(CONDITIONS)
    .filter(([, def]) => def.counted !== false)
    .map(([id, def]) => [id, def.name])
  const sourceChoices = statuses.filter(([id]) => conversionSourceId(id) === id)
  const sourcePicker = select(sourceChoices)
  sourcePicker.setAttribute('aria-label', 'Select conversion source')
  const remembered = selectedConversionSources.get(app)
  sourcePicker.value = sourceChoices.some(([id]) => id === remembered)
    ? remembered
    : [...activeSources][0] ?? 'burn'
  const pickerRow = document.createElement('div')
  pickerRow.className = 'ul-application-picker'
  pickerRow.append(sourcePicker, enableLabel)
  const pickerLabel = document.createElement('label')
  pickerLabel.textContent = 'From'
  pickerLabel.append(pickerRow)
  const enabledSummary = document.createElement('p')
  enabledSummary.className = 'hint ul-enabled-statuses'
  enabledSummary.setAttribute('aria-live', 'polite')
  const refreshSources = () => {
    const id = sourcePicker.value
    selectedConversionSources.set(app, id)
    sourcePicker.title = CONDITIONS[id].name
    enabled.setAttribute(
      'aria-label',
      `Enable conversion from ${CONDITIONS[id].name}`
    )
    enabled.checked = activeSources.has(id)
    enabledSummary.replaceChildren(document.createTextNode('Enabled: '))
    if (!activeSources.size)
      enabledSummary.append(document.createTextNode('None'))
    for (const key of activeSources) {
      const badge = document.createElement('span')
      badge.className = 'ul-enabled-status'
      const icon = document.createElement('img')
      icon.src = CONDITIONS[key].icon
      icon.alt = ''
      icon.width = icon.height = 18
      badge.append(icon, document.createTextNode(CONDITIONS[key].name))
      enabledSummary.append(badge)
    }
    for (const option of sourcePicker.options)
      option.textContent = CONDITIONS[option.value].name
  }
  refreshSources()
  const destination = select(statuses)
  destination.value = saved.destination
  field('To', destination)
  const amount = select([
    ['all', 'All'],
    ['half', 'Half'],
    ['fixed', 'Fixed'],
    ['formula', 'Formula']
  ])
  amount.value = saved.amount
  field('Consume from each source', amount)
  const value = document.createElement('input')
  value.type = 'text'
  value.value = String(saved.value)
  value.placeholder = 'Count or formula using @count'
  const valueRow = field('Count / formula', value)
  const recipient = select([
    ['target', 'Target(s)'],
    ['self', 'User']
  ])
  recipient.value = saved.recipient
  field('Recipient', recipient)
  const trigger = select(Object.entries(getApplicationTriggerChoices(activity)))
  trigger.value = getApplicationTrigger(activity, saved)
  field('Trigger', trigger)
  const description = document.createElement('textarea')
  description.rows = 2
  description.value = saved.description ?? ''
  const descriptionRow = field('Special requirement', description)
  const refresh = () => {
    valueRow.hidden = !['fixed', 'formula'].includes(amount.value)
    descriptionRow.hidden = trigger.value !== 'manual'
  }
  refresh()
  const content = document.createElement('div')
  content.className = 'standard-form ul-conversion-section-body'
  content.append(pickerLabel, enabledSummary, body)
  const master = addSectionToggle(
    legend,
    'Convert status count',
    saved.enabled === true,
    content,
    async value => {
      const config = { ...saved, enabled: value, sources: [...activeSources] }
      if (value && config.sources.length) conversionSources(config)
      await item.update({
        [`system.activities.${activity.id}.flags.${MODULE_ID}.conversion`]:
          config
      })
      Object.assign(saved, config)
    }
  )
  sourcePicker.addEventListener('change', event => {
    event.stopPropagation()
    refreshSources()
    refresh()
  })
  const controls = [
    master,
    enabled,
    sourcePicker,
    destination,
    amount,
    value,
    recipient,
    trigger,
    description
  ]
  for (const input of controls)
    if (input !== sourcePicker && input !== master)
      input.addEventListener('change', async event => {
        event.stopPropagation()
        if (input === enabled) {
          if (enabled.checked) activeSources.add(sourcePicker.value)
          else activeSources.delete(sourcePicker.value)
        }
        refresh()
        for (const control of controls) control.disabled = true
        try {
          const config = {
            enabled: master.checked,
            sources: [...activeSources],
            destination: destination.value,
            amount: amount.value,
            value: value.value.trim(),
            multiplier: saved.multiplier,
            rounding: saved.rounding,
            recipient: recipient.value,
            trigger: trigger.value,
            description: description.value.trim()
          }
          if (config.enabled && config.sources.length) {
            conversionSources(config)
            if (
              config.amount === 'fixed' &&
              (!/^\d+$/.test(config.value) || Number(config.value) > 9999)
            )
              throw new Error('Enter a count from 0 to 9999.')
            if (config.amount === 'formula' && !Roll.validate(config.value))
              throw new Error(
                'Enter a valid conversion formula. Use @count to reference the base count.'
              )
          }
          await item.update({
            [`system.activities.${activity.id}.flags.${MODULE_ID}.conversion`]:
              config
          })
          Object.assign(saved, config)
        } catch (error) {
          ui.notifications.error(error.message)
          activeSources.clear()
          for (const id of saved.sources)
            activeSources.add(conversionSourceId(id))
          destination.value = saved.destination
          amount.value = saved.amount
          value.value = saved.value
          recipient.value = saved.recipient
          trigger.value = getApplicationTrigger(activity, saved)
          description.value = saved.description ?? ''
        } finally {
          for (const control of controls) control.disabled = false
          refreshSources()
          refresh()
        }
      })
  section.append(legend, content)
  effect.append(section)
}

export function installActivityConversion () {
  Hooks.on('renderApplicationV2', addConversionControls)
}
