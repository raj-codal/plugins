// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react'
import type {ObjectSchemaType} from 'sanity'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {RunInstructionProvider, useRunInstruction} from '../../assistLayout/RunInstructionProvider'
import {
  type InstructionTask,
  instructionTaskTypeName,
  instructionTypeName,
  type StudioAssistDocument,
  type StudioInstruction,
} from '../../types'
import {useInstructionToaster} from './useInstructionToaster'
import {useStudioAssistDocument} from './useStudioAssistDocument'

const push = vi.fn()

vi.mock('@sanity/ui/toast', () => ({useToast: () => ({push})}))
vi.mock('sanity', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCurrentUser: () => ({id: 'user-1'}),
}))
vi.mock('../../assistLayout/AiAssistanceConfigContext', () => ({
  useAiAssistanceConfig: () => ({config: {}}),
}))
vi.mock('../../useApiClient', () => ({
  useApiClient: () => ({}),
  useRunInstructionApi: () => ({runInstruction: async () => {}, loading: false}),
}))
vi.mock('./useStudioAssistDocument', () => ({useStudioAssistDocument: vi.fn()}))

// oxlint-disable-next-line no-unsafe-type-assertion
const schemaType = {name: 'article'} as ObjectSchemaType

const instruction: StudioInstruction = {
  _key: 'instruction-1',
  _type: instructionTypeName,
  title: 'Create title from body',
}

function assistDocument(tasks: InstructionTask[]): StudioAssistDocument {
  // oxlint-disable-next-line no-unsafe-type-assertion
  return {_id: 'sanity.assist.schemaType.article', tasks} as StudioAssistDocument
}

function endedTask(task: Partial<InstructionTask> = {}): InstructionTask {
  const now = new Date().toISOString()
  return {
    _key: 'task-1',
    _type: instructionTaskTypeName,
    path: 'title',
    started: now,
    ended: now,
    reason: 'success',
    startedByUserId: 'user-1',
    ...task,
  }
}

function setup(documentId: string) {
  vi.mocked(useStudioAssistDocument).mockReturnValue(assistDocument([]))
  const hook = renderHook(
    () => {
      useInstructionToaster(documentId, schemaType)
      return useRunInstruction()
    },
    {wrapper: RunInstructionProvider},
  )
  const endTask = (task: InstructionTask) => {
    vi.mocked(useStudioAssistDocument).mockReturnValue(assistDocument([task]))
    hook.rerender()
  }
  return {hook, endTask}
}

describe('useInstructionToaster', () => {
  beforeEach(() => {
    push.mockClear()
  })

  test('names a custom instruction task stored without title and instructionKey', () => {
    const {hook, endTask} = setup('drafts.article-1')

    act(() =>
      hook.result.current.runInstruction({
        documentId: 'drafts.article-1',
        assistDocumentId: 'sanity.assist.schemaType.article',
        path: 'title',
        instruction,
      }),
    )
    endTask(endedTask())

    expect(push).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({title: 'Success: Create title from body', status: 'success'}),
    )
  })

  test('matches a run started with the published id against the draft form value', () => {
    const {hook, endTask} = setup('drafts.article-1')

    act(() =>
      hook.result.current.runInstruction({
        documentId: 'article-1',
        assistDocumentId: 'sanity.assist.schemaType.article',
        path: 'title',
        instruction,
      }),
    )
    endTask(endedTask())

    expect(push).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({title: 'Success: Create title from body'}),
    )
  })

  test('falls back to Untitled for a path this user did not start an instruction on', () => {
    const {hook, endTask} = setup('drafts.article-1')

    act(() =>
      hook.result.current.runInstruction({
        documentId: 'drafts.article-1',
        assistDocumentId: 'sanity.assist.schemaType.article',
        path: 'body',
        instruction,
      }),
    )
    endTask(endedTask())

    expect(push).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({title: 'Success: Untitled'}),
    )
  })

  test('prefers the title stored on the task', () => {
    const {hook, endTask} = setup('drafts.article-1')

    act(() =>
      hook.result.current.runInstruction({
        documentId: 'drafts.article-1',
        assistDocumentId: 'sanity.assist.schemaType.article',
        path: 'title',
        instruction,
      }),
    )
    endTask(endedTask({title: 'Generate caption'}))

    expect(push).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({title: 'Success: Generate caption'}),
    )
  })
})
