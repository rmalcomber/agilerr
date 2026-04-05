export type UnitType = 'epic' | 'feature' | 'story' | 'task' | 'bug'
export type UnitStatus = 'triage' | 'todo' | 'in_progress' | 'review' | 'done'
export type BugPriority = 'critical' | 'high' | 'medium' | 'low'
export type UnitColors = Record<UnitType, string>
export type StatusColors = Record<UnitStatus, string>

export interface User {
  id: string
  email: string
  name: string
  gravatar: string
  systemAdmin: boolean
  createProjects: boolean
  mustChangePassword: boolean
}

export interface ProjectPermissions {
  viewUnits: boolean
  editUnits: boolean
  deleteUnits: boolean
  addWithAI: boolean
  viewProject: boolean
  editProject: boolean
  editProjectSettings: boolean
  projectAdmin: boolean
}

export interface ProjectMembership {
  id: string
  userId: string
  projectId: string
  permissions: ProjectPermissions
  created: string
  updated: string
}

export interface MeResponse {
  user: User
  memberships: ProjectMembership[]
}

export interface ManagedUser {
  user: User
  memberships: ProjectMembership[]
}

export interface SaveMembership {
  projectId: string
  permissions: ProjectPermissions
}

export interface Project {
  id: string
  name: string
  description: string
  color: string
  tags: string[]
  unitColors: UnitColors
  statusColors: StatusColors
  created: string
  updated: string
}

export interface Unit {
  id: string
  projectId: string
  parentId?: string
  assigneeId?: string
  type: UnitType
  status: UnitStatus
  priority?: BugPriority
  title: string
  description: string
  color: string
  tags: string[]
  position: number
  createdBy: string
  created: string
  updated: string
}

export interface Mention {
  type: 'user' | 'unit'
  id: string
  label: string
}

export interface Comment {
  id: string
  unitId: string
  authorId: string
  body: string
  mentions: Mention[]
  created: string
  updated: string
}

export interface ProjectTree {
  project: Project
  units: Unit[]
  comments: Comment[]
  users: User[]
  tags: string[]
}

export interface Suggestions {
  units: Array<{ id: string; label: string }>
  users: Array<{ id: string; label: string }>
  tags: string[]
}

export interface SmartAddMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ApiDocsConfig {
  configured: boolean
  headerName: string
  apiKey: string
  apiKeyMasked: string
  openAIConfigured: boolean
}

export type ProjectPage = 'dashboard' | 'backlog' | 'kanban' | 'bugs' | 'api' | 'settings'

export interface DeletePreview {
  id: string
  kind: 'project' | 'unit'
  title: string
  childTitles: string[]
  totalDeleted: number
}

export interface DeletedItem {
  id: string
  kind: 'project' | 'unit'
  title: string
}

export interface AIPlanMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  created: string
  updated: string
}

export interface AIPlanChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIPlanProposal {
  id: string
  type: 'epic' | 'feature' | 'story' | 'bug'
  title: string
  description: string
  tags: string[]
  children?: AIPlanProposal[]
}

export interface AIProjectDraft {
  name: string
  description: string
  tags: string[]
}

export interface AIPlanSession {
  id: string
  projectId: string
  contextType: string
  contextId: string
  targetType: 'project' | 'epic' | 'feature' | 'story' | 'bug'
  includeGrandchildren: boolean
  status: 'active' | 'done'
  summary: string
  latestAssistant: string
  projectDraft?: AIProjectDraft
  proposals: AIPlanProposal[]
  created: string
  updated: string
}

export interface AIPlanState {
  session?: AIPlanSession
  messages: AIPlanMessage[]
  projectDraft?: AIProjectDraft
  proposals: AIPlanProposal[]
  assistantMessage: string
  ready: boolean
  hasHistory: boolean
}
