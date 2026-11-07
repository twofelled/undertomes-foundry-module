import { CONDITIONS } from '../statuses/index.mjs'
import {
  MODULE_ID,
  STATUS_MANAGER_LABEL,
  createBatchRefresh
} from '../core/runtime.mjs'
import {
  isStatusAutomated,
  getDamageTypeChoices
} from '../automation/settings.mjs'
import { integer } from '../statuses/base.mjs'

const escape = value =>
  String(value).replace(
    /[&<>"']/g,
    c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  )
function statusFields (definition, context) {
  return definition
    .fields(context)
    .map(field => {
      if (field.type === 'button')
        return `<button type="button" data-op="${escape(
          field.operation
        )}">${escape(field.label)}</button>`
      const id = `ul-${field.name}`
      const input =
        field.type === 'select'
          ? `<select id="${escape(id)}" name="${escape(
              field.name
            )}">${field.options
              .map(
                ([value, label]) =>
                  `<option value="${escape(value)}">${escape(label)}</option>`
              )
              .join('')}</select>`
          : `<input id="${escape(id)}" name="${escape(
              field.name
            )}" type="number" min="${field.min}" max="${
              field.max
            }" step="1" value="${field.value}">`
      return `<label class="ul-field-label" for="${escape(id)}">${escape(
        field.label
      )}</label>${input}${
        field.note ? `<p class="ul-note">${escape(field.note)}</p>` : ''
      }`
    })
    .join('')
}

export function renderStatusManagerHTML ({
  selected = 'burn',
  mode = 'stacks',
  counts = {},
  disabled = [],
  amount = 1,
  damageTypes = {},
  autoEnd = true
}) {
  const def = CONDITIONS[selected]
  if (def.manualResolution === false) mode = 'stacks'
  const count = counts[selected] ?? 0
  const active = Object.values(counts).filter(n => n > 0).length
  const statusIcons = Object.entries(CONDITIONS)
    .filter(([id]) => (counts[id] ?? 0) > 0)
    .map(
      ([id, definition]) =>
        `<span class="ul-status-count${
          disabled.includes(id) ? ' is-suppressed' : ''
        }" title="${escape(definition.name)}${
          disabled.includes(id) ? ' (suppressed)' : ''
        }" aria-label="${escape(definition.name)}${
          definition.counted === false ? '' : `: ${counts[id]}`
        }"><img src="${escape(definition.icon)}" alt="">${
          definition.counted === false ? '' : `<b>${counts[id]}</b>`
        }</span>`
    )
    .join('')
  const options = Object.entries(CONDITIONS)
    .map(
      ([id, definition]) =>
        `<option value="${escape(id)}" ${
          id === selected ? 'selected' : ''
        }>${escape(definition.name)}</option>`
    )
    .join('')
  const facts = def.facts(count)
  const extra = facts.length
    ? `<div class="ul-facts">${facts
        .map(f => `<span>${escape(f.label)} <b>${escape(f.value)}</b></span>`)
        .join('')}${
        def.factsNote ? `<small>${escape(def.factsNote)}</small>` : ''
      }</div>`
    : ''
  let body
  if (def.counted === false && mode === 'stacks') {
    body = `<button type="button" data-op="toggle">${
      count && !disabled.includes(selected) ? 'Deactivate' : 'Activate'
    } ${escape(def.name)}</button>`
  } else if (mode === 'stacks' || !def.resolve) {
    body = `<label class="ul-field-label" for="ul-count">Amount</label><div class="ul-amount"><button type="button" data-op="less" aria-label="Decrease amount">-</button><input id="ul-count" name="amount" type="number" min="1" max="9999" step="1" value="${amount}" aria-label="Count amount"><button type="button" data-op="more" aria-label="Increase amount">+</button></div><div class="ul-actions"><button type="button" class="ul-primary default" data-op="add">Add count</button><button type="button" data-op="spend" ${
      count ? '' : 'disabled'
    }>Spend count</button><button type="button" data-op="set">Set total</button></div>`
  } else {
    const fields = statusFields(def, { damageTypes, count })
    const text = escape(def.preview(count))
    body = `${fields}<div class="ul-preview">${text}</div><button type="button" class="ul-primary default ul-resolve" data-op="trigger" ${
      !count || disabled.includes(selected) ? 'disabled' : ''
    }>${escape(def.resolveLabel ?? `Resolve ${def.name}`)}</button>`
  }
  return `<div class="ul-manager standard-form"><div class="ul-eyebrow"><div class="ul-status-counts" aria-label="Current status counts">${statusIcons}</div><span>${
    autoEnd ? 'Automatic turn end' : 'Manual turn end'
  }</span></div><div class="ul-status-picker"><label class="ul-field-label" for="ul-status-selection">Status</label><select id="ul-status-selection" name="statusSelection" aria-label="Select status">${options}</select></div><section class="ul-detail"><div class="ul-detail-title"><div class="ul-selected-name"><img src="${escape(
    def.icon
  )}" alt=""><div><h2>${def.name}</h2><span>${
    disabled.includes(selected)
      ? 'Disabled / suppressed'
      : def.counted === false
      ? 'Status'
      : 'Current count'
  }</span></div></div><strong class="ul-current-count">${
    def.counted === false
      ? count && !disabled.includes(selected)
        ? 'Active'
        : 'Inactive'
      : count
  }</strong></div><p class="ul-description">${escape(
    def.description ?? def.name
  )}</p>${extra}<div class="ul-tabs"><button type="button" data-mode="stacks" class="${
    mode === 'stacks' ? 'is-selected' : ''
  }">${def.counted === false ? 'Manage status' : 'Manage count'}</button>${
    !def.resolve || def.manualResolution === false
      ? ''
      : `<button type="button" data-mode="resolve" class="${
          mode === 'resolve' ? 'is-selected' : ''
        }">Resolve effect</button>`
  }</div><div class="ul-editor">${body}</div></section><footer class="ul-footer"><button type="button" data-op="clear" ${
    count ? '' : 'disabled'
  }>Clear ${def.name}</button><button type="button" data-op="clearAll" ${
    active ? '' : 'disabled'
  }>Clear all statuses</button>${
    Object.values(CONDITIONS).some(d => d.endTurn && counts[d.id])
      ? '<button type="button" data-op="end">Resolve turn end</button>'
      : ''
  }</footer></div>`
}

export function installManagerAccess (open) {
  Hooks.on('getSceneControlButtons', controls => {
    if (!controls.tokens) return
    controls.tokens.tools.limbusStatusManager = {
      name: 'limbusStatusManager',
      title: STATUS_MANAGER_LABEL,
      icon: 'fa-solid fa-list-check',
      order: Object.keys(controls.tokens.tools).length,
      button: true,
      visible: true,
      onChange: () => {
        void open()
      }
    }
  })
  game.keybindings.register(MODULE_ID, 'openStatusManager', {
    name: 'Open LC Status Manager',
    hint: 'Opens the manager for the selected token. Assign your preferred shortcut here.',
    editable: [],
    onDown: () => {
      void open()
      return true
    },
    restricted: false
  })
}

const managers = new Map()
export function openStatusManager (actor) {
  const existing = managers.get(actor.uuid)
  if (existing) {
    existing.bringToFront()
    return existing
  }
  class StatusManager extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
      classes: ['ul-status-manager'],
      window: { title: 'LC Status Manager', resizable: false },
      position: { width: 510, height: 'auto' }
    }
    closed = false
    selected = 'burn'
    mode = 'stacks'
    amount = 1
    busy = false
    subscriptions = []
    get title () {
      return `Status Manager - ${actor.name}`
    }
    constructor () {
      super()
      const api = game.modules.get(MODULE_ID).api
      this.selected =
        Object.keys(CONDITIONS).find(id => api.getCount(actor, id) > 0) ??
        'burn'
      this.refreshQueue = createBatchRefresh(() => {
        if (this.rendered && !this.busy && !this.closed)
          void this.render({ force: true }).catch(error =>
            ui.notifications.error(error.message)
          )
      })
      const refresh = doc => {
        const affected = doc.documentName === 'Actor' ? doc : doc.parent
        if (
          affected?.uuid === actor.uuid &&
          this.rendered &&
          !this.busy &&
          !this.closed
        )
          this.refreshQueue.add(actor)
      }
      for (const hook of [
        'updateActor',
        'createActiveEffect',
        'updateActiveEffect',
        'deleteActiveEffect'
      ])
        this.subscriptions.push([hook, Hooks.on(hook, refresh)])
      this.subscriptions.push([
        'deleteActor',
        Hooks.on('deleteActor', doc => {
          if (doc.uuid === actor.uuid) void this.close()
        })
      ])
      this.subscriptions.push([
        'deleteToken',
        Hooks.on('deleteToken', doc => {
          if (doc.actor?.uuid === actor.uuid) void this.close()
        })
      ])
    }
    async _renderHTML () {
      const api = game.modules.get(MODULE_ID).api
      const counts = Object.fromEntries(
        Object.keys(CONDITIONS).map(id => [id, api.getCount(actor, id)])
      )
      const disabled = actor.effects
        .filter(e => e.disabled || e.isSuppressed)
        .map(e => e.getFlag(MODULE_ID, 'condition'))
      const damageTypes = getDamageTypeChoices()
      const root = document.createElement('div')
      root.innerHTML = renderStatusManagerHTML({
        selected: this.selected,
        mode: this.mode,
        counts,
        disabled,
        amount: this.amount,
        damageTypes,
        autoEnd: Object.values(CONDITIONS).some(
          d => d.endTurn && isStatusAutomated(d)
        )
      })
      root.addEventListener('input', event => {
        if (event.target.name === 'amount') this.amount = event.target.value
      })
      root.addEventListener('change', event => {
        if (event.target.name !== 'statusSelection' || this.busy || this.closed)
          return
        const selected = event.target.value
        if (!Object.hasOwn(CONDITIONS, selected)) return
        this.selected = selected
        this.mode = 'stacks'
        void this.render({ force: true }).catch(error =>
          ui.notifications.error(error.message)
        )
      })
      root.addEventListener('click', event => {
        void this.handleClick(event, root)
      })
      return root
    }
    _replaceHTML (result, content) {
      content.replaceChildren(result)
    }
    async handleClick (event, root) {
      const button = event.target.closest('button')
      if (!button || button.disabled || this.busy || this.closed) return
      if (button.dataset.mode) {
        this.mode = button.dataset.mode
        await this.render({ force: true })
        return
      }
      const op = button.dataset.op,
        api = game.modules.get(MODULE_ID).api,
        id = this.selected
      if (!op) return
      try {
        if (!actor.isOwner)
          throw new Error('You no longer have permission to edit this actor.')
        this.busy = true
        root.querySelectorAll('button, select').forEach(b => {
          b.disabled = true
        })
        if (op === 'less' || op === 'more')
          this.amount = Math.max(
            1,
            Math.min(9999, integer(this.amount, 1) + (op === 'more' ? 1 : -1))
          )
        else if (op === 'add' || op === 'spend')
          await api.addCount(
            actor,
            id,
            integer(this.amount, 1) * (op === 'spend' ? -1 : 1)
          )
        else if (op === 'toggle')
          await api.setActive(actor, id, !api.isActive(actor, id))
        else if (op === 'clearAll') await api.clearAll(actor)
        else if (op === 'set' || op === 'clear')
          await api.setCount(
            actor,
            id,
            op === 'clear' ? 0 : integer(this.amount, 1)
          )
        else if (CONDITIONS[id].actions?.[op])
          await CONDITIONS[id].actions[op]({ api, actor })
        else if (op === 'trigger') {
          const fields = CONDITIONS[id].fields({
            damageTypes: {},
            count: api.getCount(actor, id)
          })
          const options = Object.fromEntries(
            fields
              .filter(f => f.name)
              .map(field => {
                const value = root.querySelector(
                  `[name="${field.name}"]`
                )?.value
                return [
                  field.name,
                  value == null || value === ''
                    ? null
                    : field.type === 'number' || field.valueType === 'number'
                    ? Number(value)
                    : value
                ]
              })
          )
          await api.trigger(actor, id, options)
        } else if (op === 'end') {
          const combat = game.combat
          const key =
            combat?.started && combat.combatant?.actor?.uuid === actor.uuid
              ? `${combat.id}:${combat.round}:${combat.combatant.id}`
              : null
          await api.endTurn(actor, key)
        }
      } catch (error) {
        console.error(MODULE_ID, error)
        ui.notifications.error(error.message)
      } finally {
        this.busy = false
        if (!this.closed) await this.render({ force: true })
      }
    }
    release () {
      this.closed = true
      this.refreshQueue?.clear()
      for (const [hook, id] of this.subscriptions) Hooks.off(hook, id)
      this.subscriptions = []
      if (managers.get(actor.uuid) === this) managers.delete(actor.uuid)
    }
    async _onClose (options) {
      this.release()
      return super._onClose(options)
    }
  }
  const manager = new StatusManager()
  managers.set(actor.uuid, manager)
  void manager.render({ force: true }).catch(async error => {
    manager.release()
    await manager.close()
    ui.notifications.error(error.message)
  })
  return manager
}
