import { MODULE_ID, isDowned, escapeHTML as escape } from '../core/runtime.mjs'

export const BLEED_CONDITIONS = Object.freeze(['bleed', 'heavy-bleed'])
export const findBleedingEffect = (actor, condition) =>
  actor?.effects.find(
    effect =>
      (condition
        ? effect.getFlag(MODULE_ID, 'condition') === condition
        : BLEED_CONDITIONS.includes(effect.getFlag(MODULE_ID, 'condition'))) &&
      Number(effect.getFlag(MODULE_ID, 'count')) > 0 &&
      !effect.disabled &&
      !effect.isSuppressed
  )
export const getBleedTreatmentDC = (condition, count) =>
  (condition === 'heavy-bleed' ? 15 : 10) + count

const pendingTreatmentActorUuids = new Set()

export async function treatBleed (target, { healer, condition } = {}) {
  if (condition && !BLEED_CONDITIONS.includes(condition))
    throw new Error('Choose Bleed or Heavy Bleed to treat.')
  const api = game.modules.get(MODULE_ID).api
  const inReach = actor =>
    actor?.uuid === target?.uuid || api.canTreatBleed?.(actor, target)
  if (!target?.isOwner && !(healer?.isOwner && inReach(healer)))
    throw new Error('Choose a bleeding creature within reach.')
  if (!target.isOwner && !game.users.activeGM)
    throw new Error("A GM must be connected to clear this creature's Bleed.")
  if (pendingTreatmentActorUuids.has(target.uuid))
    throw new Error('A Bleed treatment check is already in progress.')
  pendingTreatmentActorUuids.add(target.uuid)
  try {
    if (!condition) {
      const available = BLEED_CONDITIONS.filter(id =>
        findBleedingEffect(target, id)
      )
      if (available.length > 1) {
        const content = document.createElement('div')
        const label = document.createElement('label')
        label.textContent = 'Condition to treat'
        const select = document.createElement('select')
        select.name = 'condition'
        for (const id of available) {
          const count = Number(
            findBleedingEffect(target, id).getFlag(MODULE_ID, 'count')
          )
          select.add(
            new Option(
              `${
                id === 'bleed' ? 'Bleed' : 'Heavy Bleed'
              } (DC ${getBleedTreatmentDC(id, count)})`,
              id
            )
          )
        }
        label.append(select)
        content.append(label)
        const choice = await foundry.applications.api.DialogV2.input({
          window: { title: 'Treat Bleed' },
          content,
          ok: { label: 'Continue' }
        })
        if (!choice) return
        if (!available.includes(choice.condition))
          throw new Error('Choose the condition to treat.')
        condition = choice.condition
      } else condition = available[0] ?? 'bleed'
    }
    const conditionName = condition === 'heavy-bleed' ? 'Heavy Bleed' : 'Bleed'
    const effect = findBleedingEffect(target, condition)
    const count = Number(effect?.getFlag(MODULE_ID, 'count') ?? 0)
    if (!count) return
    const dc = getBleedTreatmentDC(condition, count)
    if (!healer) {
      const candidates = [
        ...(globalThis.canvas?.tokens?.controlled ?? []).map(
          token => token.actor
        ),
        game.user.character,
        target,
        ...(globalThis.canvas?.tokens?.placeables ?? []).map(
          token => token.actor
        )
      ].filter(
        actor =>
          actor?.isOwner &&
          !isDowned(actor) &&
          typeof actor.rollSkill === 'function' &&
          inReach(actor)
      )
      const actors = new Map(candidates.map(actor => [actor.uuid, actor]))
      if (!actors.size)
        throw new Error(
          'Choose a conscious creature you can control to make the Medicine check.'
        )
      const content = document.createElement('div')
      const label = document.createElement('label')
      label.textContent = 'Treating creature'
      const select = document.createElement('select')
      select.name = 'healer'
      for (const actor of actors.values())
        select.add(new Option(actor.name, actor.uuid))
      const hint = document.createElement('p')
      hint.textContent = `Action: Wisdom (Medicine), DC ${dc}. Success removes all ${conditionName} from ${target.name}.`
      content.append(label, select, hint)
      const values = await foundry.applications.api.DialogV2.input({
        window: { title: 'Treat Bleed' },
        content,
        ok: { label: 'Roll Medicine' }
      })
      if (!values) return
      healer = actors.get(values.healer)
    }
    if (
      !healer?.isOwner ||
      isDowned(healer) ||
      typeof healer.rollSkill !== 'function'
    )
      throw new Error(
        'Choose a conscious creature you can control to make the Medicine check.'
      )
    if (!inReach(healer))
      throw new Error('The treating creature is no longer within reach.')
    if (
      findBleedingEffect(target, condition) !== effect ||
      Number(effect.getFlag(MODULE_ID, 'count')) !== count
    )
      throw new Error('Bleed changed.')
    const attemptId = foundry.utils.randomID()
    const rolls = await healer.rollSkill(
      { skill: 'med', ability: 'wis', target: dc },
      {},
      {
        data: {
          flavor: `Treat Bleed (Action): ${escape(target.name)} · DC ${dc}`,
          flags: {
            [MODULE_ID]: {
              bleedTreatment: {
                targetUuid: target.uuid,
                healerUuid: healer.uuid,
                effectUuid: effect.uuid,
                count,
                condition,
                dc,
                attemptId
              }
            }
          }
        }
      }
    )
    if (!rolls?.length) return
    if (rolls.length !== 1 || !Number.isFinite(rolls[0].total))
      throw new Error('Use one Medicine check to resolve treatment.')
    if (
      findBleedingEffect(target, condition) !== effect ||
      Number(effect.getFlag(MODULE_ID, 'count')) !== count
    )
      throw new Error('Bleed changed during the check.')
    for (const bleeding of BLEED_CONDITIONS) {
      const ownEffect = findBleedingEffect(healer, bleeding)
      const setting = bleeding === 'bleed' ? 'autoBleed' : 'autoHeavyBleed'
      if (game.settings.get(MODULE_ID, setting) !== false && ownEffect)
        await api.trigger(healer, bleeding)
    }
    if (
      healer.uuid !== target.uuid &&
      (findBleedingEffect(target, condition) !== effect ||
        Number(effect.getFlag(MODULE_ID, 'count')) !== count)
    )
      throw new Error('Bleed changed during the check.')
    const interrupted = isDowned(healer)
    if (!inReach(healer))
      throw new Error('The treating creature is no longer within reach.')
    const success = !interrupted && rolls[0].total >= dc
    if (success) {
      if (target.isOwner) await api.setCount(target, condition, 0)
      else {
        const check = game.messages.contents.find(
          message =>
            message.getFlag(MODULE_ID, 'bleedTreatment')?.attemptId ===
            attemptId
        )
        if (!check)
          throw new Error(
            'Unexpected Error.'
          )
        await api.requestBleedTreatmentClear({
          targetUuid: target.uuid,
          healerUuid: healer.uuid,
          checkUuid: check.uuid
        })
      }
    }
    const message = {
      speaker: ChatMessage.getSpeaker({ actor: healer }),
      content: `<p><strong>Treat ${conditionName}</strong>: ${escape(
        healer.name
      )} treats ${escape(target.name)}. Medicine ${
        rolls[0].total
      } vs DC ${dc}. <strong>${
        interrupted
          ? `Treatment interrupted; ${conditionName} remains.`
          : success
          ? `${conditionName} cleared.`
          : `${conditionName} remains.`
      }</strong></p>`,
      flags: {
        [MODULE_ID]: {
          bleedTreatment: { targetUuid: target.uuid, dc, success }
        }
      }
    }
    ChatMessage.applyRollMode?.(message, game.settings.get('core', 'rollMode'))
    await ChatMessage.create(message)
    return { success, dc, total: rolls[0].total }
  } finally {
    pendingTreatmentActorUuids.delete(target.uuid)
  }
}
