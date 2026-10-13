interface Watch {
  element: Element
  callback: () => void
}

const watches = new Set<Watch>()
let observer: MutationObserver | null = null

function check() {
  for (const watch of watches) {
    if (!watch.element.isConnected) {
      watches.delete(watch)
      watch.callback()
    }
  }
  if (watches.size === 0) {
    observer?.disconnect()
    observer = null
  }
}

/**
 * Calls `callback` once `element` has been removed from the document.
 *
 * The Studio keeps recently used tools mounted behind an `<Activity>` boundary. React cleans up
 * their effects when a tool is hidden and does not run those cleanups again if the hidden tool
 * is unmounted later, so a resource that is meant to outlive the hidden period has to learn
 * about the unmount from the DOM instead. Returns a function that stops watching.
 */
export function onRemovedFromDocument(element: Element, callback: () => void): () => void {
  const watch = {element, callback}
  watches.add(watch)
  if (!observer) {
    observer = new MutationObserver(check)
    observer.observe(element.ownerDocument, {childList: true, subtree: true})
  }
  return () => {
    watches.delete(watch)
    if (watches.size === 0) {
      observer?.disconnect()
      observer = null
    }
  }
}
