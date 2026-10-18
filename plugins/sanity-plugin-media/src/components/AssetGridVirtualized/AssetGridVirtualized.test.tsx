import {cleanup, screen} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'

import {renderWithProviders} from '../../__tests__/fixtures/renderWithProviders'
import GlobalStyle from '../../styled/GlobalStyles'
import type {CardFolderData} from '../../types'
import AssetGridVirtualized from './index'

function folders(count: number): CardFolderData[] {
  return Array.from({length: count}, (_, index) => ({
    folderId: `folder-${index}`,
    id: `folder-${index}`,
    name: `Folder ${index}`,
    path: `folder-${index}`,
    totalCount: 1,
    type: 'folder',
  }))
}

describe('AssetGridVirtualized scroll anchoring', () => {
  afterEach(() => {
    cleanup()
  })

  it('opts the asset grid scroller out of browser scroll anchoring', () => {
    // VirtuosoGrid keeps earlier rows as paddingTop on the list and leaves
    // overflow-anchor at auto. After a scroll, anchoring and that padding
    // update can chase each other: reporters saw scrollTop alternate by
    // exactly two card rows (2 * 220px) while scrollHeight stayed put.
    renderWithProviders(
      <>
        <GlobalStyle />
        <div style={{height: 700, width: 1100}}>
          <AssetGridVirtualized items={folders(80)} />
        </div>
      </>,
    )

    const scroller = document.querySelector('[data-testid="virtuoso-scroller"]')
    expect(scroller).toBeInstanceOf(HTMLElement)
    expect(scroller).toHaveClass('media__custom-scrollbar')
    expect(getComputedStyle(scroller as HTMLElement).overflowAnchor).toBe('none')
    expect(screen.getByText('Folder 0')).toBeInTheDocument()
  })
})
