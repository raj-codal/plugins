// @vitest-environment jsdom
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {ToastProvider} from '@sanity/ui/toast'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {Activity} from 'react'
import type {SanityDocument} from 'sanity'
import {describe, expect, test, vi} from 'vitest'

import {Iframe} from './Iframe'

vi.mock('sanity', () => ({
  useActiveWorkspace: () => ({activeWorkspace: {basePath: '/'}}),
  useClient: () => ({}),
  useCurrentUser: () => null,
  usePerspective: () => ({perspectiveStack: [], selectedPerspectiveName: undefined}),
}))

// jsdom has no matchMedia; @sanity/ui reads the reduced-motion preference through it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({matches: false, addEventListener() {}, removeEventListener() {}}),
})

const theme = buildTheme()
const doc = {_id: 'doc', _type: 'page', _rev: 'r', _createdAt: '', _updatedAt: ''} as SanityDocument
const document = {displayed: doc, draft: null, published: doc}

describe('Iframe', () => {
  test('keeps a loaded preview visible when an Activity boundary shows it again', async () => {
    const tree = (mode: 'visible' | 'hidden') => (
      <ThemeProvider theme={theme}>
        <ToastProvider>
          <Activity mode={mode}>
            <Iframe document={document} options={{url: 'https://example.com'}} />
          </Activity>
        </ToastProvider>
      </ThemeProvider>
    )
    const {rerender} = render(tree('visible'))

    const iframe = await screen.findByTitle('preview')
    fireEvent.load(iframe)
    await vi.waitFor(
      () => {
        expect(iframe.style.opacity).toBe('1')
      },
      {timeout: 3000},
    )

    rerender(tree('hidden'))
    rerender(tree('visible'))
    // Motion applies its remount values on the next frame
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })
    })

    expect(iframe.style.opacity).toBe('1')
  })
})
