import { MODULE_ID } from '../core/runtime.mjs'

const partTypes = part =>
  typeof part?.types === 'string' ? [part.types] : [...(part?.types ?? [])]

function orderedTypes (parts) {
  return [...new Set(parts.flatMap(partTypes))].filter(type =>
    Object.hasOwn(CONFIG.DND5E.damageTypes, type)
  )
}

export function getWeaponDamageTypes (item) {
  const activities = [...(item.system.activities?.values() ?? [])].filter(
    activity => activity.type === 'attack'
  )
  return orderedTypes([
    item.system.damage?.base,
    ...activities.flatMap(activity => activity.damage?.parts ?? [])
  ])
}

export function getAttackDamageType (activity) {
  const item = activity.item
  const weapon = item?.type === 'weapon'
  const types = orderedTypes([
    ...(weapon ? [item.system.damage?.base] : []),
    ...(activity.damage?.parts ?? [])
  ])
  const preferred = weapon
    ? item.getFlag?.(MODULE_ID, 'attackStatusDamageType') ??
      item.flags?.[MODULE_ID]?.attackStatusDamageType
    : undefined
  return types.includes(preferred) ? preferred : types[0] ?? 'untyped'
}

export function addWeaponStatusDamageControl (app, html, context = {}) {
  const item = app.document ?? app.item
  if (
    item?.documentName !== 'Item' ||
    item.type !== 'weapon' ||
    !item.isOwner ||
    context.editable === false ||
    item.compendium?.locked
  )
    return
  const details =
    html.querySelector('.tab[data-tab="details"]') ??
    html.querySelector('[data-application-part="details"]')
  if (!details) return
  details.querySelector('.ul-weapon-status-damage')?.remove()
  const types = getWeaponDamageTypes(item)
  const labelFor = type => {
    const config = CONFIG.DND5E.damageTypes[type]
    return game.i18n.localize(
      typeof config === 'string' ? config : config?.label ?? type
    )
  }
  const section = document.createElement('fieldset')
  section.className = 'ul-weapon-status-damage standard-form'
  const legend = document.createElement('legend')
  legend.textContent = 'Rupture & Poise'
  const group = document.createElement('div')
  group.className = 'form-group'
  const label = document.createElement('label')
  label.textContent = 'Damage type'
  const fields = document.createElement('div')
  fields.className = 'form-fields'
  const select = document.createElement('select')
  select.setAttribute('aria-label', 'Rupture and Poise damage type')
  select.add(new Option(`Leftmost (${labelFor(types[0] ?? 'untyped')})`, ''))
  for (const type of types) select.add(new Option(labelFor(type), type))
  const saved =
    item.getFlag?.(MODULE_ID, 'attackStatusDamageType') ??
    item.flags?.[MODULE_ID]?.attackStatusDamageType
  select.value = types.includes(saved) ? saved : ''
  select.addEventListener('change', async event => {
    event.stopPropagation()
    const previous = types.includes(
      item.getFlag?.(MODULE_ID, 'attackStatusDamageType') ??
        item.flags?.[MODULE_ID]?.attackStatusDamageType
    )
      ? item.getFlag?.(MODULE_ID, 'attackStatusDamageType') ??
        item.flags?.[MODULE_ID]?.attackStatusDamageType
      : ''
    select.disabled = true
    try {
      await item.update({
        [`flags.${MODULE_ID}.attackStatusDamageType`]: select.value
      })
    } catch (error) {
      select.value = previous
      ui.notifications.error(error.message)
    } finally {
      select.disabled = false
    }
  })
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent =
    "Rupture and Poise the leftmost damage type on default. Choose which to copy."
  fields.append(select)
  group.append(label, fields)
  section.append(legend, group, hint)
  details.append(section)
}

export function installWeaponStatusDamageControl () {
  Hooks.on('renderApplicationV2', addWeaponStatusDamageControl)
}
