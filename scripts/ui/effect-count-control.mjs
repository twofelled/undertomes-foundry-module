import { MODULE_ID } from '../core/runtime.mjs'
import { CONDITIONS } from '../statuses/index.mjs'
import { editEffectCount } from '../core/status-engine.mjs'

export function addEffectCountControl (app, html, context = {}) {
  const effect = app.document ?? app.object
  const condition = effect?.getFlag?.(MODULE_ID, 'condition')
  if (
    effect?.documentName !== 'ActiveEffect' ||
    !CONDITIONS[condition] ||
    CONDITIONS[condition].counted === false ||
    effect.parent?.documentName !== 'Actor' ||
    !effect.isOwner ||
    !effect.parent.isOwner ||
    context.editable === false
  )
    return
  const details =
    (html.matches?.(
      '.tab[data-tab="details"], [data-application-part="details"]'
    )
      ? html
      : null) ??
    html.querySelector('.tab[data-tab="details"]') ??
    html.querySelector('[data-application-part="details"]')
  if (!details) return
  details.querySelector('.ul-effect-count')?.remove()
  const group = document.createElement('div')
  group.className = 'form-group ul-effect-count'
  const label = document.createElement('label')
  label.textContent = 'Count'
  const fields = document.createElement('div')
  fields.className = 'form-fields'
  const minus = document.createElement('button')
  minus.type = 'button'
  minus.textContent = '−'
  minus.setAttribute('aria-label', 'Remove one count')
  const input = document.createElement('input')
  input.type = 'number'
  input.min = '0'
  input.max = '9999'
  input.step = '1'
  input.value = String(effect.getFlag(MODULE_ID, 'count') ?? 0)
  input.setAttribute('aria-label', `${CONDITIONS[condition].name} count`)
  const plus = document.createElement('button')
  plus.type = 'button'
  plus.textContent = '+'
  plus.setAttribute('aria-label', 'Add one count')
  let busy = false
  const commit = async (event, delta) => {
    event.stopPropagation()
    if (busy) return
    busy = true
    minus.disabled = input.disabled = plus.disabled = true
    try {
      if (delta === undefined && !input.value.trim())
        throw new Error('Enter a count from 0 to 9999.')
      const count = await editEffectCount(
        effect,
        delta === undefined ? { count: Number(input.value) } : { delta }
      )
      input.value = String(count)
      if (!count) await app.close?.()
    } catch (error) {
      input.value = String(effect.getFlag(MODULE_ID, 'count') ?? 0)
      ui.notifications.error(error.message)
    } finally {
      busy = false
      minus.disabled = input.disabled = plus.disabled = false
    }
  }
  minus.addEventListener('click', event => {
    void commit(event, -1)
  })
  plus.addEventListener('click', event => {
    void commit(event, 1)
  })
  input.addEventListener('change', event => {
    void commit(event)
  })
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent = 'Set to 0 to remove this status.'
  fields.append(minus, input, plus)
  group.append(label, fields, hint)
  for (const command of CONDITIONS[condition].commands?.(
    Number(effect.getFlag(MODULE_ID, 'count') ?? 0)
  ) ?? []) {
    const action = document.createElement('button')
    action.type = 'button'
    action.textContent = command.label
    action.addEventListener('click', async event => {
      event.stopPropagation()
      if (busy) return
      busy = true
      action.disabled = minus.disabled = input.disabled = plus.disabled = true
      try {
        const api = game.modules.get(MODULE_ID).api
        await CONDITIONS[condition].actions[command.operation]({
          api,
          actor: effect.parent
        })
        if (!api.getCount(effect.parent, condition)) await app.close?.()
      } catch (error) {
        ui.notifications.error(error.message)
      } finally {
        busy = false
        action.disabled =
          minus.disabled =
          input.disabled =
          plus.disabled =
            false
      }
    })
    group.append(action)
  }
  details.prepend(group)
}

export function installEffectCountControl () {
  Hooks.on('renderApplicationV2', addEffectCountControl)
}
