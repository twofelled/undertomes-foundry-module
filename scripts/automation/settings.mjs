import { MODULE_ID, STATUS_MANAGER_LABEL } from '../core/runtime.mjs'
import { STATUS_DEFINITIONS } from '../statuses/index.mjs'

const supportedEvents = Object.freeze({
  usage: 'activity use',
  attackAction: 'attack roll',
  hit: 'confirmed hit',
  attackComplete: 'completed attack',
  save: 'saving throw'
})

const automationCapabilitiesCache = new WeakMap()
export function getAutomationCapabilities (definition) {
  const cached = automationCapabilitiesCache.get(definition)
  if (cached) return [...cached]
  const result = [
    ...(definition.startTurn && typeof definition.resolve === 'function'
      ? ['turn start']
      : []),
    ...(definition.endTurn && typeof definition.resolve === 'function'
      ? ['turn end']
      : []),
    ...Object.entries(definition.events ?? {})
      .filter(
        ([event, handler]) =>
          supportedEvents[event] && typeof handler === 'function'
      )
      .map(([event]) => supportedEvents[event])
  ]
  if (Object.isFrozen(definition))
    automationCapabilitiesCache.set(definition, result)
  return [...result]
}

export const getAutomatedStatuses = () =>
  STATUS_DEFINITIONS.filter(
    definition => getAutomationCapabilities(definition).length
  )

export const getAutomationSettingKey = definition =>
  definition.automationKey ?? `auto${definition.name}`
export const isStatusAutomated = definition =>
  getAutomationCapabilities(definition).length > 0 &&
  game.settings.get(MODULE_ID, getAutomationSettingKey(definition)) !== false

export function getDamageTypeChoices () {
  return Object.fromEntries(
    Object.entries(CONFIG.DND5E.damageTypes).map(([key, value]) => [
      key,
      game.i18n.localize(typeof value === 'string' ? value : value.label ?? key)
    ])
  )
}

export function installDamageTypeChoices () {
  const choices = getDamageTypeChoices()
  const refresh = () => {
    for (const key of Object.keys(choices)) delete choices[key]
    Object.assign(choices, getDamageTypeChoices())
  }
  Hooks.on('ready', refresh)
  Hooks.on('renderSettingsConfig', (app, html) => {
    refresh()
    const root = html?.querySelector ? html : app.element
    for (const definition of STATUS_DEFINITIONS.filter(
      d => d.damageTypeSetting
    )) {
      const select = root?.querySelector(
        `select[name="${MODULE_ID}.${definition.damageTypeSetting}"]`
      )
      if (!select) continue
      const selected = game.settings.get(
        MODULE_ID,
        definition.damageTypeSetting
      )
      select.replaceChildren(
        ...Object.entries(choices).map(([value, label]) => {
          const option = document.createElement('option')
          option.value = value
          option.textContent = label
          option.selected = value === selected
          return option
        })
      )
    }
  })
  return choices
}

let automationSettingsWindow = null

export async function openAutomationSettings () {
  if (!game.user.isGM) return
  if (automationSettingsWindow) {
    automationSettingsWindow.bringToFront()
    return automationSettingsWindow
  }
  const definitions = getAutomatedStatuses()
  class AutomationSettings extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
      classes: ['ul-automation-settings'],
      window: { title: 'Configure Status Automation', resizable: false },
      position: { width: 400, height: 'auto' }
    }
    selected = definitions[0]?.id
    original = new Map(definitions.map(def => [def.id, isStatusAutomated(def)]))
    draft = new Map(this.original)
    busy = false

    async _renderHTML () {
      const root = document.createElement('div')
      root.className = 'standard-form'
      const pickerLabel = document.createElement('label')
      pickerLabel.textContent = 'Status'
      const picker = document.createElement('select')
      picker.setAttribute('aria-label', 'Select status automation')
      for (const def of definitions) picker.add(new Option(def.name, def.id))
      picker.value = this.selected ?? ''
      picker.disabled = this.busy || !definitions.length
      picker.addEventListener('change', () => {
        if (this.busy) return
        this.selected = picker.value
        void this.render({ force: true }).catch(error =>
          ui.notifications.error(error.message)
        )
      })
      pickerLabel.append(picker)
      root.append(pickerLabel)
      const definition = definitions.find(def => def.id === this.selected)
      if (definition) {
        const section = document.createElement('div')
        const group = document.createElement('div')
        group.className = 'ul-automation-toggle'
        const label = document.createElement('label')
        label.textContent = 'Automate'
        const fields = document.createElement('div')
        fields.className = 'form-fields'
        const enabled = document.createElement('input')
        enabled.type = 'checkbox'
        enabled.checked = this.draft.get(definition.id)
        enabled.disabled = this.busy
        enabled.setAttribute(
          'aria-label',
          `Automatically resolve ${definition.name}`
        )
        enabled.addEventListener('change', () => {
          if (!this.busy) this.draft.set(definition.id, enabled.checked)
        })
        fields.append(enabled)
        group.append(label, fields)
        const hint = document.createElement('p')
        hint.className = 'hint'
        hint.textContent =
          getAutomationCapabilities(definition).join(', ') + '.'
        section.append(group, hint)
        root.append(section)
      }
      const actions = document.createElement('div')
      actions.className = 'ul-automation-actions'
      const save = document.createElement('button')
      save.type = 'button'
      save.textContent = this.busy ? 'Saving...' : 'Save'
      save.disabled = this.busy || !definitions.length
      save.addEventListener('click', async () => {
        if (this.busy || !game.user.isGM) return
        this.busy = true
        for (const control of root.querySelectorAll('input, select, button'))
          control.disabled = true
        try {
          for (const def of definitions) {
            const value = this.draft.get(def.id)
            if (value === this.original.get(def.id)) continue
            await game.settings.set(
              MODULE_ID,
              getAutomationSettingKey(def),
              value
            )
            this.original.set(def.id, value)
          }
          await this.close()
        } catch (error) {
          ui.notifications.error(error.message)
          this.busy = false
          await this.render({ force: true })
        }
      })
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = 'Cancel'
      cancel.disabled = this.busy
      cancel.addEventListener('click', () => {
        if (!this.busy) void this.close()
      })
      actions.append(save, cancel)
      root.append(actions)
      return root
    }
    _replaceHTML (result, content) {
      content.replaceChildren(result)
    }
    _onClose (options) {
      if (automationSettingsWindow === this) automationSettingsWindow = null
      return super._onClose(options)
    }
  }
  const app = new AutomationSettings()
  automationSettingsWindow = app
  try {
    await app.render({ force: true })
  } catch (error) {
    automationSettingsWindow = null
    throw error
  }
  return app
}

export function installAutomationSettings () {
  game.settings.register(MODULE_ID, 'autoEndTurn', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: true
  })
  game.settings.register(MODULE_ID, 'automationPreferencesVersion', {
    scope: 'world',
    config: false,
    type: String,
    default: ''
  })
  for (const definition of getAutomatedStatuses())
    game.settings.register(MODULE_ID, getAutomationSettingKey(definition), {
      scope: 'world',
      config: false,
      type: Boolean,
      default: true
    })
  game.settings.registerMenu(MODULE_ID, 'automation', {
    name: 'Status automation',
    label: 'Configure status automation',
    hint: 'The status are automated by default. Turn off those you want to resolve manually, damage is separate for ease of bookkeeping.',
    icon: 'fas fa-gears',
    restricted: true,
    type: class extends foundry.applications.api.ApplicationV2 {
      render () {
        void openAutomationSettings().catch(error =>
          ui.notifications.error(error.message)
        )
        return this
      }
    }
  })
}

export async function migrateAutomationSettings () {
  if (
    !game.user.isGM ||
    game.users.activeGM?.id !== game.user.id ||
    game.settings.get(MODULE_ID, 'automationPreferencesVersion') === '1'
  )
    return
  const enabled = game.settings.get(MODULE_ID, 'autoEndTurn') !== false
  const storage = game.settings.storage?.get('world')
  for (const definition of getAutomatedStatuses().filter(d => d.endTurn)) {
    const key = getAutomationSettingKey(definition)
    if (storage?.get(`${MODULE_ID}.${key}`) == null)
      await game.settings.set(MODULE_ID, key, enabled)
  }
  await game.settings.set(MODULE_ID, 'automationPreferencesVersion', '1')
}

export function registerModuleSettings (open) {
  game.settings.register(MODULE_ID, 'reportStatusApplications', {
    name: 'Report status applications in chat',
    hint: 'Post a chat report when status count is added.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  })
  game.settings.register(MODULE_ID, 'resolutionText', {
    name: 'Resolution descriptions',
    scope: 'client',
    config: true,
    type: String,
    choices: { full: 'Full text', none: 'No text' },
    default: 'full',
    onChange: () => ui.chat?.render({ force: true })
  })
  game.settings.register(MODULE_ID, 'autoApplyDamage', {
    name: 'Automatically apply condition damage',
    hint: 'Applies the damage caused by status effects automatically.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  })
  game.settings.register(MODULE_ID, 'automationUpgrade', {
    scope: 'world',
    config: false,
    type: String,
    default: ''
  })
  const types = installDamageTypeChoices()
  for (const definition of STATUS_DEFINITIONS.filter(
    (d, index, all) =>
      d.damageTypeSetting &&
      all.findIndex(
        other => other.damageTypeSetting === d.damageTypeSetting
      ) === index
  ))
    game.settings.register(MODULE_ID, definition.damageTypeSetting, {
      name: `${definition.name} damage type`,
      scope: 'world',
      config: true,
      type: String,
      choices: types,
      default: 'untyped'
    })
  for (const definition of STATUS_DEFINITIONS)
    for (const [key, setting] of Object.entries(definition.settings ?? {}))
      game.settings.register(MODULE_ID, key, setting)
  game.settings.registerMenu(MODULE_ID, 'panel', {
    name: STATUS_MANAGER_LABEL,
    label: "Configure selected token's LC Status",
    icon: 'fa-solid fa-list-check',
    restricted: false,
    type: class extends foundry.applications.api.ApplicationV2 {
      render () {
        void open()
        return this
      }
    }
  })
}

export function registerDamageType () {
  CONFIG.DND5E.damageTypes.untyped ??= {
    label: 'Untyped',
    icon: 'modules/undertomes-limbus/icons/rupture.png',
    color: new Color(0xaaaaaa)
  }
}
