// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react'
import type {ObjectSchemaType} from 'sanity'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

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

function useOnePane() {
  useInstructionToaster('drafts.article-1', schemaType)
  return useRunInstruction()
}

function useTwoPanes() {
  useInstructionToaster('drafts.article-1', schemaType)
  useInstructionToaster('drafts.article-1', schemaType)
  return useRunInstruction()
}

function setup({twoPanes = false}: {twoPanes?: boolean} = {}) {
  vi.mocked(useStudioAssistDocument).mockReturnValue(assistDocument([]))
  const hook = renderHook(twoPanes ? useTwoPanes : useOnePane, {wrapper: RunInstructionProvider})
  const run = ({documentId = 'drafts.article-1', path = 'title'} = {}) =>
    act(() =>
      hook.result.current.runInstruction({
        documentId,
        assistDocumentId: 'sanity.assist.schemaType.article',
        path,
        instruction,
      }),
    )
  const setTasks = (tasks: InstructionTask[]) => {
    vi.mocked(useStudioAssistDocument).mockReturnValue(assistDocument(tasks))
    hook.rerender()
  }
  return {run, setTasks}
}

function toastTitles() {
  return push.mock.calls.map(([toast]) => toast.title)
}

describe('useInstructionToaster', () => {
  beforeEach(() => {
    push.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('names a custom instruction task stored without title and instructionKey', () => {
    const {run, setTasks} = setup()

    run()
    setTasks([endedTask()])

    expect(push).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({title: 'Success: Create title from body', status: 'success'}),
    )
  })

  test('matches a run started with the published id against the draft form value', () => {
    const {run, setTasks} = setup()

    run({documentId: 'article-1'})
    setTasks([endedTask()])

    expect(toastTitles()).toEqual(['Success: Create title from body'])
  })

  test('falls back to Untitled for a path this tab did not start an instruction on', () => {
    const {run, setTasks} = setup()

    run({path: 'body'})
    setTasks([endedTask()])

    expect(toastTitles()).toEqual(['Success: Untitled'])
  })

  test('prefers the title stored on the task', () => {
    const {run, setTasks} = setup()

    run()
    setTasks([endedTask({title: 'Generate caption'})])

    expect(toastTitles()).toEqual(['Success: Generate caption'])
  })

  test('does not reuse a finished run for a later task on the same path from another tab', () => {
    const {run, setTasks} = setup()

    run()
    const ownTask = endedTask()
    setTasks([ownTask])
    setTasks([ownTask, endedTask({_key: 'task-2'})])

    expect(toastTitles()).toEqual(['Success: Create title from body', 'Success: Untitled'])
  })

  test('does not name a task that started long after the run this tab requested', () => {
    vi.useFakeTimers({toFake: ['Date']})
    const {run, setTasks} = setup()

    run()
    vi.setSystemTime(Date.now() + 5 * 60_000)
    setTasks([endedTask()])

    expect(toastTitles()).toEqual(['Success: Untitled'])
  })

  test('names the task in every pane showing the document', () => {
    const {run, setTasks} = setup({twoPanes: true})

    run()
    setTasks([endedTask()])

    expect(toastTitles()).toEqual([
      'Success: Create title from body',
      'Success: Create title from body',
    ])
  })
})
