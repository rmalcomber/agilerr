import { pb } from './pocketbase'
import type { AIPlanProposal, AIPlanState, AIProjectDraft, AIPlanChatMessage, ApiDocsConfig, Comment, DeletedItem, DeletePreview, Project, ProjectTree, Suggestions, Unit, User } from '../types'

const apiBase = import.meta.env.VITE_API_URL || ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  headers.set('Content-Type', 'application/json')
  if (pb.authStore.token) {
    headers.set('Authorization', pb.authStore.token)
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed')
  }
  return payload as T
}

export const api = {
  me: () => request<{ user: User }>('/api/agilerr/me'),
  docsConfig: () => request<ApiDocsConfig>('/api/agilerr/docs-config'),
  projects: () => request<{ projects: Project[] }>('/api/agilerr/projects'),
  createProject: (body: Partial<Project>) =>
    request<{ project: Project }>('/api/agilerr/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteProjectPreview: (projectId: string) => request<{ preview: DeletePreview }>(`/api/agilerr/projects/${projectId}/delete-preview`),
  deleteProject: (projectId: string) =>
    request<void>(`/api/agilerr/projects/${projectId}`, {
      method: 'DELETE',
    }),
  updateProject: (projectId: string, body: Partial<Project>) =>
    request<{ project: Project }>(`/api/agilerr/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  projectTree: (projectId: string) => request<ProjectTree>(`/api/agilerr/projects/${projectId}`),
  suggestions: (projectId: string, q = '') =>
    request<Suggestions>(`/api/agilerr/projects/${projectId}/suggest?q=${encodeURIComponent(q)}`),
  createUnit: (projectId: string, body: Partial<Unit>) =>
    request<{ unit: Unit }>(`/api/agilerr/projects/${projectId}/units`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateUnit: (unitId: string, body: Partial<Unit>) =>
    request<{ unit: Unit }>(`/api/agilerr/units/${unitId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteUnitPreview: (unitId: string) => request<{ preview: DeletePreview }>(`/api/agilerr/units/${unitId}/delete-preview`),
  moveUnit: (unitId: string, status: Unit['status']) =>
    request<{ unit: Unit }>(`/api/agilerr/units/${unitId}/move`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  deleteUnit: (unitId: string) =>
    request<void>(`/api/agilerr/units/${unitId}`, {
      method: 'DELETE',
    }),
  createComment: (unitId: string, body: Partial<Comment>) =>
    request<{ comment: Comment }>(`/api/agilerr/units/${unitId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deletedItems: () => request<{ items: DeletedItem[] }>('/api/agilerr/deleted'),
  purgeDeleted: (body: { projectIds: string[]; unitIds: string[] }) =>
    request<{ ok: boolean }>('/api/agilerr/deleted/purge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  aiProjectDraft: (body: { prompt: string; draft: AIProjectDraft; messages: AIPlanChatMessage[] }) =>
    request<{ assistantMessage: string; ready: boolean; projectDraft?: AIProjectDraft }>('/api/agilerr/ai-plans/project-draft', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  openAIPlan: (projectId: string, body: { contextUnitId?: string; targetType: 'epic' | 'feature' | 'story' | 'bug'; includeGrandchildren: boolean }) =>
    request<AIPlanState>(`/api/agilerr/projects/${projectId}/ai-plans/open`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  sendAIPlanMessage: (sessionId: string, body: { message: string; includeGrandchildren: boolean }) =>
    request<AIPlanState>(`/api/agilerr/ai-plans/${sessionId}/message`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  applyAIPlan: (sessionId: string, body: { proposals: AIPlanProposal[]; acceptedProposalIds: string[]; done: boolean }) =>
    request<{ created: Unit[]; state: AIPlanState }>(`/api/agilerr/ai-plans/${sessionId}/apply`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

function buildHeaders(init?: HeadersInit) {
  const headers = new Headers(init || {})
  headers.set('Content-Type', 'application/json')
  if (pb.authStore.token) {
    headers.set('Authorization', pb.authStore.token)
  }
  return headers
}

async function streamRequest<T>(path: string, body: unknown, onChunk: (text: string) => void): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  })
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'Request failed')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalPayload: T | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      const lines = part.split('\n')
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      const data = dataLines.join('\n')
      if (!data) continue
      if (eventName === 'chunk') {
        onChunk(JSON.parse(data) as string)
      } else if (eventName === 'done') {
        finalPayload = JSON.parse(data) as T
      } else if (eventName === 'error') {
        const payload = JSON.parse(data) as { error?: string }
        throw new Error(payload.error || 'Stream failed')
      }
    }
  }

  if (finalPayload == null) {
    throw new Error('Stream finished without a final response')
  }
  return finalPayload
}

export const streamApi = {
  projectDraft: (body: { prompt: string; draft: AIProjectDraft; messages: AIPlanChatMessage[] }, onChunk: (text: string) => void) =>
    streamRequest<{ assistantMessage: string; ready: boolean; projectDraft?: AIProjectDraft }>('/api/agilerr/ai-plans/project-draft/stream', body, onChunk),
  sendAIPlanMessage: (sessionId: string, body: { message: string; includeGrandchildren: boolean }, onChunk: (text: string) => void) =>
    streamRequest<AIPlanState>(`/api/agilerr/ai-plans/${sessionId}/message/stream`, body, onChunk),
}
