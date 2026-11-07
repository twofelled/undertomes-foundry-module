import {
  MODULE_ID,
  createQueue,
  resolveMessageEffect,
  statusEffectName,
  storedEffectChanges,
  isDowned
} from './runtime.mjs'
import { isStatusAutomated } from '../automation/settings.mjs'
import {
  CONDITIONS,
  getStatus,
  STATUS_DEFINITIONS,
  TURN_END_STATUSES,
  TURN_START_STATUSES,
  resolve
} from '../statuses/index.mjs'
import { integer } from '../statuses/base.mjs'
import { rollEffectDamage } from '../workflows/combat-effects.mjs'
import {
  renderResolutionCardHTML,
  reportStatusApplication
} from '../ui/chat-cards.mjs'
import { planConversion, conversionSources } from './status-conversion.mjs'
import {
  createTremorAllocationPrompt,
  getTremorAllocationCounts
} from '../workflows/tremor-allocation.mjs'

const enqueueActorOperation = createQueue()
const findActorStatusEffect = (actor, id) =>
  actor.effects.find(e => e.getFlag(MODULE_ID, 'condition') === id)
const getActorStatusCount = (actor, id) => {
  const effect = findActorStatusEffect(actor, id)
  return CONDITIONS[id]?.counted === false
    ? Number(Boolean(effect))
    : effect?.getFlag(MODULE_ID, 'count') ?? 0
}
function assertActorOwnership (actor) {
  if (!actor || !actor.isOwner)
    throw new Error('Select a token whose actor you can edit.')
}
const withActorMutation = (actor, operation) =>
  enqueueActorOperation(actor.uuid, operation)

async function writeStatusCount (
  actor,
  id,
  count,
  { preserveState = false } = {}
) {
  assertActorOwnership(actor)
  const def = getStatus(id)
  integer(count, 0, def.counted === false ? 1 : 9999)
  const effect = findActorStatusEffect(actor, id)
  if (!count) {
    if (effect) await effect.delete()
    return
  }
  const data = {
    name: statusEffectName(def, effect?.name),
    img: def.icon,
    disabled: preserveState ? Boolean(effect?.disabled) : false,
    statuses: [
      ...new Set([
        ...(preserveState || def.counted === false
          ? effect?.statuses ?? []
          : []),
        `${MODULE_ID}.${id}`
      ])
    ],
    system: {
      changes: [
        ...((preserveState || def.counted === false) && effect
          ? storedEffectChanges(effect).filter(
              change => !def.effectKeys.includes(change.key)
            )
          : []),
        ...def.effectChanges(count, { actor })
      ]
    },
    flags: {
      [MODULE_ID]: {
        condition: id,
        ...(def.counted === false ? { uncounted: true } : { count })
      }
    }
  }
  if (def.nextTurnEnd) {
    const combat = game.combat
    data.flags[MODULE_ID].deferEndTurnKey =
      combat?.started && combat.combatant?.actor?.uuid === actor.uuid
        ? `${combat.id}:${combat.round}:${combat.combatant.id}`
        : null
  }
  if (!effect && def.clearOnRestOutsideCombat)
    data.flags[MODULE_ID].gainedOutsideCombat =
      !game.combat?.started ||
      Boolean(
        game.combat.combatants?.some &&
          !game.combat.combatants.some(
            combatant => combatant.actor?.uuid === actor.uuid
          )
      )
  if (effect) await effect.update(data)
  else await actor.createEmbeddedDocuments('ActiveEffect', [data])
}

async function addStatusCount (actor, id, change, options) {
  assertActorOwnership(actor)
  const definition = getStatus(id)
  const added = integer(change, -9999)
  if (definition.counted === false) {
    if (added !== 0) {
      const active = added > 0
      await writeStatusCount(actor, id, Number(active))
      if (active) await reportStatusApplication(actor, id, 1, 1, options)
    }
    return
  }
  let destination = id
  if (added > 0) {
    const absorbers = STATUS_DEFINITIONS.filter(def => {
      const effect = findActorStatusEffect(actor, def.id)
      return (
        (def.absorbs?.includes(id) ||
          (id === 'tremor' && def.tremorFamily && def.id !== 'tremor')) &&
        effect &&
        !effect.disabled &&
        !effect.isSuppressed &&
        getActorStatusCount(actor, def.id) > 0
      )
    })
    if (id === 'tremor' && absorbers.length > 1)
      return createTremorAllocationPrompt(actor, added, options)
    if (absorbers.length === 1) destination = absorbers[0].id
  }
  const total = Math.max(
    0,
    Number(getActorStatusCount(actor, destination)) + added
  )
  await writeStatusCount(actor, destination, total)
  if (added > 0)
    await reportStatusApplication(actor, destination, added, total, options)
}

export function editEffectCount (effect, { count, delta } = {}) {
  const actor = effect.parent
  const id = effect.getFlag(MODULE_ID, 'condition')
  assertActorOwnership(actor)
  return withActorMutation(actor, async () => {
    if (findActorStatusEffect(actor, id) !== effect)
      throw new Error('This status effect no longer exists.')
    const next =
      delta === undefined
        ? integer(count)
        : Math.max(
            0,
            integer(getActorStatusCount(actor, id)) + integer(delta, -9999)
          )
    await writeStatusCount(actor, id, next, { preserveState: true })
    return next
  })
}

async function resolveStatusEffect (actor, id, options = {}) {
  assertActorOwnership(actor)
  if (isDowned(actor)) return
  const effect = findActorStatusEffect(actor, id)
  if (!effect || effect.disabled || effect.isSuppressed) return
  const count = getActorStatusCount(actor, id)
  const definition = getStatus(id)
  const targetActor =
    options.targetActor ??
    (definition.recipient === 'target' && game.user.targets.size === 1
      ? [...game.user.targets][0]?.actor
      : undefined)
  if (definition.recipient === 'target' && isDowned(targetActor)) return
  const result = resolve(id, count, {
    ...definition.resolveOptions?.({ actor, targetActor }),
    ...options
  })
  for (const grant of result.grants ?? []) {
    integer(grant.count)
    const recipient = grant.recipient === 'target' ? targetActor : actor
    if (!recipient?.isOwner)
      throw new Error('The status recipient cannot be edited.')
    const destination =
      STATUS_DEFINITIONS.find(
        def =>
          def.absorbs?.includes(grant.condition) &&
          findActorStatusEffect(recipient, def.id) &&
          !findActorStatusEffect(recipient, def.id).disabled &&
          !findActorStatusEffect(recipient, def.id).isSuppressed
      )?.id ?? grant.condition
    integer(Number(getActorStatusCount(recipient, destination)) + grant.count)
  }
  if (result.formula) {
    await rollEffectDamage(actor, id, result, { targetActor })
  } else
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: renderResolutionCardHTML(id, {
        mode: game.settings.get(MODULE_ID, 'resolutionText')
      }),
      flags: { [MODULE_ID]: { condition: id, automatic: false } }
    })
  await writeStatusCount(actor, id, result.next, { preserveState: true })
  const pendingGrants = []
  for (const grant of result.grants ?? []) {
    if (!grant.count) continue
    const recipient = grant.recipient === 'target' ? targetActor : actor
    if (recipient.uuid === actor.uuid)
      await addStatusCount(actor, grant.condition, grant.count)
    else pendingGrants.push({ ...grant, recipient })
  }
  return pendingGrants
}
async function endTurn (actor, key = null, { automatic = false } = {}) {
  assertActorOwnership(actor)
  if (isDowned(actor)) return
  return withActorMutation(actor, async () => {
    if (isDowned(actor)) return
    if (automatic && !TURN_END_STATUSES.some(isStatusAutomated)) return
    const processed = actor.getFlag(MODULE_ID, 'processedTurns') ?? []
    if (
      key &&
      (actor.getFlag(MODULE_ID, 'lastEndTurn') === key ||
        processed.includes(key))
    )
      return
    for (const definition of TURN_END_STATUSES)
      if (!automatic || isStatusAutomated(definition)) {
        const effect = findActorStatusEffect(actor, definition.id)
        if (!effect || effect.disabled || effect.isSuppressed) continue
        if (key && effect.getFlag(MODULE_ID, 'deferEndTurnKey') === key)
          continue
        if (key)
          await resolveMessageEffect(
            actor,
            `turn-end:${key}:${definition.id}`,
            () => resolveStatusEffect(actor, definition.id, { mode: 'turnEnd' })
          )
        else
          await resolveStatusEffect(actor, definition.id, { mode: 'turnEnd' })
      }
    if (key) {
      await actor.setFlag(
        MODULE_ID,
        'processedTurns',
        [...processed, key].slice(-200)
      )
      await actor.setFlag(MODULE_ID, 'lastEndTurn', key)
    }
  })
}

async function startTurn (actor, key) {
  assertActorOwnership(actor)
  return withActorMutation(actor, async () => {
    for (const definition of TURN_START_STATUSES) {
      if (!isStatusAutomated(definition)) continue
      const effect = findActorStatusEffect(actor, definition.id)
      if (!effect || effect.disabled || effect.isSuppressed) continue
      await resolveMessageEffect(
        actor,
        `turn-start:${key}:${definition.id}`,
        () =>
          writeStatusCount(
            actor,
            definition.id,
            resolve(definition.id, getActorStatusCount(actor, definition.id))
              .next
          )
      )
    }
  })
}

export const statusEngine = {
  getCount: getActorStatusCount,
  planConversion: (actor, config, rollData) => {
    assertActorOwnership(actor)
    for (const id of [...conversionSources(config), config.destination]) {
      const effect = findActorStatusEffect(actor, id)
      if (effect?.disabled || effect?.isSuppressed)
        throw new Error(
          'Enable the source and destination effects before converting their counts.'
        )
    }
    return planConversion(
      Object.fromEntries(
        Object.keys(CONDITIONS).map(id => [id, getActorStatusCount(actor, id)])
      ),
      config,
      rollData
    )
  },
  convert: (
    actor,
    config,
    { message, key, rollData = {}, preparedPlan } = {}
  ) =>
    withActorMutation(actor, async () => {
      assertActorOwnership(actor)
      if (!message || !key)
        throw new Error(
          'A conversion requires a recorded activity or confirmation.'
        )
      return resolveMessageEffect(
        message,
        key,
        async ({ workflowPlan: plan }) => {
          for (const [id, count] of Object.entries(plan.after))
            if (plan.before[id] !== count)
              await writeStatusCount(actor, id, count, { preserveState: true })
          if (plan.gained)
            await reportStatusApplication(
              actor,
              plan.destination,
              plan.gained,
              plan.after[plan.destination],
              { message }
            )
          return plan
        },
        {
          prepare: async () => {
            for (const id of [
              ...conversionSources(config),
              config.destination
            ]) {
              const effect = findActorStatusEffect(actor, id)
              if (effect?.disabled || effect?.isSuppressed)
                throw new Error(
                  'Enable the source and destination effects before converting their counts.'
                )
            }
            if (preparedPlan) {
              const ids = new Set([
                ...conversionSources(config),
                config.destination
              ])
              for (const [id, before] of Object.entries(preparedPlan.before)) {
                if (
                  !ids.has(id) ||
                  Number(getActorStatusCount(actor, id)) !== before
                )
                  throw new Error(
                    'Status counts changed while preparing conversion. Check them before retrying.'
                  )
                integer(preparedPlan.after[id])
              }
            }
            return {
              workflowPlan:
                preparedPlan ??
                (await statusEngine.planConversion(actor, config, rollData))
            }
          }
        }
      )
    }),
  burst: (actor, { automatic = false } = {}) =>
    withActorMutation(actor, async () => {
      assertActorOwnership(actor)
      const snapshots = STATUS_DEFINITIONS.filter(
        def => def.tremorFamily && (!automatic || isStatusAutomated(def))
      )
        .map(def => ({
          def,
          effect: findActorStatusEffect(actor, def.id),
          count: getActorStatusCount(actor, def.id)
        }))
        .filter(
          ({ effect, count }) =>
            count > 0 && effect && !effect.disabled && !effect.isSuppressed
        )
      for (const { def, count } of snapshots) {
        const result = resolve(def.id, count)
        if (result.formula) await rollEffectDamage(actor, def.id, result)
        await writeStatusCount(actor, def.id, result.next)
      }
    }),
  clearByRule: (actor, rule) =>
    withActorMutation(actor, async () => {
      assertActorOwnership(actor)
      for (const def of STATUS_DEFINITIONS) {
        const effect = findActorStatusEffect(actor, def.id)
        if (
          !def[rule] ||
          !effect ||
          effect.disabled ||
          effect.isSuppressed ||
          !isStatusAutomated(def)
        )
          continue
        if (
          rule === 'clearOnRestOutsideCombat' &&
          !effect.getFlag(MODULE_ID, 'gainedOutsideCombat')
        )
          continue
        await writeStatusCount(actor, def.id, 0)
      }
    }),
  handleHealing: actor =>
    withActorMutation(actor, async () => {
      assertActorOwnership(actor)
      const hp = actor.system?.attributes?.hp
      for (const def of STATUS_DEFINITIONS) {
        const effect = findActorStatusEffect(actor, def.id)
        if (
          !def.healingReduction ||
          !effect ||
          effect.disabled ||
          effect.isSuppressed ||
          !isStatusAutomated(def)
        )
          continue
        const full =
          def.clearOnFullHealing && Number(hp?.value) >= Number(hp?.max)
        await writeStatusCount(
          actor,
          def.id,
          full
            ? 0
            : Math.max(
                0,
                getActorStatusCount(actor, def.id) - def.healingReduction
              ),
          { preserveState: true }
        )
      }
    }),
  clearAll: actor =>
    withActorMutation(actor, async () => {
      assertActorOwnership(actor)
      const ids = actor.effects
        .filter(effect =>
          Object.hasOwn(CONDITIONS, effect.getFlag(MODULE_ID, 'condition'))
        )
        .map(effect => effect.id)
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids)
    }),
  addCount: (actor, id, change, options) =>
    withActorMutation(actor, () => addStatusCount(actor, id, change, options)),
  isActive: (actor, id) => {
    const effect = findActorStatusEffect(actor, id)
    return Boolean(effect && !effect.disabled && !effect.isSuppressed)
  },
  setActive: (actor, id, active, options) =>
    withActorMutation(actor, async () => {
      if (getStatus(id).counted !== false || typeof active !== 'boolean')
        throw new Error('Use an on/off status and a boolean state.')
      const before = getActorStatusCount(actor, id)
      await writeStatusCount(actor, id, Number(active))
      if (active && !before)
        await reportStatusApplication(actor, id, 1, 1, options)
    }),
  applyTremorSplit: (actor, count, allocation, message) =>
    withActorMutation(actor, async () => {
      assertActorOwnership(actor)
      return resolveMessageEffect(
        message,
        'allocate-tremor',
        async ({ workflowPlan: plan }) => {
          for (const [id, total] of Object.entries(plan.after)) {
            const added = total - plan.before[id]
            if (!added) continue
            await writeStatusCount(actor, id, total, { preserveState: true })
            await reportStatusApplication(actor, id, added, total, { message })
          }
        },
        {
          prepare: async () => {
            integer(count)
            const split = message.getFlag(MODULE_ID, 'tremorSplit')
            if (
              !split ||
              split.actorUuid !== actor.uuid ||
              split.count !== count
            )
              throw new Error(
                'The sum of the split Tremor does not match applied Tremor.'
              )
            const amounts = getTremorAllocationCounts(split, allocation)
            const before = {},
              after = {}
            for (const [id, amount] of Object.entries(amounts)) {
              before[id] = Number(getActorStatusCount(actor, id))
              after[id] = integer(before[id] + amount)
            }
            return { workflowPlan: { before, after } }
          }
        }
      )
    }),
  setCount: (actor, id, count, options) =>
    withActorMutation(actor, async () => {
      const before = getActorStatusCount(actor, id)
      await writeStatusCount(actor, id, count)
      if (count > before)
        await reportStatusApplication(actor, id, count - before, count, options)
    }),
  trigger: async (actor, id, options) => {
    const pendingGrants = await withActorMutation(actor, () =>
      resolveStatusEffect(actor, id, options)
    )
    for (const grant of pendingGrants ?? [])
      await statusEngine.addCount(grant.recipient, grant.condition, grant.count)
  },
  endTurn,
  startTurn
}

statusEngine.statuses = Object.freeze(
  Object.fromEntries(
    STATUS_DEFINITIONS.map(definition => [
      definition.id,
      Object.freeze({
        definition,
        isActive: actor => statusEngine.isActive(actor, definition.id),
        ...(definition.counted === false
          ? {
              setActive: (actor, active, options) =>
                statusEngine.setActive(actor, definition.id, active, options)
            }
          : {}),
        getCount: actor => statusEngine.getCount(actor, definition.id),
        addCount: (actor, count, options) =>
          statusEngine.addCount(actor, definition.id, count, options),
        setCount: (actor, count, options) =>
          statusEngine.setCount(actor, definition.id, count, options),
        ...(definition.resolve
          ? {
              trigger: (actor, options) =>
                statusEngine.trigger(actor, definition.id, options)
            }
          : {})
      })
    ])
  )
)
