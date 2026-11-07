import { MODULE_ID, createBatchRefresh } from '../core/runtime.mjs'
import { CONDITIONS, STATUS_DEFINITIONS } from '../statuses/index.mjs'

export function rowLayout (
  widths,
  size,
  tokenWidth,
  tokenHeight,
  offset = 0,
  curved = true
) {
  if (!widths.length) return []
  const columns = 5
  const gap = 3
  const rowHeight = size + 7
  const slots = []

  for (let start = 0; start < widths.length; start += columns) {
    const rowWidths = widths.slice(start, start + columns)
    const totalWidth =
      rowWidths.reduce((sum, width) => sum + width, 0) +
      gap * (rowWidths.length - 1)
    const rowIndex = Math.floor(start / columns)
    const radius = Math.max(
      Math.max(tokenWidth, tokenHeight) / 2 + size * 0.1 + rowIndex * rowHeight,
      totalWidth / 2.6
    )
    let left = -totalWidth / 2

    for (const width of rowWidths) {
      const x = left + width / 2
      const angle = x / radius
      slots.push({
        x: tokenWidth / 2 + (curved ? Math.sin(angle) * radius : x),
        y: curved
          ? tokenHeight / 2 + Math.cos(angle) * radius - size / 2 + 10 + offset
          : tokenHeight - size * 0.6 + 15 + offset + rowIndex * rowHeight
      })
      left += width + gap
    }
  }
  return slots
}

export const FALLBACK_STATUS_ICON = 'modules/undertomes-limbus/icons/wip.png'

let installed = false
export function installStatusIconFallback () {
  if (installed) return
  installed = true
  document.addEventListener(
    'error',
    event => {
      const image = event.target
      if (image?.tagName !== 'IMG') return
      const source = image.getAttribute('src') ?? ''
      if (
        !source.includes('modules/undertomes-limbus/icons/') ||
        source.endsWith('/wip.png')
      )
        return
      image.src = FALLBACK_STATUS_ICON
    },
    true
  )
}

const texturePromisesByPath = new Map()

export function getActiveTokenStatuses (actor) {
  const counts = new Map()
  for (const effect of actor.effects) {
    const id = effect.getFlag(MODULE_ID, 'condition')
    if (
      !CONDITIONS[id] ||
      effect.disabled ||
      effect.isSuppressed ||
      counts.has(id)
    )
      continue
    counts.set(
      id,
      CONDITIONS[id].counted === false
        ? 1
        : Number(effect.getFlag(MODULE_ID, 'count') ?? 0)
    )
  }
  return STATUS_DEFINITIONS.filter(def => counts.get(def.id) > 0).map(def => ({
    ...def,
    count: counts.get(def.id)
  }))
}

export function clearRow (token) {
  const row = token._ulRow
  token._ulRow = null
  token._ulRowSignature = null
  if (row && !row.destroyed) row.destroy({ children: true })
}

async function loadStatusTexture (path) {
  if (texturePromisesByPath.has(path)) return texturePromisesByPath.get(path)
  const pending = loadTextureOrNull(path)
  texturePromisesByPath.set(path, pending)
  const texture = await pending
  if (!texture) texturePromisesByPath.delete(path)
  return texture
}

async function loadTextureOrNull (path) {
  try {
    return await foundry.canvas.loadTexture(path)
  } catch (error) {
    console.warn(MODULE_ID, 'Could not load status image:', path, error)
    return null
  }
}

function createCounterText (text, size, color = '#ffffff') {
  const label = new PIXI.Text(text, {
    fontFamily: 'Arial',
    fontSize: size,
    fontWeight: 'bold',
    fill: color,
    stroke: '#000000',
    strokeThickness: 2
  })
  label.resolution = 4
  return label
}

async function addCounter (cell, count, size, width, stillCurrent) {
  const text = String(count)
  const height = Math.min(
    size * 0.48,
    (size * 0.94 * 850) / (508 * text.length)
  )
  const digitWidth = (height * 508) / 850
  const textures = await Promise.all(
    [...text].map(digit =>
      loadStatusTexture(`modules/${MODULE_ID}/icons/digits/${digit}.png`)
    )
  )
  if (!stillCurrent()) return

  if (textures.every(Boolean)) {
    const left = width / 2 - digitWidth * text.length
    for (let index = 0; index < textures.length; index++) {
      const digit = new PIXI.Sprite(textures[index])
      digit.width = digitWidth
      digit.height = height
      digit.position.set(left + index * digitWidth, size + 4 - height)
      cell.addChild(digit)
    }
  } else {
    const label = createCounterText(text, size * 0.48)
    if (label.width > size * 0.94) {
      const scale = (size * 0.94) / label.width
      label.width *= scale
      label.height *= scale
    }
    label.anchor.set(1, 1)
    label.position.set(width / 2, size + 4)
    cell.addChild(label)
  }
}

async function addCell (row, entry, slot, width, size, path, stillCurrent) {
  const texture =
    (await loadStatusTexture(path)) ??
    (await loadStatusTexture(FALLBACK_STATUS_ICON))
  if (!stillCurrent()) return
  const cell = new PIXI.Container()
  cell.position.set(slot.x, slot.y)
  row.addChild(cell)
  if (texture) {
    const icon = new PIXI.Sprite(texture)
    icon.width = size
    icon.height = size
    icon.x = -size / 2
    cell.addChild(icon)
  } else {
    const label = createCounterText(entry.letter, size * 0.65, '#ffffff')
    label.anchor.set(0.5)
    label.position.set(0, size / 2)
    cell.addChild(label)
  }
  if (entry.counted !== false)
    await addCounter(cell, entry.count, size, width, stillCurrent)
}

export async function drawRow (token) {
  if (token.destroyed || !token.actor) return
  if (game.settings.get(MODULE_ID, 'showStatusRow') === false) {
    clearRow(token)
    return
  }
  const entries = getActiveTokenStatuses(token.actor)
  if (!entries.length) {
    clearRow(token)
    return
  }

  const curved = game.settings.get(MODULE_ID, 'limbusDisplay') !== false
  const offset = Number(game.settings.get(MODULE_ID, 'arcOffset') ?? 0)
  const signature = JSON.stringify([
    entries.map(({ id, count, icon }) => [id, count, icon]),
    token.w,
    token.h,
    offset,
    curved
  ])
  if (
    token._ulRowSignature === signature &&
    token._ulRow &&
    !token._ulRow.destroyed
  )
    return

  clearRow(token)
  const row = new PIXI.Container()
  row.eventMode = 'none'
  token._ulRow = row
  token._ulRowSignature = signature
  token.addChild(row)

  const size = Math.max(18, Math.min(32, token.w / 4))
  const widths = entries.map(() => size)
  const slots = rowLayout(widths, size, token.w, token.h, offset, curved)
  const stillCurrent = () =>
    !token.destroyed && !row.destroyed && token._ulRow === row
  try {
    await Promise.all(
      entries.map((entry, index) =>
        addCell(
          row,
          entry,
          slots[index],
          widths[index],
          size,
          entry.icon,
          stillCurrent
        )
      )
    )
  } catch (error) {
    if (stillCurrent()) clearRow(token)
    console.error(MODULE_ID, 'Could not draw statuses:', error)
  }
}

const pendingTokenRefreshes = createBatchRefresh(token => {
  void drawRow(token).catch(error =>
    console.error(MODULE_ID, 'Token statuses:', error)
  )
})
function refreshTokenStatusDisplay (token) {
  pendingTokenRefreshes.add(token)
}

function refreshAllTokenStatusDisplays () {
  for (const token of globalThis.canvas?.tokens?.placeables ?? [])
    refreshTokenStatusDisplay(token)
}

function refreshActorStatusDisplays (document) {
  const actor = document.documentName === 'Actor' ? document : document.parent
  if (!actor) return
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    if (token.actor?.uuid === actor.uuid) refreshTokenStatusDisplay(token)
  }
}

export function installTokenRows () {
  game.settings.register(MODULE_ID, 'showStatusRow', {
    name: 'Show status icons below tokens',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshAllTokenStatusDisplays
  })
  game.settings.register(MODULE_ID, 'limbusDisplay', {
    name: 'Curved status display',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshAllTokenStatusDisplays
  })
  game.settings.register(MODULE_ID, 'rowOffset', {
    scope: 'world',
    config: false,
    type: Number,
    default: 35
  })
  game.settings.register(MODULE_ID, 'arcOffset', {
    name: 'Status display vertical offset',
    scope: 'world',
    config: true,
    type: Number,
    default: 0,
    range: { min: -50, max: 100, step: 1 },
    onChange: refreshAllTokenStatusDisplays
  })
  game.settings.register(MODULE_ID, 'rowOffsetOrigin', {
    scope: 'world',
    config: false,
    type: Number,
    default: 0
  })
  Hooks.on('canvasReady', refreshAllTokenStatusDisplays)
  for (const hook of [
    'createActiveEffect',
    'updateActiveEffect',
    'deleteActiveEffect',
    'updateActor'
  ]) {
    Hooks.on(hook, refreshActorStatusDisplays)
  }
  Hooks.on('drawToken', refreshTokenStatusDisplay)
  Hooks.on('refreshToken', refreshTokenStatusDisplay)
  Hooks.on('destroyToken', clearRow)
  Hooks.on('canvasTearDown', () => {
    pendingTokenRefreshes.clear()
    texturePromisesByPath.clear()
    for (const token of globalThis.canvas?.tokens?.placeables ?? [])
      clearRow(token)
  })
}

export async function migrateRowOffset () {
  if (
    !game.user.isGM ||
    game.users.activeGM?.id !== game.user.id ||
    game.settings.get(MODULE_ID, 'rowOffsetOrigin') === 15
  )
    return
  const storage = game.settings.storage?.get('world')
  if (!storage) return
  if (storage.get(`${MODULE_ID}.arcOffset`) != null)
    await game.settings.set(
      MODULE_ID,
      'arcOffset',
      Number(game.settings.get(MODULE_ID, 'arcOffset')) - 15
    )
  await game.settings.set(MODULE_ID, 'rowOffsetOrigin', 15)
}

export function statusRowLayout (
  widths,
  { width, height, size, offset = 0, curved = true }
) {
  return rowLayout(widths, size, width, height, offset, curved).map(
    (slot, index) => ({
      x: slot.x - widths[index] / 2,
      y: slot.y
    })
  )
}
