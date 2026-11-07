import {
  MODULE_ID,
  escapeHTML as escape,
  isPrimaryGM
} from '../core/runtime.mjs'
import { CONDITIONS, STATUS_DESCRIPTIONS } from '../statuses/index.mjs'
import {
  getManualResolutionState,
  resolveManualStatusApplications
} from '../workflows/manual-resolution.mjs'
import { ensureRecordedDamageTarget } from '../workflows/combat-effects.mjs'

const resolutionMessagesByElement = new WeakMap()
const configuredDamageTargetLists = new WeakSet()
let chatObserver = null

function watchChatChanges () {
  if (chatObserver) return
  chatObserver = new MutationObserver(mutations => {
    const changed = new Set()
    for (const mutation of mutations) {
      const card = mutation.target.closest?.('.ul-resolution-message')
      if (card) {
        changed.add(card)
        continue
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue
        if (resolutionMessagesByElement.has(node)) changed.add(node)
        for (const html of node.querySelectorAll('.ul-resolution-message')) {
          if (resolutionMessagesByElement.has(html)) changed.add(html)
        }
      }
    }
    for (const html of changed) {
      const message = resolutionMessagesByElement.get(html)
      if (html.isConnected && message) updateResolution(message, html)
    }
  })
  chatObserver.observe(document.body, { childList: true, subtree: true })
  globalThis.addEventListener?.('pagehide', stopChatObserver, { once: true })
}

export function stopChatObserver () {
  chatObserver?.disconnect()
  chatObserver = null
}

const textMode = mode => (mode === 'none' ? 'none' : 'full')

export function renderResolutionCardHTML (
  condition,
  { type, label, mode = 'full' } = {}
) {
  const def = CONDITIONS[condition]
  if (!def) return ''
  mode = textMode(mode)
  const full = (STATUS_DESCRIPTIONS[condition] ?? [])
    .map(p => ` <p>${escape(p)}</p> `)
    .join('')
  let description = ''
  if (mode !== 'none') {
    description = `
      <details class="ul-resolution-rules" open>
        <summary>Description</summary><div class="ul-resolution-full">${full}</div>
      </details>`
  }
  return `
    <section class="ul-resolution-card" data-text-mode="${mode}">
      <header class="ul-resolution-heading">
        <img src="${escape(def.icon)}" alt="" />
        <strong>${def.name}</strong>
        ${type ? `<span>${escape(label || type)}</span>` : ''}
      </header>
      ${description}
      <a
        class="ul-resolution-credit"
        href="https://theundertomes.crd.co/#lcc"
        target="_blank"
        rel="noopener"
      >
        The Undertomes
      </a>
    </section>
  `
}

function updateResolution (message, html) {
  const condition = message.getFlag(MODULE_ID, 'condition')
  const content = html.querySelector('.message-content')
  if (!content) return
  if (
    message.getFlag(MODULE_ID, 'targetUuid') &&
    message.system?.targets?.length
  ) {
    for (const targets of html.querySelectorAll('recorded-targets')) {
      if (!targets.chatMessage || configuredDamageTargetLists.has(targets))
        continue
      configuredDamageTargetLists.add(targets)
      targets.targetingMode = 'targeted'
    }
  }
  html.classList.add('ul-resolution-message')
  html.classList.toggle(
    'ul-resolution-auto',
    Boolean(message.getFlag(MODULE_ID, 'automatic'))
  )
  html.querySelectorAll('.flavor-text').forEach(element => element.remove())
  const mode = textMode(game.settings.get(MODULE_ID, 'resolutionText'))
  const type = message.getFlag(MODULE_ID, 'type')
  const signature = JSON.stringify([condition, mode, type])
  const existing = content.querySelector('.ul-resolution-card')
  if (existing?.dataset.signature === signature) return
  existing?.remove()
  const label = type
    ? game.i18n.localize(CONFIG.DND5E.damageTypes[type]?.label ?? type)
    : null
  content.insertAdjacentHTML(
    'afterbegin',
    renderResolutionCardHTML(condition, { type, label, mode })
  )
  content.querySelector('.ul-resolution-card').dataset.signature = signature
}

export function decorateResolution (message, html) {
  if (message.isContentVisible === false) return
  if (!CONDITIONS[message.getFlag(MODULE_ID, 'condition')]) return
  resolutionMessagesByElement.set(html, message)
  updateResolution(message, html)
  watchChatChanges()
}

export function renderManualResolutionPrompts (message, html) {
  if (message.isContentVisible === false) return
  if (message.getFlag(MODULE_ID, 'manualStatusPromptMessage')) return
  const prompts = message.getFlag(MODULE_ID, 'manualStatusPrompts')
  if (!prompts?.length) return
  html.querySelector('.ul-manual-status-prompts')?.remove()
  const group = document.createElement('div')
  group.className = 'ul-manual-status-prompts'
  for (const request of prompts) {
    const definition = CONDITIONS[request.condition]
    if (!definition) continue
    const row = document.createElement('section')
    row.className = 'ul-status-application ul-manual-status-application'
    const header = document.createElement('header')
    const icon = document.createElement('img')
    icon.src = definition.icon
    icon.alt = ''
    icon.width = icon.height = 28
    const title = document.createElement('strong')
    title.textContent = definition.name
    header.append(icon, title)
    row.append(header)
    const text = document.createElement('p')
    text.textContent =
      request.kind === 'conversion'
        ? `${request.actorName}: convert ${(request.conversion.sources ?? [])
            .map(id => CONDITIONS[id]?.name ?? id)
            .join(' + ')} into ${
            definition.name
          }. Was the special requirement met?`
        : definition.counted === false
        ? `${request.actorName}: activate ${definition.name}. Was the special requirement met?`
        : `${request.actorName}: ${request.formula} ${definition.name}. Was the special requirement met?`
    row.append(text)
    if (request.description) {
      const requirement = document.createElement('p')
      requirement.className = 'ul-status-requirement-text'
      requirement.textContent = request.description
      row.append(requirement)
    }
    const workflow = getManualResolutionState(message, request.key)
    const resolved = ['applied', 'skipped', 'uncertain'].includes(
      workflow.state
    )
    const busy = ['preparing', 'applying'].includes(workflow.state)
    if (workflow.state === 'failed' || workflow.state === 'uncertain' || busy) {
      const status = document.createElement('p')
      status.textContent =
        workflow.state === 'failed'
          ? `Could not prepare application: ${
              workflow.error ?? 'Unknown error'
            }. You can retry.`
          : workflow.state === 'uncertain'
          ? 'Application could not be determined. Please check the current count before adjusting it manually.'
          : 'Processing...'
      row.append(status)
    }
    const decision = (
      message.getFlag(MODULE_ID, 'manualStatusDecisions') ?? []
    ).find(entry => entry.key === request.key)
    const buttons = document.createElement('div')
    buttons.className = 'ul-manual-status-buttons'
    for (const [choice, label] of [
      ['confirm', 'Yes, apply'],
      ['skip', 'No, skip']
    ]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent =
        resolved &&
        workflow.state !== 'uncertain' &&
        decision?.choice === choice
          ? choice === 'confirm'
            ? 'Confirmed'
            : 'Skipped'
          : choice === 'confirm' && workflow.state === 'failed'
          ? 'Retry application'
          : label
      button.disabled =
        resolved ||
        busy ||
        (Boolean(decision) && workflow.state !== 'failed') ||
        !(isPrimaryGM() || message.isOwner)
      button.addEventListener('click', async () => {
        for (const control of row.querySelectorAll('button'))
          control.disabled = true
        try {
          if (!isPrimaryGM() && !game.users.activeGM)
            throw new Error('An active GM is needed to apply status count.')
          const previous =
            message.getFlag(MODULE_ID, 'manualStatusDecisions') ?? []
          if (
            !previous.some(entry => entry.key === request.key) ||
            workflow.state === 'failed'
          )
            await message.setFlag(MODULE_ID, 'manualStatusDecisions', [
              ...previous.filter(entry => entry.key !== request.key),
              {
                key: request.key,
                choice,
                attempt: (decision?.attempt ?? (decision ? 1 : 0)) + 1
              }
            ])
          await resolveManualStatusApplications(message)
        } catch (error) {
          ui.notifications.error(error.message)
          for (const control of row.querySelectorAll('button'))
            control.disabled = false
        }
      })
      buttons.append(button)
    }
    row.append(buttons)
    const link = document.createElement('a')
    link.href = 'https://theundertomes.crd.co/#lcc'
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = 'The Undertomes'
    row.append(link)
    group.append(row)
  }
  ;(html.querySelector('.message-content') ?? html).append(group)
}

export async function reportStatusApplication (
  actor,
  condition,
  count,
  total,
  { message } = {}
) {
  if (game.settings.get(MODULE_ID, 'reportStatusApplications') === false) return
  const definition = CONDITIONS[condition]
  const content = `<section class="ul-status-application">
    <header><img src="${escape(
      definition.icon
    )}" alt="" width="28" height="28"><strong>${escape(
    definition.name
  )}</strong></header>
    ${
      definition.counted === false
        ? `<p>${escape(actor.name)} gains <strong>${escape(
            definition.name
          )}</strong>.</p>`
        : `<p>${escape(actor.name)} gains <strong>${count} ${escape(
            definition.name
          )}</strong>. Total: <strong>${total}</strong>.</p>`
    }
    <a href="https://theundertomes.crd.co/#lcc" target="_blank" rel="noopener">The Undertomes</a>
  </section>`
  try {
    return await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      ...(message
        ? {
            whisper: [...(message.whisper ?? [])],
            blind: Boolean(message.blind)
          }
        : {}),
      flags: {
        [MODULE_ID]: {
          statusApplication: {
            condition,
            ...(definition.counted === false ? {} : { count, total }),
            actorUuid: actor.uuid
          }
        }
      }
    })
  } catch (error) {
    console.error(
      MODULE_ID,
      'Status applied, but its chat message failed:',
      error
    )
    ui.notifications.error(
      'Status applied, but its chat message could not be posted.'
    )
  }
}

export function installChatCards () {
  Hooks.on('renderChatMessageHTML', (message, html) => {
    decorateResolution(message, html)
    void ensureRecordedDamageTarget(message).catch(error =>
      console.error(MODULE_ID, error)
    )
  })
}
