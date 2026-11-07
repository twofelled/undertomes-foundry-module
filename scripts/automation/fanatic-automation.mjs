import { conditionCount } from '../core/runtime.mjs'
import { CONDITIONS } from '../statuses/index.mjs'
import { isStatusAutomated } from './settings.mjs'
import { nailsAttackBonus } from '../statuses/nails.mjs'

const actorFor = subject => subject?.actor ?? subject?.item?.actor ?? subject
const active = actor =>
  actor?.isOwner &&
  conditionCount(actor, 'fanatic', true) > 0 &&
  isStatusAutomated(CONDITIONS.fanatic)
const checkTypes = new Set([
  'abilityCheck',
  'skill',
  'tool',
  'savingThrow',
  'abilitySave',
  'deathSave',
  'concentration'
])
const isCheck = process => process.hookNames?.some(name => checkTypes.has(name))
export function isMeleeWeaponAttack (activity, options = {}) {
  if (
    !activity?.item ||
    activity.item.type === 'spell' ||
    activity.attack?.type?.classification === 'spell'
  )
    return false
  const mode =
    options.attackMode ?? options.mode ?? activity.attack?.type?.value
  if (mode?.startsWith('thrown') || mode === 'ranged' || mode === 'rwak')
    return false
  return (
    activity.getActionType?.(mode) === 'mwak' ||
    activity.actionType === 'mwak' ||
    (activity.attack?.type?.value === 'melee' &&
      activity.attack?.type?.classification !== 'spell')
  )
}

export function addFanaticRollModifier (
  process,
  config,
  _index,
  { formData } = {}
) {
  const actor = actorFor(process.subject)
  if (!active(actor)) return
  config.parts ??= []
  config.parts = config.parts.filter(
    part =>
      typeof part !== 'string' ||
      (!part.endsWith('[Fanatic]') && !part.endsWith('[Fanatic Nails]'))
  )
  if (process.hookNames?.includes('attack') && process.ulFanaticNailsBonus)
    config.parts.push(`${process.ulFanaticNailsBonus}[Fanatic Nails]`)
  if (!isCheck(process)) return
  const hp = actor.system?.attributes?.hp
  const mandatory = Number(hp?.value) < Number(hp?.max) / 2
  if (!mandatory && !(formData?.object?.ulFanaticD4 ?? process.ulFanaticD4))
    return
  const proficiency = Number(actor.system?.attributes?.prof ?? 0)
  config.parts.push(`((2 * (1d4 % 2) - 1) * ${proficiency})[Fanatic]`)
}

let installed = false
export function installFanaticAutomation () {
  if (installed) return
  installed = true
  Hooks.on('dnd5e.preRollAttackV2', (process, _dialog, message) => {
    if (!active(actorFor(process.subject))) return
    const tokens = [...(game.user.targets ?? [])]
    const descriptors = message.data?.system?.targets
    const actors = descriptors?.length
      ? descriptors.map(
          target =>
            globalThis.fromUuidSync?.(target.actor, { strict: false }) ??
            tokens.find(token => token.actor?.uuid === target.actor)?.actor
        )
      : tokens.map(token => token.actor)
    const bonuses = actors.map(actor =>
      nailsAttackBonus(conditionCount(actor, 'nails', true))
    )
    if (new Set(bonuses).size > 1) {
      ui.notifications.warn(
        'Nails bonuses differ between targets. Roll the attacks one target at a time.'
      )
      return false
    }
    process.ulFanaticNailsBonus = bonuses[0] ?? 0
  })
  Hooks.on('dnd5e.postBuildRollConfig', addFanaticRollModifier)
  Hooks.on('renderApplicationV2', (app, html) => {
    const process = app.config
    const actor = actorFor(process?.subject)
    if (!process || !isCheck(process) || !active(actor)) return
    const root =
      html.querySelector('[data-application-part="configuration"]') ?? html
    root.querySelector('.ul-fanatic-d4')?.remove()
    const label = document.createElement('label')
    label.className = 'ul-fanatic-d4'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.name = 'ulFanaticD4'
    const hp = actor.system?.attributes?.hp
    const mandatory = Number(hp?.value) < Number(hp?.max) / 2
    input.checked = mandatory || Boolean(process.ulFanaticD4)
    input.disabled = mandatory
    input.addEventListener('change', () => {
      process.ulFanaticD4 = input.checked
    })
    label.append(input, document.createTextNode(' Fanatic d4'))
    root.append(label)
  })
}
