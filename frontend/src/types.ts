export type UnitType = 'epic' | 'feature' | 'story' | 'task'
export type UnitStatus = 'todo' | 'in_progress' | 'review' | 'done'

export interface User {
  id: string
  email: string
  name: string
  gravatar: string
}

export interface Project {
  id: string
  name: string
  description: string
  color: string
  tags: string[]
  created: string
  updated: string
}

export interface Unit {
  id: string
  projectId: string
  parentId?: string
  type: UnitType
  status: UnitStatus
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
