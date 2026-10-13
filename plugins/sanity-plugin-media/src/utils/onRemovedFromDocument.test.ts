// @vitest-environment jsdom
import {describe, expect, it, vi} from 'vitest'

import {onRemovedFromDocument} from './onRemovedFromDocument'

const flushMutations = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe('onRemovedFromDocument', () => {
  it('calls back once the element leaves the document', async () => {
    const element = document.body.appendChild(document.createElement('span'))
    const callback = vi.fn()
    onRemovedFromDocument(element, callback)

    document.body.appendChild(document.createElement('div'))
    await flushMutations()
    expect(callback).not.toHaveBeenCalled()

    element.remove()
    await flushMutations()
    expect(callback).toHaveBeenCalledTimes(1)

    document.body.appendChild(element)
    element.remove()
    await flushMutations()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('calls every callback registered for the same element', async () => {
    const element = document.body.appendChild(document.createElement('span'))
    const first = vi.fn()
    const second = vi.fn()
    onRemovedFromDocument(element, first)
    onRemovedFromDocument(element, second)

    element.remove()
    await flushMutations()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops watching', async () => {
    const element = document.body.appendChild(document.createElement('span'))
    const callback = vi.fn()
    const stop = onRemovedFromDocument(element, callback)

    stop()
    element.remove()
    await flushMutations()
    expect(callback).not.toHaveBeenCalled()
  })
})
