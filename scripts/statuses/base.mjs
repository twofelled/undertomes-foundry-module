export function integer (value, min = 0, max = 9999) {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error(`Enter an integer from ${min} to ${max}.`)
  return n
}

export function defineStatus (definition) {
  if (!/^[a-z][a-z0-9-]*$/.test(definition.id) || !definition.name)
    throw new Error('A status needs a stable lowercase ID and a name.')
  return Object.freeze({
    icon: `modules/undertomes-limbus/icons/${definition.id}.png`,
    recipient: 'self',
    counted: true,
    endTurn: false,
    effectKeys: [],
    effectChanges: () => [],
    events: {},
    fields: () => [],
    facts: () => [],
    preview: () => 'Resolves condition and updates its count.',
    ...definition
  })
}
