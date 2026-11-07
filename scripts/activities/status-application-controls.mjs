import { MODULE_ID, isPrimaryGM } from '../core/runtime.mjs'
import {
  renderEnabledStatuses,
  getActivityEditorContext,
  getStatusApplications,
  getApplicationTriggerChoices,
  getApplicationTrigger,
  addSectionToggle
} from './activity-helpers.mjs'
import { CONDITIONS } from '../statuses/index.mjs'
import { resolveManualStatusApplications } from '../workflows/manual-resolution.mjs'
import { renderManualResolutionPrompts } from '../ui/chat-cards.mjs'

const selectedApplicationStatuses = new WeakMap()

export function addActivityStatusControls (app, html, context = {}) {
  const editor = getActivityEditorContext(app, html, context)
  if (!editor) return
  const { activity, item, effect } = editor
  effect.querySelector('.ul-activity-statuses')?.remove()
  const section = document.createElement('fieldset')
  section.className = 'ul-activity-statuses standard-form'
  const legend = document.createElement('legend')
  legend.textContent = 'Apply status count'
  const list = document.createElement('div')
  list.className = 'ul-activity-status-list'
  const configured = {
    ...(activity?.flags?.[MODULE_ID]?.statusApplications ?? {})
  }
  const summary = document.createElement('p')
  summary.className = 'hint ul-enabled-statuses'
  summary.setAttribute('aria-live', 'polite')
  const refreshSummary = () => {
    const ids = Object.keys(CONDITIONS).filter(
      id => configured[id]?.enabled === true
    )
    renderEnabledStatuses(summary, ids)
  }
  refreshSummary()
  const pickerLabel = document.createElement('label')
  pickerLabel.textContent = 'Status'
  const picker = document.createElement('select')
  picker.setAttribute('aria-label', 'Select status application')
  const options = new Map()
  const optionLabel = id => CONDITIONS[id].name
  for (const id of Object.keys(CONDITIONS)) {
    const option = new Option(optionLabel(id), id)
    picker.add(option)
    options.set(id, option)
  }
  const previousSelection = selectedApplicationStatuses.get(app)
  picker.value = Object.hasOwn(CONDITIONS, previousSelection ?? '')
    ? previousSelection
    : Object.keys(CONDITIONS).find(id => configured[id]?.enabled) ?? 'burn'
  const pickerRow = document.createElement('div')
  pickerRow.className = 'ul-application-picker'
  pickerRow.append(picker)
  pickerLabel.append(pickerRow)
  const renderSelected = () => {
    const id = picker.value
    const definition = CONDITIONS[id]
    if (!definition) return
    selectedApplicationStatuses.set(app, id)
    list.replaceChildren()
    pickerRow.replaceChildren(picker)
    const saved = { ...(configured[id] ?? {}) }
    const group = document.createElement('div')
    group.className = 'form-group'
    const label = document.createElement('label')
    const enabled = document.createElement('input')
    enabled.type = 'checkbox'
    enabled.checked = saved.enabled === true
    enabled.setAttribute('aria-label', `Enable ${definition.name}`)
    label.className = 'ul-inline-status-toggle'
    label.append(enabled)
    pickerRow.append(label)
    const fields = document.createElement('div')
    fields.className = 'form-fields'
    const formula = document.createElement('input')
    formula.type = 'text'
    formula.value = String(saved.formula ?? '1')
    formula.placeholder = 'Count or formula'
    formula.setAttribute('aria-label', `${definition.name} count or formula`)
    const recipient = document.createElement('select')
    recipient.setAttribute('aria-label', `${definition.name} recipient`)
    recipient.add(new Option('Target(s)', 'target'))
    recipient.add(new Option('User', 'self'))
    recipient.value = saved.recipient === 'self' ? 'self' : 'target'
    const trigger = document.createElement('select')
    trigger.setAttribute('aria-label', `${definition.name} application trigger`)
    for (const [value, label] of Object.entries(
      getApplicationTriggerChoices(activity)
    ))
      trigger.add(new Option(label, value))
    trigger.value = getApplicationTrigger(activity, saved)
    const description = document.createElement('textarea')
    description.rows = 3
    description.value = String(saved.description ?? '')
    description.placeholder =
      'Describe the special requirement, ex. only while raging.'
    description.setAttribute(
      'aria-label',
      `${definition.name} special requirement`
    )
    const descriptionGroup = document.createElement('div')
    descriptionGroup.className = 'ul-status-requirement'
    const descriptionLabel = document.createElement('label')
    descriptionLabel.textContent = 'Special requirement'
    descriptionLabel.append(description)
    descriptionGroup.append(descriptionLabel)
    const refreshVisibility = () => {
      fields.hidden = !enabled.checked
      formula.hidden = definition.counted === false
      descriptionGroup.hidden = !enabled.checked || trigger.value !== 'manual'
      formula.disabled =
        recipient.disabled =
        trigger.disabled =
          !enabled.checked
      description.disabled = descriptionGroup.hidden
    }
    refreshVisibility()
    for (const control of [enabled, formula, recipient, trigger, description])
      control.addEventListener('change', async event => {
        event.stopPropagation()
        const previous = { ...saved }
        picker.disabled = true
        refreshVisibility()
        enabled.disabled =
          formula.disabled =
          recipient.disabled =
          trigger.disabled =
          description.disabled =
            true
        try {
          const value = {
            enabled: enabled.checked,
            formula: definition.counted === false ? '1' : formula.value.trim(),
            recipient: recipient.value,
            trigger: trigger.value,
            description: description.value.trim()
          }
          if (
            value.enabled &&
            (!value.formula || !Roll.validate(value.formula))
          )
            throw new Error('Enter a valid count or roll formula.')
          await item.update({
            [`system.activities.${activity.id}.flags.${MODULE_ID}.statusApplications.${id}`]:
              value
          })
          Object.assign(saved, value)
          configured[id] = value
          options.get(id).textContent = optionLabel(id)
          refreshSummary()
        } catch (error) {
          enabled.checked = previous.enabled === true
          formula.value = String(previous.formula ?? '1')
          recipient.value = previous.recipient === 'self' ? 'self' : 'target'
          trigger.value = getApplicationTrigger(activity, previous)
          description.value = String(previous.description ?? '')
          ui.notifications.error(error.message)
        } finally {
          enabled.disabled = false
          picker.disabled = false
          refreshVisibility()
        }
      })
    fields.append(formula, recipient, trigger)
    group.append(fields, descriptionGroup)
    list.append(group)
  }
  picker.addEventListener('change', () => {
    if (!picker.disabled) renderSelected()
  })
  renderSelected()
  const body = document.createElement('div')
  body.className = 'standard-form ul-application-section-body'
  body.append(pickerLabel, summary, list)
  addSectionToggle(
    legend,
    'Apply status count',
    activity.flags?.[MODULE_ID]?.statusApplicationsEnabled ??
      Object.values(configured).some(config => config.enabled),
    body,
    value =>
      item.update({
        [`system.activities.${activity.id}.flags.${MODULE_ID}.statusApplicationsEnabled`]:
          value
      })
  )
  section.append(legend, body)
  effect.append(section)
}

export function installActivityStatusControls () {
  Hooks.on('renderApplicationV2', addActivityStatusControls)
  Hooks.on('renderChatMessageHTML', renderManualResolutionPrompts)
  Hooks.on('updateChatMessage', (message, changes) => {
    if (
      !Object.hasOwn(
        changes.flags?.[MODULE_ID] ?? {},
        'manualStatusDecisions'
      ) &&
      !Object.hasOwn(changes, `flags.${MODULE_ID}.manualStatusDecisions`)
    )
      return
    if (
      !isPrimaryGM() ||
      !message.getFlag(MODULE_ID, 'manualStatusDecisions')?.length
    )
      return
    void resolveManualStatusApplications(message).catch(error => {
      console.error(MODULE_ID, 'Special/Manual status:', error)
      ui.notifications.error(error.message)
    })
  })
}
