import { installChatCards } from './ui/chat-cards.mjs'
import {
  registerModuleSettings,
  installAutomationSettings,
  migrateAutomationSettings,
  registerDamageType
} from './automation/settings.mjs'
import { MODULE_ID } from './core/runtime.mjs'
import {
  installEffectSync,
  syncExistingEffects
} from './automation/effect-sync.mjs'
import { configureTremorAbilities } from './activities/tremor-burst.mjs'
import { statusEngine } from './core/status-engine.mjs'
import {
  openStatusManager,
  installManagerAccess
} from './ui/status-manager.mjs'
import {
  installTurnAutomation,
  installMessageAutomation,
  installStatusLifecycle
} from './automation/automation-hooks.mjs'
import {
  installTokenRows,
  migrateRowOffset,
  installStatusIconFallback
} from './ui/token-status-display.mjs'
import { STATUS_DEFINITIONS } from './statuses/index.mjs'
import { installWeaponStatusDamageControl } from './activities/weapon-damage.mjs'
import { installAttackActions } from './workflows/attack-resolution.mjs'
import { installActivityStatusControls } from './activities/status-application-controls.mjs'
import { installEffectCountControl } from './ui/effect-count-control.mjs'
import { treatBleed } from './automation/bleed-treatment.mjs'
import {
  installBleedAura,
  canTreatBleed,
  requestBleedTreatmentClear
} from './automation/bleed-aura.mjs'
import { installChargeCosts } from './activities/charge-cost.mjs'
import { installActivityConversion } from './activities/status-conversion-controls.mjs'
import { installActivityConditionsTab } from './activities/conditions-tab.mjs'
import { installTremorAllocation } from './workflows/tremor-allocation.mjs'

const { endTurn, startTurn } = statusEngine
function assertActorOwnership (actor) {
  if (!actor || !actor.isOwner)
    throw new Error('Select a token whose actor you can edit.')
}
async function openSelectedTokenManager (
  actor = globalThis.canvas?.tokens?.controlled?.[0]?.actor
) {
  try {
    assertActorOwnership(actor)
    return openStatusManager(actor)
  } catch (error) {
    console.error(MODULE_ID, error)
    ui.notifications.error(error.message)
  }
}

Hooks.once('init', () => {
  installStatusIconFallback()
  installManagerAccess(openSelectedTokenManager)
  installWeaponStatusDamageControl()
  installAttackActions()
  installActivityStatusControls()
  installChargeCosts()
  installEffectCountControl()
  installBleedAura()
  for (const definition of STATUS_DEFINITIONS) definition.install?.()
  installActivityConversion()
  installActivityConditionsTab()
  installStatusLifecycle()
  installTremorAllocation()
  installTokenRows()
  installEffectSync()
  installMessageAutomation()
  installAutomationSettings()
  registerDamageType()
  installChatCards()
  registerModuleSettings(openSelectedTokenManager)
  installTurnAutomation(endTurn, startTurn)
})
Hooks.once('ready', async () => {
  if (game.settings.get(MODULE_ID, 'resolutionText') === 'short')
    await game.settings.set(MODULE_ID, 'resolutionText', 'full')
  game.modules.get(MODULE_ID).api = {
    open: openSelectedTokenManager,
    treatBleed,
    canTreatBleed,
    requestBleedTreatmentClear,
    configureTremorAbilities,
    ...statusEngine
  }
  await syncExistingEffects()
  await migrateAutomationSettings()
  await migrateRowOffset()
})
