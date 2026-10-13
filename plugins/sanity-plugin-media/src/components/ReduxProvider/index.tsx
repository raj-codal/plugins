import {configureStore, type Store, type UnknownAction} from '@reduxjs/toolkit'
import type {SanityClient} from '@sanity/client'
import {type ReactNode, useInsertionEffect, useState} from 'react'
import {Provider} from 'react-redux'
import {createEpicMiddleware, ofType} from 'redux-observable'
import {takeUntil} from 'rxjs'
import type {AssetSourceComponentProps, SanityDocument} from 'sanity'

import {rootEpic, rootReducer} from '../../modules'
import {initialState as assetsInitialState} from '../../modules/assets'
import type {RootReducerState} from '../../modules/types'
import getDocumentAssetIds from '../../utils/getDocumentAssetIds'
import {isSupportedAssetType} from '../../utils/isSupportedAssetType'

/** Stops the root epic when the Media browser unmounts (tool close / dialog dismiss / tests). */
const EPIC_END_TYPE = 'media/epicEnd' as const

type Props = {
  assetType?: AssetSourceComponentProps['assetType']
  children?: ReactNode
  client: SanityClient
  document?: SanityDocument
  excludeTagSlugs?: string[]
  selectedAssets?: AssetSourceComponentProps['selectedAssets']
  showMediaLibraryAssets?: boolean
}

type CreatedStore = {
  endEpics: () => void
  store: Store
}

function createReduxStore(props: Props): CreatedStore {
  const epicMiddleware = createEpicMiddleware<UnknownAction, UnknownAction, RootReducerState>({
    dependencies: {
      client: props.client,
    },
  })

  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        // TODO: remove once we're no longer storing non-serializable data in the store
        serializableCheck: false,
        thunk: false,
      }).prepend(epicMiddleware),
    devTools: true,
    preloadedState: {
      assets: {
        ...assetsInitialState,
        assetTypes: isSupportedAssetType(props?.assetType) ? [props.assetType] : ['file', 'image'],
        excludeTagSlugs: props.excludeTagSlugs?.length ? [...props.excludeTagSlugs] : [],
        showMediaLibraryAssets: props.showMediaLibraryAssets ?? true,
      },
      debug: {
        badConnection: false,
        enabled: false,
      },
      dialog: {items: []},
      folders: {
        byId: {},
        childrenByParentId: {},
        rootIds: [],
        exactCountByFolderId: {},
        unfiledCount: 0,
        currentFolderId: null,
        currentFolderUnfiled: false,
        panelVisible: false,
        fetching: false,
        fetchCount: -1,
        creating: false,
        renaming: false,
      },
      notifications: {items: []},
      search: {facets: [], query: ''},
      selected: {
        assets: props.selectedAssets || [],
        document: props.document,
        documentAssetIds: props.document ? getDocumentAssetIds(props.document) : [],
      },
      tags: {
        allIds: [],
        byIds: {},
        creating: false,
        fetchCount: -1,
        fetching: false,
        panelVisible: true,
      },
      uploads: {
        allIds: [],
        byIds: {},
      },
    },
  })

  // Scope the root epic so closing the browser tears down debounced fetches / listeners
  // instead of dispatching into an unmounted react-redux tree (Vitest jsdom teardown).
  // The epics start eagerly: child effects dispatch the initial fetches before this
  // provider's own effect would run, so starting them there would drop those actions.
  epicMiddleware.run((action$, state$, dependencies) =>
    rootEpic(action$, state$, dependencies).pipe(takeUntil(action$.pipe(ofType(EPIC_END_TYPE)))),
  )

  return {
    store,
    endEpics: () => store.dispatch({type: EPIC_END_TYPE}),
  }
}

function ReduxProvider({children, ...props}: Props) {
  const [{endEpics, store}] = useState(() => createReduxStore(props))

  /*
   * Layout and passive effects are also cleaned up when the Studio hides a recently used tool
   * behind an `<Activity>` boundary (`beta.reactActivityMode`) and when React strict mode
   * simulates an unmount, but the store in `useState` lives on in both cases. Ending the epics
   * then left the remount dispatching fetches that nothing handled, so the tool sat on
   * "LOADING…" forever. Insertion effects track the DOM instead of visibility: React keeps
   * them mounted while the tool is hidden — so a hidden browser keeps the epics, and any
   * upload in flight, running — and still cleans them up when the tree is deleted, hidden or
   * not, which is when the epics should end.
   */
  useInsertionEffect(() => endEpics, [endEpics])

  return <Provider store={store}>{children}</Provider>
}

export default ReduxProvider
