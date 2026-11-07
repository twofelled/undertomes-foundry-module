export function tremorBurstEvents () {
  return {
    async usage ({ burst, activity, message, actorFromUuid, resolveBurst }) {
      if (burst !== 'use' || ['attack', 'save'].includes(activity.type)) return
      for (const uuid of new Set(
        (message.system.targets ?? []).map(t => t.actor).filter(Boolean)
      ))
        await resolveBurst(await actorFromUuid(uuid))
    },
    async hit ({ burst, target, resolveBurst }) {
      if (burst === 'hit') await resolveBurst(target)
    },
    async save ({ burst, activity, message, receipt, resolveBurst }) {
      if (
        burst !== 'saveFail' ||
        activity.type !== 'save' ||
        message.rolls?.length !== 1 ||
        message.system.forceSuccess ||
        message.system.resisted ||
        ['death', 'concentration'].includes(message.system.type) ||
        message.rolls[0].isFailure !== true
      )
        return
      await resolveBurst(message.getAssociatedActor?.(), receipt)
    }
  }
}
