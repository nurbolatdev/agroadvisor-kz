// Several screens read the state of the check at the same time: the entry gate, the requests tab, the profile,
// the documents screen. When one of them sends or removes a document, the others must not go on showing the
// old state, so it announces the change and they read again. The source is the announcing screen: it has
// read the state itself and does not read twice.
type Listener = (source: symbol) => void

const listeners = new Set<Listener>()

export function onVerificationChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function announceVerificationChanged(source: symbol): void {
  for (const listener of [...listeners]) listener(source)
}
