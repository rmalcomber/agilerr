import { pb } from './pocketbase'
import type { AIPlanProposal, AIPlanState, AIProjectDraft, AIPlanChatMessage, ApiDocsConfig, Comment, Project, ProjectTree, Suggestions, Unit, User } from '../types'

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
