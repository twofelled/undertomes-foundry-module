import {
  MODULE_ID,
  resolveMessageEffect,
  isPrimaryGM
} from '../core/runtime.mjs'
import {
  findBleedingEffect,
  getBleedTreatmentDC,
  BLEED_CONDITIONS,
  treatBleed
} from './bleed-treatment.mjs'

let auraSyncPromise = null
let isAuraSyncPending = false
const pendingTreatmentRequests = new Map()
const treatmentActionActors = new Map()
let hasDiscoveredTreatmentActions = false
const BLEED_SOCKET_CHANNEL = `module.${MODULE_ID}`
const TREATMENT_REACH_FEET = 10
const TREATMENT_ACTION_DESCRIPTION = `<p>As an action, make a Wisdom (Medicine) check to remove all Bleed or Heavy Bleed from yourself or a creature within ${TREATMENT_REACH_FEET} feet. Choose Bleed or Heavy Bleed. The DC is 10 + current Bleed count, or 15 + current Heavy Bleed count. Each check clears only the chosen condition.</p>`
const hasBleed = actor =>
  actor?.effects.some(
    e =>
      BLEED_CONDITIONS.includes(e.getFlag(MODULE_ID, 'condition')) &&
      Number(e.getFlag(MODULE_ID, 'count')) > 0 &&
      !e.disabled &&
      !e.isSuppressed
  )

export function isWithinTreatmentReach (a, b) {
  if (a === b || (a.actor?.uuid && a.actor.uuid === b.actor?.uuid)) return true
  const grid = canvas.grid
  const cell = grid.isGridless ? 0 : canvas.scene.grid.size / 2
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v))
  const point = (token, other) => ({
    x: clamp(other.center.x, token.x + cell, token.x + token.w - cell),
    y: clamp(other.center.y, token.y + cell, token.y + token.h - cell),
    elevation: token.document.elevation ?? 0
  })
  const p = point(a, b),
    q = point(b, a)
  const units = canvas.scene.grid.units
  const reach =
    globalThis.dnd5e?.utils?.convertLength?.(
      TREATMENT_REACH_FEET,
      'ft',
      units,
      {
        strict: false
      }
    ) ??
    (/^(m|meters?|metres?)$/i.test(units)
      ? TREATMENT_REACH_FEET * 0.3048
      : TREATMENT_REACH_FEET)
  const pixelsPerUnit = canvas.scene.grid.size / canvas.scene.grid.distance
  if (
    Number.isFinite(pixelsPerUnit) &&
    Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) >
      reach * pixelsPerUnit + 0.001
  )
    return false
  const distance = grid.measurePath([p, q]).distance
  if (!Number.isFinite(distance) || distance > reach + 0.001) return false
  const collision = globalThis.CONFIG?.Canvas?.polygonBackends?.move
  return !collision?.testCollision(a.center, b.center, {
    type: 'move',
    mode: 'any'
  })
}

export function getNearbyBleedingActors (healer) {
  const tokens = globalThis.canvas?.tokens?.placeables ?? []
  const helpers = tokens.filter(token => token.actor?.uuid === healer?.uuid)
  return [
    ...new Map(
      tokens
        .filter(
          token =>
            hasBleed(token.actor) &&
            helpers.some(helper => isWithinTreatmentReach(helper, token))
        )
        .map(token => [token.actor.uuid, token.actor])
    ).values()
  ]
}

export function canTreatBleed (healer, target) {
  if (!healer || !hasBleed(target)) return false
  const tokens = globalThis.canvas?.tokens?.placeables ?? []
  const helpers = tokens.filter(token => token.actor?.uuid === healer.uuid)
  const patients = tokens.filter(token => token.actor?.uuid === target.uuid)
  return helpers.some(helper =>
    patients.some(patient => isWithinTreatmentReach(helper, patient))
  )
}

function grantedAction () {
  return {
    name: 'Treat Bleed',
    type: 'feat',
    img: `modules/${MODULE_ID}/icons/bleed.png`,
    flags: { [MODULE_ID]: { treatBleedAura: true, treatBleedAuraVersion: 4 } },
    system: {
      description: { value: TREATMENT_ACTION_DESCRIPTION },
      activities: {
        TreatBleedAura01: {
          _id: 'TreatBleedAura01',
          type: 'utility',
          name: 'Treat Bleed',
          activation: { type: 'action', value: 1, override: true }
        }
      }
    }
  }
}

export function syncBleedAura () {
  isAuraSyncPending = true
  if (auraSyncPromise) return auraSyncPromise
  auraSyncPromise = Promise.resolve()
    .then(async () => {
      do {
        isAuraSyncPending = false
        await synchronizeAura()
      } while (isAuraSyncPending)
    })
    .finally(() => {
      auraSyncPromise = null
      if (isAuraSyncPending)
        void syncBleedAura().catch(error =>
          console.error(MODULE_ID, 'Bleed aura:', error)
        )
    })
  return auraSyncPromise
}

async function synchronizeAura () {
  if (!isPrimaryGM() || !globalThis.canvas?.ready) return
  const tokens = canvas.tokens.placeables
  const bleeding = tokens.filter(token => hasBleed(token.actor))
  const availableActors = new Set()
  for (const token of tokens) {
    if (
      token.actor &&
      !availableActors.has(token.actor.uuid) &&
      bleeding.some(patient => isWithinTreatmentReach(token, patient))
    )
      availableActors.add(token.actor.uuid)
  }
  if (!hasDiscoveredTreatmentActions) {
    const existing = [
      ...(game.actors?.contents ?? []),
      ...(game.scenes?.contents ?? []).flatMap(scene =>
        [...scene.tokens].map(token => token.actor)
      )
    ].filter(Boolean)
    for (const actor of existing)
      if (
        [...actor.items].some(item => item.getFlag(MODULE_ID, 'treatBleedAura'))
      )
        treatmentActionActors.set(actor.uuid, actor)
    hasDiscoveredTreatmentActions = true
  }
  const actors = new Map([
    ...treatmentActionActors,
    ...tokens
      .filter(token => token.actor)
      .map(token => [token.actor.uuid, token.actor])
  ])
  for (const actor of actors.values()) {
    if (!actor.isOwner) continue
    const items = [...actor.items].filter(item =>
      item.getFlag(MODULE_ID, 'treatBleedAura')
    )
    const available = availableActors.has(actor.uuid)
    if (available && !items.length)
      await actor.createEmbeddedDocuments('Item', [grantedAction()])
    if (
      available &&
      items.length &&
      items[0].getFlag(MODULE_ID, 'treatBleedAuraVersion') !== 4
    )
      await items[0].update({
        'system.description.value': TREATMENT_ACTION_DESCRIPTION,
        [`flags.${MODULE_ID}.treatBleedAuraVersion`]: 4
      })
    const remove = available ? items.slice(1) : items
    if (remove.length)
      await actor.deleteEmbeddedDocuments(
        'Item',
        remove.map(item => item.id)
      )
    if (available) treatmentActionActors.set(actor.uuid, actor)
    else treatmentActionActors.delete(actor.uuid)
  }
}

export async function useTreatBleedAction (healer) {
  if (!healer?.isOwner) return
  const targets = getNearbyBleedingActors(healer)
  if (!targets.length)
    throw new Error(
      `No bleeding creature is within ${TREATMENT_REACH_FEET} feet.`
    )
  const selected = new Set(
    [...game.user.targets].map(token => token.actor?.uuid)
  )
  let target = targets.find(actor => selected.has(actor.uuid))
  if (!target && targets.length === 1) target = targets[0]
  if (!target) {
    const content = document.createElement('div')
    const label = document.createElement('label')
    label.textContent = 'Creature to treat'
    const select = document.createElement('select')
    select.name = 'patient'
    for (const actor of targets) {
      const details = BLEED_CONDITIONS.filter(condition =>
        findBleedingEffect(actor, condition)
      )
        .map(condition => {
          const count = Number(
            findBleedingEffect(actor, condition).getFlag(MODULE_ID, 'count')
          )
          return `${
            condition === 'bleed' ? 'Bleed' : 'Heavy Bleed'
          } DC ${getBleedTreatmentDC(condition, count)}`
        })
        .join('; ')
      select.add(new Option(`${actor.name} (${details})`, actor.uuid))
    }
    content.append(label, select)
    const values = await foundry.applications.api.DialogV2.input({
      window: { title: 'Treat Bleed' },
      content,
      ok: { label: 'Continue' }
    })
    if (!values) return
    target = targets.find(actor => actor.uuid === values.patient)
  }
  if (!target || !canTreatBleed(healer, target))
    throw new Error('The creature is no longer within reach.')
  return treatBleed(target, { healer })
}

export function requestBleedTreatmentClear (data) {
  if (!game.users.activeGM)
    throw new Error("A GM must be connected to clear this creature's Bleed.")
  const id = foundry.utils.randomID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTreatmentRequests.delete(id)
      reject(
        new Error(
          'The GM did not confirm the treatment. Check Bleed before retrying.'
        )
      )
    }, 15000)
    pendingTreatmentRequests.set(id, { resolve, reject, timer })
    game.socket.emit(BLEED_SOCKET_CHANNEL, {
      type: 'treatBleed',
      id,
      userId: game.user.id,
      ...data
    })
  })
}

async function confirmTreatment (data) {
  const healer = await fromUuid(data.healerUuid),
    target = await fromUuid(data.targetUuid)
  const check = await fromUuid(data.checkUuid)
  const attempt = check?.getFlag(MODULE_ID, 'bleedTreatment')
  const condition = attempt?.condition ?? 'bleed'
  const effect = BLEED_CONDITIONS.includes(condition)
    ? findBleedingEffect(target, condition)
    : null
  if (
    !healer ||
    !target ||
    !check ||
    !attempt ||
    check.author?.id !== data.userId ||
    !healer.testUserPermission(check.author, 'OWNER') ||
    check.getAssociatedActor?.()?.uuid !== healer.uuid ||
    check.type !== 'check' ||
    check.system.skill !== 'med' ||
    check.system.ability !== 'wis' ||
    check.rolls.length !== 1 ||
    check.rolls[0].total < attempt.dc ||
    attempt.targetUuid !== target.uuid ||
    attempt.healerUuid !== healer.uuid ||
    effect?.uuid !== attempt.effectUuid ||
    attempt.count !== Number(effect?.getFlag(MODULE_ID, 'count')) ||
    attempt.dc !== getBleedTreatmentDC(condition, attempt.count) ||
    Number(healer.system?.attributes?.hp?.value) <= 0 ||
    !canTreatBleed(healer, target)
  )
    throw new Error(
      'Treatment no longer matches the current Bleed, range or Medicine check.'
    )
  await resolveMessageEffect(check, 'treat-bleed-clear', () =>
    game.modules.get(MODULE_ID).api.setCount(target, condition, 0)
  )
}

export function installBleedAura () {
  let scheduled = false
  const refresh = () => {
    if (!isPrimaryGM() || scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      void syncBleedAura().catch(error =>
        console.error(MODULE_ID, 'Bleed aura:', error)
      )
    })
  }
  Hooks.on('canvasReady', refresh)
  for (const hook of [
    'createToken',
    'deleteToken',
    'createWall',
    'updateWall',
    'deleteWall'
  ])
    Hooks.on(hook, refresh)
  Hooks.on('updateToken', (token, changes) => {
    if (
      ['x', 'y', 'elevation', 'width', 'height', 'actorId', 'actorLink'].some(
        key => Object.hasOwn(changes, key)
      )
    )
      refresh()
  })
  Hooks.on('updateUser', (user, changes) => {
    if (Object.hasOwn(changes, 'active')) refresh()
  })
  for (const hook of ['createActiveEffect', 'deleteActiveEffect'])
    Hooks.on(hook, effect => {
      if (BLEED_CONDITIONS.includes(effect.getFlag(MODULE_ID, 'condition')))
        refresh()
    })
  Hooks.on('updateActiveEffect', (effect, changes) => {
    if (!BLEED_CONDITIONS.includes(effect.getFlag(MODULE_ID, 'condition')))
      return
    if (
      Object.hasOwn(changes, 'disabled') ||
      Object.hasOwn(changes.system ?? {}, 'conditions') ||
      Object.hasOwn(changes.system ?? {}, 'magical') ||
      Object.hasOwn(changes, 'system.conditions') ||
      Object.hasOwn(changes, 'system.magical') ||
      Number(effect.getFlag(MODULE_ID, 'count')) <= 0
    )
      refresh()
  })
  Hooks.on('deleteActor', actor => {
    treatmentActionActors.delete(actor.uuid)
    refresh()
  })
  Hooks.on('deleteToken', token => {
    if (!token.actorLink) treatmentActionActors.delete(token.actor?.uuid)
  })
  Hooks.on('dnd5e.preUseActivity', activity => {
    if (!activity.item?.getFlag(MODULE_ID, 'treatBleedAura')) return
    void useTreatBleedAction(activity.actor ?? activity.item.actor).catch(
      error => ui.notifications.error(error.message)
    )
    return false
  })
  game.socket.on(BLEED_SOCKET_CHANNEL, data => {
    if (!data || typeof data.id !== 'string') return
    if (data.type === 'treatBleedResult') {
      const request = pendingTreatmentRequests.get(data.id)
      if (!request) return
      pendingTreatmentRequests.delete(data.id)
      clearTimeout(request.timer)
      if (data.error) request.reject(new Error(data.error))
      else request.resolve()
    } else if (data.type === 'treatBleed' && isPrimaryGM()) {
      void confirmTreatment(data).then(
        () =>
          game.socket.emit(BLEED_SOCKET_CHANNEL, {
            type: 'treatBleedResult',
            id: data.id
          }),
        error =>
          game.socket.emit(BLEED_SOCKET_CHANNEL, {
            type: 'treatBleedResult',
            id: data.id,
            error: error.message
          })
      )
    }
  })
}
