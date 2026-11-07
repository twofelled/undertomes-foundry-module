import { MODULE_ID } from '../core/runtime.mjs'
import { conversionSourceId } from '../core/status-conversion.mjs'
import { CONDITIONS } from '../statuses/index.mjs'

export function getStatusApplications (activity) {
  if (activity?.flags?.[MODULE_ID]?.statusApplicationsEnabled === false)
    return {}
  return activity?.flags?.[MODULE_ID]?.statusApplications ?? {}
}

export function getApplicationTriggerChoices (activity) {
  return {
    use: 'On use',
    ...(activity.type === 'attack' ? { hit: 'On hit' } : {}),
    ...(activity.type === 'save'
      ? { failedSave: 'On failed save', successfulSave: 'On successful save' }
      : {}),
    manual: 'Special/Manual'
  }
}

export function getApplicationTrigger (activity, config) {
  return (
    config.trigger ??
    (activity.type === 'attack'
      ? 'hit'
      : activity.type === 'save'
      ? 'failedSave'
      : 'use')
  )
}

export const getActivityConversion = activity => {
  const config = activity?.flags?.[MODULE_ID]?.conversion ?? {}
  return config.sources
    ? {
        ...config,
        sources: [...new Set(config.sources.map(conversionSourceId))]
      }
    : config
}

export function getActivityEditorContext (app, html, context = {}) {
  const activity = app.activity ?? app.document
  const item = activity?.item
  if (!item?.isOwner || context.editable === false || item.compendium?.locked)
    return null
  const effect =
    (html.matches?.('.tab[data-tab="effect"], [data-application-part="effect"]')
      ? html
      : null) ??
    html.querySelector('.tab[data-tab="effect"]') ??
    html.querySelector('[data-application-part="effect"]')
  return effect ? { activity, item, effect } : null
}

export async function createActivityResolutionContext (message) {
  const uuid = message.system?.activity?.uuid
  if (!uuid) return null
  const activity = await fromUuid(uuid)
  if (!activity) return null
  const actors = new Map()
  return {
    activity,
    actorFromUuid (uuid) {
      if (!actors.has(uuid))
        actors.set(
          uuid,
          Promise.resolve().then(() => fromUuid(uuid))
        )
      return actors.get(uuid)
    }
  }
}

export function getActivityOutcome (message, activity) {
  if (message.type === 'usage' && !message.system.cause)
    return {
      event: 'use',
      targets: (message.system.targets ?? []).map(target => target.actor)
    }
  if (
    message.type === 'attack' &&
    activity.type === 'attack' &&
    message.rolls?.length === 1
  )
    return {
      event: 'hit',
      targets: (message.system.evaluatedTargets ?? [])
        .filter(target => target.isMiss === false)
        .map(target => target.actor)
    }
  if (
    message.type !== 'save' ||
    activity.type !== 'save' ||
    message.rolls?.length !== 1 ||
    ['death', 'concentration'].includes(message.system.type)
  )
    return null
  const failed = message.rolls[0].isFailure
  if (typeof failed !== 'boolean') return null
  return {
    event:
      failed && !message.system.forceSuccess && !message.system.resisted
        ? 'failedSave'
        : 'successfulSave',
    targets: [message.getAssociatedActor?.()?.uuid]
  }
}

export function addSectionToggle (legend, title, checked, body, save) {
  legend.textContent = ''
  const label = document.createElement('label')
  label.className = 'ul-section-toggle'
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.checked = checked
  toggle.setAttribute('aria-label', title)
  label.append(toggle, document.createTextNode(` ${title}`))
  legend.append(label)
  body.hidden = !checked
  let saved = checked
  toggle.addEventListener('change', async event => {
    event.stopPropagation()
    body.hidden = !toggle.checked
    body.inert = true
    toggle.disabled = true
    try {
      await save(toggle.checked)
      saved = toggle.checked
    } catch (error) {
      toggle.checked = saved
      body.hidden = !saved
      ui.notifications.error(error.message)
    } finally {
      toggle.disabled = false
      body.inert = false
    }
  })
  return toggle
}

export function renderEnabledStatuses (element, ids) {
  const definitions = [...ids].map(id => CONDITIONS[id]).filter(Boolean)
  element.replaceChildren(document.createTextNode('Enabled: '))
  if (!definitions.length) element.append(document.createTextNode('None'))
  for (const definition of definitions) {
    const badge = document.createElement('span')
    badge.className = 'ul-enabled-status'
    const icon = document.createElement('img')
    icon.src = definition.icon
    icon.alt = ''
    icon.width = icon.height = 18
    badge.append(icon, document.createTextNode(definition.name))
    element.append(badge)
  }
}
