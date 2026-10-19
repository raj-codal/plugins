import type {SanityClient} from '@sanity/client'
import {typed} from 'sanity'

import {randomKey} from '../_lib/randomKey'
import {maxHistoryVisibilityMs} from '../constants'
import {assistTasksStatusId} from '../helpers/ids'
import type {AssistTasksStatus, InstructionTask} from '../types'

export interface RecentInstructionRun {
  id: string
  documentId: string
  path: string
  typePath?: string
  instructionKey: string
  title?: string
  requestedAt: number
}

/**
 * The instruction request returns before the service inserts its task, and a
 * `set` on `tasks[_key=="…"]` does not create a missing array item. Remember
 * the run so the toast can show the title immediately, then write that title
 * onto the service's task once the item exists.
 */

const STARTED_CLOCK_SKEW_MS = 15_000
const START_WINDOW_MS = 60_000
const MAX_REMEMBERED_RUNS = 50
const TASK_LOOKUP_ATTEMPTS = 20
const TASK_LOOKUP_INTERVAL_MS = 200

const reservedTaskKeys = new Set<string>()
let memory: RecentInstructionRun[] = []

export function recordRecentInstructionRun(
  run: Omit<RecentInstructionRun, 'id'>,
): RecentInstructionRun {
  const stored = {...run, id: randomKey(12)}
  memory = fresh([...getRecentInstructionRuns(), stored])
  return stored
}

export function discardRecentInstructionRun(id: string) {
  memory = getRecentInstructionRuns().filter((run) => run.id !== id)
}

export function getRecentInstructionRuns(): RecentInstructionRun[] {
  memory = fresh(memory)
  return memory
}

export function enrichInstructionTasks(
  tasks: InstructionTask[],
  runs: RecentInstructionRun[],
  documentId: string,
): InstructionTask[] {
  const matches = matchRecentInstructionRuns(tasks, runs, documentId)
  if (matches.size === 0) return tasks
  return tasks.map((task) => {
    const run = matches.get(task._key)
    if (!run) return task
    return {
      ...task,
      instructionKey: task.instructionKey ?? run.instructionKey,
      title: task.title ?? run.title,
    }
  })
}

export async function writeInstructionTaskTitle(client: SanityClient, run: RecentInstructionRun) {
  const statusId = assistTasksStatusId(run.documentId)
  // The create response returns before the service inserts the task, so each
  // read has to follow the previous one.
  /* oxlint-disable no-await-in-loop */
  for (let attempt = 0; attempt < TASK_LOOKUP_ATTEMPTS; attempt++) {
    const doc = await client.getDocument<AssistTasksStatus>(statusId).catch(() => undefined)
    const task = findUnlabeledTask(doc?.tasks ?? [], run)
    if (task && isSafeKey(task._key)) {
      reservedTaskKeys.add(task._key)
      try {
        await client.patch(statusId).set(taskTitlePatch(task._key, run)).commit()
      } catch (error: unknown) {
        reservedTaskKeys.delete(task._key)
        console.error(error)
      }
      return
    }
    await wait(TASK_LOOKUP_INTERVAL_MS)
  }
  /* oxlint-enable no-await-in-loop */
}

function findUnlabeledTask(tasks: InstructionTask[], run: RecentInstructionRun) {
  const available = tasks.filter((task) => !reservedTaskKeys.has(task._key))
  const matches = matchRecentInstructionRuns(available, [run], run.documentId)
  const taskKey = [...matches.keys()][0]
  return available.find((task) => task._key === taskKey)
}

function taskTitlePatch(taskKey: string, run: RecentInstructionRun) {
  const base = `${typed<keyof AssistTasksStatus>('tasks')}[_key=="${taskKey}"]`
  const patch: Record<string, string> = {
    [`${base}.${typed<keyof InstructionTask>('instructionKey')}`]: run.instructionKey,
  }
  if (run.title) {
    patch[`${base}.${typed<keyof InstructionTask>('title')}`] = run.title
  }
  return patch
}

function matchRecentInstructionRuns(
  tasks: InstructionTask[],
  runs: RecentInstructionRun[],
  documentId: string,
): Map<string, RecentInstructionRun> {
  const statusId = assistTasksStatusId(documentId)
  const available = runs
    .filter((run) => assistTasksStatusId(run.documentId) === statusId)
    .toSorted((a, b) => a.requestedAt - b.requestedAt)
  const matches = new Map<string, RecentInstructionRun>()

  const pending = tasks
    .filter((task) => task.started && !task.instructionKey && !task.title)
    .toSorted((a, b) => new Date(a.started ?? 0).getTime() - new Date(b.started ?? 0).getTime())

  for (const task of pending) {
    const started = new Date(task.started ?? 0).getTime()
    if (!Number.isFinite(started)) continue
    const index = findRunIndex(available, task, started)
    if (index === -1) continue
    const run = available[index]
    if (!run) continue
    available.splice(index, 1)
    matches.set(task._key, run)
  }

  return matches
}

function findRunIndex(runs: RecentInstructionRun[], task: InstructionTask, started: number) {
  const exact = runs.findIndex((run) => run.path === task.path && withinWindow(run, started))
  if (exact !== -1) return exact
  return runs.findIndex(
    (run) =>
      !!run.typePath &&
      run.typePath !== run.path &&
      run.typePath === task.path &&
      withinWindow(run, started),
  )
}

function withinWindow(run: RecentInstructionRun, started: number) {
  return (
    started >= run.requestedAt - STARTED_CLOCK_SKEW_MS &&
    started - run.requestedAt <= START_WINDOW_MS
  )
}

function fresh(runs: RecentInstructionRun[], now = Date.now()) {
  return runs
    .filter((run) => now - run.requestedAt < maxHistoryVisibilityMs)
    .toSorted((a, b) => a.requestedAt - b.requestedAt)
    .slice(-MAX_REMEMBERED_RUNS)
}

function isSafeKey(key: string) {
  return /^[A-Za-z0-9_-]+$/.test(key)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
