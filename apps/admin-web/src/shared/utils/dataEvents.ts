const DATA_CHANGED = 'admin:data-changed'

/** Tells other parts of the layout (e.g. sidebar counters) that an action changed the data. */
export const notifyDataChanged = () => window.dispatchEvent(new Event(DATA_CHANGED))

export function onDataChanged(listener: () => void) {
  window.addEventListener(DATA_CHANGED, listener)
  return () => window.removeEventListener(DATA_CHANGED, listener)
}
