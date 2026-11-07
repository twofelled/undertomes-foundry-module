export function installActivityConditionsTab () {
  Hooks.on('renderApplicationV2', (app, html, context = {}) => {
    const activity = app.activity ?? app.document
    if (
      !activity?.item ||
      !activity.item.isOwner ||
      activity.item.compendium?.locked ||
      context.editable === false ||
      !app.tabGroups ||
      typeof app.changeTab !== 'function'
    )
      return
    const root = html.querySelector?.('.tabs [data-group="sheet"]')
      ? html
      : app.element
    const nav = root?.querySelector('.tabs')
    const effect = root?.querySelector('.tab[data-tab="effect"]')
    if (!nav || !effect) return
    let panel = root.querySelector('.tab[data-tab="lcConditions"]')
    if (!panel) {
      panel = document.createElement('section')
      panel.className = 'tab standard-form ul-activity-conditions-tab'
      panel.dataset.tab = 'lcConditions'
      panel.dataset.group = 'sheet'
      effect.parentElement.append(panel)
    }
    if (!nav.querySelector('[data-tab="lcConditions"]')) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'item'
      button.dataset.action = 'tab'
      button.dataset.tab = 'lcConditions'
      button.dataset.group = 'sheet'
      button.textContent = 'LC Conditions'
      nav.append(button)
    }
    for (const selector of [
      '.ul-activity-statuses',
      '.ul-activity-conversion',
      '.fell-tremor-burst',
      '.ul-charge-cost'
    ]) {
      const section = effect.querySelector(selector)
      if (!section) continue
      panel.querySelector(selector)?.remove()
      panel.append(section)
    }
    if (app.tabGroups.sheet === 'lcConditions') {
      panel.classList.add('active')
      nav.querySelector('[data-tab="lcConditions"]').classList.add('active')
    }
  })
}
