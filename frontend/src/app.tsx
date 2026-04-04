import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FolderKanban,
  Bug,
  House,
  LayoutGrid,
  ListFilter,
  List,
  LogOut,
  Pencil,
  Plus,
  Settings2,
  SquarePen,
  X,
} from 'lucide-preact'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import md5 from 'blueimp-md5'
import { api } from './lib/api'
import { pb } from './lib/pocketbase'
import type {
  Comment,
  Mention,
  Project,
  ProjectPage,
  ProjectTree,
  Suggestions,
  Unit,
  BugPriority,
  StatusColors,
  UnitColors,
  UnitStatus,
  UnitType,
  User,
} from './types'

const statuses: Array<{ key: UnitStatus; label: string }> = [
  { key: 'triage', label: 'Triage' },
  { key: 'todo', label: 'Todo' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]

const standardStatuses = statuses.filter((status) => status.key !== 'triage')
const bugStatuses = statuses
const bugPriorities: Array<{ key: BugPriority; label: string }> = [
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
]

const typeLabels: Record<UnitType, string> = {
  epic: 'Epic',
  feature: 'Feature',
  story: 'User Story',
  task: 'Task',
  bug: 'Bug',
}

const pluralSegments: Record<UnitType, string> = {
  epic: 'epics',
  feature: 'features',
  story: 'stories',
  task: 'tasks',
  bug: 'bugs',
}

const nextChildType: Record<UnitType, UnitType | null> = {
  epic: 'feature',
  feature: 'story',
  story: 'task',
  task: null,
  bug: null,
}

const presetColors = ['#c2410c', '#2563eb', '#0f766e', '#7c3aed', '#e11d48']

const defaultUnitColors: UnitColors = {
  epic: presetColors[0],
  feature: presetColors[1],
  story: presetColors[2],
  task: presetColors[3],
  bug: '#dc2626',
}

const defaultStatusColors: StatusColors = {
  triage: '#f59e0b',
  todo: '#64748b',
  in_progress: '#38bdf8',
  review: '#a78bfa',
  done: '#22c55e',
}

const storageKeys = {
  lastProjectId: 'agilerr:last-project-id',
  backlogTypes: 'agilerr:backlog-types',
  assignedTypes: 'agilerr:assigned-types',
  sidebarCollapsed: 'agilerr:sidebar-collapsed',
  bugsView: 'agilerr:bugs-view',
}

type UnitDraft = {
  id?: string
  projectId: string
  parentId?: string
  assigneeId?: string
  type: UnitType
  status: UnitStatus
  priority?: BugPriority
  title: string
  description: string
  tags: string[]
}

type AppRoute =
  | { kind: 'root' }
  | { kind: 'api' }
  | {
      kind: 'project'
      projectId: string
      view: ProjectPage
      chain: string[]
      taskId?: string
      invalid?: boolean
    }

type RouteContext = {
  projectId: string
  currentUnit: Unit | null
  chainUnits: Unit[]
  taskUnit: Unit | null
  invalid: boolean
}

type BacklogDisplayNode = {
  unit: Unit
  implicit: boolean
  children: BacklogDisplayNode[]
}

const emptyProjectDraft = {
  name: '',
  description: '',
  color: presetColors[1],
  tags: [] as string[],
  unitColors: { ...defaultUnitColors } as UnitColors,
  statusColors: { ...defaultStatusColors } as StatusColors,
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback
  const value = window.localStorage.getItem(key)
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function readStoredStringArray<T extends string>(key: string, allowed: readonly T[], fallback: T[]) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return fallback
    const filtered = parsed.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T))
    return filtered.length ? filtered : fallback
  } catch {
    return fallback
  }
}

function readStoredBugsView() {
  if (typeof window === 'undefined') return 'kanban' as const
  const raw = window.localStorage.getItem(storageKeys.bugsView)
  return raw === 'list' ? 'list' : 'kanban'
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [tree, setTree] = useState<ProjectTree | null>(null)
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' })
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [projectDraft, setProjectDraft] = useState(emptyProjectDraft)
  const [projectEditor, setProjectEditor] = useState(emptyProjectDraft)
  const [unitEditor, setUnitEditor] = useState<UnitDraft | null>(null)
  const [detailUnitId, setDetailUnitId] = useState<string | null>(null)
  const [apiProjectId, setApiProjectId] = useState<string>(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem(storageKeys.lastProjectId) || ''))
  const [bugsView, setBugsView] = useState<'list' | 'kanban'>(() => readStoredBugsView())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredBoolean(storageKeys.sidebarCollapsed, false))
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [backlogFilterOpen, setBacklogFilterOpen] = useState(false)
  const [backlogTypes, setBacklogTypes] = useState<UnitType[]>(() => readStoredStringArray(storageKeys.backlogTypes, ['epic', 'feature', 'story', 'task'] as const, ['epic', 'feature', 'story', 'task']))
  const [assignedFilterOpen, setAssignedFilterOpen] = useState(false)
  const [assignedTypes, setAssignedTypes] = useState<UnitType[]>(() => readStoredStringArray(storageKeys.assignedTypes, ['epic', 'feature', 'story', 'task'] as const, ['epic', 'feature', 'story', 'task']))
  const [commentBody, setCommentBody] = useState('')
  const [commentMentions, setCommentMentions] = useState<Mention[]>([])
  const [suggestions, setSuggestions] = useState<Suggestions>({ units: [], users: [], tags: [] })
  const projectMenuRef = useRef<HTMLDivElement | null>(null)
  const projectMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const backlogFilterRef = useRef<HTMLDivElement | null>(null)
  const backlogFilterButtonRef = useRef<HTMLButtonElement | null>(null)
  const assignedFilterRef = useRef<HTMLDivElement | null>(null)
  const assignedFilterButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    void loadSession()
    const unsubscribe = pb.authStore.onChange(() => {
      void loadSession()
    })
    const handlePopState = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => {
      unsubscribe()
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    if (!projectMenuOpen && !backlogFilterOpen && !assignedFilterOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (projectMenuOpen && !projectMenuRef.current?.contains(event.target as Node)) {
        setProjectMenuOpen(false)
        projectMenuButtonRef.current?.blur()
      }
      if (backlogFilterOpen && !backlogFilterRef.current?.contains(event.target as Node)) {
        setBacklogFilterOpen(false)
        backlogFilterButtonRef.current?.blur()
      }
      if (assignedFilterOpen && !assignedFilterRef.current?.contains(event.target as Node)) {
        setAssignedFilterOpen(false)
        assignedFilterButtonRef.current?.blur()
      }
    }
    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [projectMenuOpen, backlogFilterOpen, assignedFilterOpen])

  useEffect(() => {
    window.localStorage.setItem(storageKeys.sidebarCollapsed, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    window.localStorage.setItem(storageKeys.bugsView, bugsView)
  }, [bugsView])

  useEffect(() => {
    window.localStorage.setItem(storageKeys.backlogTypes, JSON.stringify(backlogTypes))
  }, [backlogTypes])

  useEffect(() => {
    window.localStorage.setItem(storageKeys.assignedTypes, JSON.stringify(assignedTypes))
  }, [assignedTypes])

  const selectedProjectId = route.kind === 'project' ? route.projectId : route.kind === 'api' ? apiProjectId : null

  useEffect(() => {
    if (selectedProjectId) {
      window.localStorage.setItem(storageKeys.lastProjectId, selectedProjectId)
    }
  }, [selectedProjectId])

  useEffect(() => {
    if (!projects.length) return
    if (apiProjectId && projects.some((project) => project.id === apiProjectId)) return
    const fallback = window.localStorage.getItem(storageKeys.lastProjectId)
    if (fallback && projects.some((project) => project.id === fallback)) {
      setApiProjectId(fallback)
      return
    }
    setApiProjectId(projects[0].id)
  }, [projects, apiProjectId])

  useEffect(() => {
    if (!selectedProjectId || !currentUser) {
      setTree(null)
      return
    }
    void loadProject(selectedProjectId)
    void loadSuggestions(selectedProjectId)
  }, [selectedProjectId, currentUser])

  useEffect(() => {
    if (loading || !currentUser || route.kind !== 'root' || !projects.length) return
    const storedProjectId = window.localStorage.getItem(storageKeys.lastProjectId)
    if (!storedProjectId) return
    if (!projects.some((project) => project.id === storedProjectId)) return
    navigate(projectDashboardPath(storedProjectId), true)
  }, [loading, currentUser, route.kind, projects])

  const units = tree?.units ?? []
  const comments = tree?.comments ?? []
  const users = tree?.users ?? []
  const selectedProject = tree?.project.id === selectedProjectId ? tree.project : projects.find((project) => project.id === selectedProjectId) || null
  const unitById = useMemo<Record<string, Unit>>(() => Object.fromEntries(units.map((unit) => [unit.id, unit])), [units])
  const userById = useMemo<Record<string, User>>(() => Object.fromEntries(users.map((user) => [user.id, user])), [users])
  const standardUnits = useMemo(() => units.filter((unit) => unit.type !== 'bug'), [units])
  const bugUnits = useMemo(() => units.filter((unit) => unit.type === 'bug'), [units])
  const commentsByUnit = useMemo(() => {
    const map = new Map<string, Comment[]>()
    for (const comment of comments) {
      const bucket = map.get(comment.unitId) || []
      bucket.push(comment)
      map.set(comment.unitId, bucket)
    }
    return map
  }, [comments])
  const treeByParent = useMemo(() => {
    const map = new Map<string, Unit[]>()
    for (const unit of standardUnits) {
      const key = unit.parentId || 'root'
      const bucket = map.get(key) || []
      bucket.push(unit)
      map.set(key, bucket)
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
    }
    return map
  }, [standardUnits])
  const backlogSelection = useMemo(() => new Set(backlogTypes), [backlogTypes])
  const backlogNodes = useMemo(() => {
    return (treeByParent.get('root') || []).flatMap((unit) => buildBacklogNodes(unit, treeByParent, backlogSelection, false))
  }, [treeByParent, backlogSelection])
  const routeContext = useMemo<RouteContext | null>(() => {
    if (route.kind !== 'project') return null
    return resolveRouteContext(route, unitById)
  }, [route, unitById])

  const modalUnit = useMemo(() => {
    if (!tree) return null
    if (detailUnitId && unitById[detailUnitId]) return unitById[detailUnitId]
    if (route.kind === 'project' && route.taskId && unitById[route.taskId]) return unitById[route.taskId]
    return null
  }, [detailUnitId, route, tree, unitById])

  useEffect(() => {
    setCommentBody('')
    setCommentMentions([])
  }, [modalUnit?.id, routeContext?.currentUnit?.id])

  async function loadSession() {
    setLoading(true)
    setError('')
    try {
      if (!pb.authStore.isValid) {
        setCurrentUser(null)
        setProjects([])
        setTree(null)
        return
      }

      const me = await api.me()
      setCurrentUser(me.user)

      const response = await api.projects()
      setProjects(response.projects)
    } catch (err) {
      pb.authStore.clear()
      setCurrentUser(null)
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }

  async function loadProject(projectId: string) {
    try {
      const result = await api.projectTree(projectId)
      setTree(result)
      setProjectEditor({
        name: result.project.name,
        description: result.project.description,
        color: result.project.color,
        tags: [...result.project.tags],
        unitColors: { ...result.project.unitColors },
        statusColors: { ...result.project.statusColors },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    }
  }

  async function loadSuggestions(projectId: string, query = '') {
    try {
      const result = await api.suggestions(projectId, query)
      setSuggestions(result)
    } catch {
      setSuggestions({ units: [], users: [], tags: [] })
    }
  }

  function navigate(nextPath: string, replace = false) {
    const current = window.location.pathname || '/'
    if (current === nextPath) {
      setRoute(parseRoute(nextPath))
      return
    }
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method](null, '', nextPath)
    setRoute(parseRoute(nextPath))
  }

  async function handleAuthSubmit(event: Event) {
    event.preventDefault()
    setError('')
    try {
      if (authMode === 'register') {
        await pb.collection('users').create({
          email: authForm.email.trim(),
          password: authForm.password,
          passwordConfirm: authForm.password,
          name: authForm.name.trim() || authForm.email.trim(),
        })
      }
      await pb.collection('users').authWithPassword(authForm.email.trim(), authForm.password)
      setAuthForm({ email: '', password: '', name: '' })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    }
  }

  async function handleCreateProject(event: Event) {
    event.preventDefault()
    try {
      const response = await api.createProject(projectDraft)
      const next = [...projects, response.project].sort((a, b) => a.name.localeCompare(b.name))
      setProjects(next)
      setProjectModalOpen(false)
      setProjectDraft(emptyProjectDraft)
      navigate(projectDashboardPath(response.project.id))
      await loadProject(response.project.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  async function handleUpdateProject(event: Event) {
    event.preventDefault()
    if (!selectedProjectId) return
    try {
      const response = await api.updateProject(selectedProjectId, projectEditor)
      setProjects((current) => current.map((project) => (project.id === response.project.id ? response.project : project)))
      await loadProject(selectedProjectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
    }
  }

  async function saveUnit(event: Event) {
    event.preventDefault()
    if (!unitEditor) return
    try {
      if (unitEditor.id) {
        await api.updateUnit(unitEditor.id, unitEditor)
      } else {
        await api.createUnit(unitEditor.projectId, unitEditor)
      }
      const projectId = unitEditor.projectId
      setUnitEditor(null)
      const nextTree = await api.projectTree(projectId)
      setTree(nextTree)
      if (unitEditor.id && route.kind === 'project') {
        if (route.taskId === unitEditor.id || route.chain.includes(unitEditor.id) || detailUnitId === unitEditor.id) {
          navigate(buildUnitPath(projectId, Object.fromEntries(nextTree.units.map((unit) => [unit.id, unit])), unitEditor.id), true)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item')
    }
  }

  async function moveUnit(unitId: string, status: UnitStatus) {
    try {
      await api.moveUnit(unitId, status)
      if (selectedProjectId) await loadProject(selectedProjectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move item')
    }
  }

  async function deleteUnit(unitId: string) {
    if (!window.confirm('Delete this item? Child items must already be removed.')) return
    try {
      const unit = unitById[unitId]
      await api.deleteUnit(unitId)
      setDetailUnitId(null)
      setUnitEditor(null)
      if (unit) {
        const fallback = unit.type === 'bug' ? projectBugsPath(unit.projectId) : unit.parentId ? buildUnitPath(unit.projectId, unitById, unit.parentId) : projectKanbanPath(unit.projectId)
        navigate(fallback, true)
      }
      if (selectedProjectId) await loadProject(selectedProjectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item')
    }
  }

  async function saveComment(event: Event, unitId: string) {
    event.preventDefault()
    try {
      await api.createComment(unitId, {
        body: commentBody,
        mentions: commentMentions,
      })
      setCommentBody('')
      setCommentMentions([])
      if (selectedProjectId) await loadProject(selectedProjectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save comment')
    }
  }

  function openNewUnit(projectId: string, parent?: Unit) {
    const type = parent ? nextChildType[parent.type] : 'epic'
    if (!type) return
    setUnitEditor({
      projectId,
      parentId: parent?.id,
      assigneeId: undefined,
      type,
      status: 'todo',
      title: '',
      description: '',
      tags: [],
    })
  }

  function openNewBug(projectId: string) {
    setUnitEditor({
      projectId,
      assigneeId: undefined,
      type: 'bug',
      status: 'triage',
      priority: 'medium',
      title: '',
      description: '',
      tags: [],
    })
  }

  function openEditUnit(unit: Unit) {
    setUnitEditor({
      id: unit.id,
      projectId: unit.projectId,
      parentId: unit.parentId,
      assigneeId: unit.assigneeId,
      type: unit.type,
      status: unit.status,
      priority: unit.priority,
      title: unit.title,
      description: unit.description,
      tags: [...unit.tags],
    })
  }

  function openUnitDetails(unit: Unit) {
    setDetailUnitId(unit.id)
  }

  function closeUnitDetails() {
    if (route.kind === 'project' && route.taskId) {
      navigate(taskParentPath(route), true)
      return
    }
    setDetailUnitId(null)
  }

  function openUnitRoute(unit: Unit) {
    if (unit.type === 'task') {
      navigate(buildUnitPath(unit.projectId, unitById, unit.id))
      return
    }
    navigate(buildUnitPath(unit.projectId, unitById, unit.id))
  }

  function insertMention(target: 'description' | 'comment', mention: Mention) {
    const token = mention.type === 'user' ? `[@${mention.label}](user:${mention.id})` : `[#${mention.label}](unit:${mention.id})`
    if (target === 'description' && unitEditor) {
      setUnitEditor({
        ...unitEditor,
        description: `${unitEditor.description}${unitEditor.description ? '\n' : ''}${token}`,
      })
    }
    if (target === 'comment') {
      setCommentBody((current) => `${current}${current ? '\n' : ''}${token}`)
      setCommentMentions((current) => [...current, mention])
    }
  }

  if (loading) {
    return <div class="grid min-h-screen place-items-center text-lg">Loading Agilerr...</div>
  }

  if (!currentUser) {
    return (
      <div class="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,transparent_28%),linear-gradient(135deg,#0f172a,#111827)] px-4 py-8">
        <div class="mx-auto grid max-w-[1600px] gap-8 lg:grid-cols-[1.05fr,0.75fr]">
          <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-7 shadow-panel backdrop-blur">
            <p class="mb-4 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              Agilerr
            </p>
            <h1 class="max-w-2xl text-4xl font-black leading-tight text-base-content">Simple Scrum boards for local teams and Dockerized demos.</h1>
            <p class="mt-5 max-w-xl text-sm text-base-content/85">
              PocketBase handles authentication and storage. The Go API enforces the strict backlog hierarchy. Preact keeps the UI lean.
            </p>
            <div class="mt-7 grid gap-3 sm:grid-cols-3">
              <ValueCard title="Strict hierarchy" body="Project -> Epic -> Feature -> User Story -> Task." />
              <ValueCard title="Context routing" body="Drill from project epics down to tasks with real project URLs and breadcrumbs." />
              <ValueCard title="Smart Add" body="Use your OpenAI key to clean up items and ask for missing clarity." />
            </div>
          </section>

          <form class="card border border-base-300 bg-base-100 shadow-panel" onSubmit={handleAuthSubmit}>
            <div class="card-body gap-5">
              <div class="tabs tabs-boxed self-start">
                <button class={`tab ${authMode === 'login' ? 'tab-active' : ''}`} type="button" onClick={() => setAuthMode('login')}>
                  Login
                </button>
                <button class={`tab ${authMode === 'register' ? 'tab-active' : ''}`} type="button" onClick={() => setAuthMode('register')}>
                  Register
                </button>
              </div>

              {authMode === 'register' && (
                <Field label="Name">
                  <input class="input input-bordered w-full" value={authForm.name} onInput={(e) => setAuthForm({ ...authForm, name: (e.currentTarget as HTMLInputElement).value })} />
                </Field>
              )}

              <Field label="Email">
                <input class="input input-bordered w-full" type="email" required value={authForm.email} onInput={(e) => setAuthForm({ ...authForm, email: (e.currentTarget as HTMLInputElement).value })} />
              </Field>

              <Field label="Password">
                <input class="input input-bordered w-full" type="password" required value={authForm.password} onInput={(e) => setAuthForm({ ...authForm, password: (e.currentTarget as HTMLInputElement).value })} />
              </Field>

              {error && <div class="alert alert-error py-2 text-sm">{error}</div>}

              <button class="btn btn-primary" type="submit">
                <ArrowRight size={16} />
                {authMode === 'login' ? 'Sign in' : 'Create account'}
              </button>

              <p class="text-sm text-base-content/80">Admin access is seeded by the backend from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.</p>
            </div>
          </form>
        </div>
      </div>
    )
  }

  const activePage = route.kind === 'project' ? route.view : null
  const apiPageActive = route.kind === 'api' || activePage === 'api'
  const projectRouteInvalid = route.kind === 'project' && route.view === 'kanban' && routeContext?.invalid

  return (
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,transparent_20%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] text-base-content">
      <div class={`grid min-h-screen ${sidebarCollapsed ? 'lg:grid-cols-[88px,1fr]' : 'lg:grid-cols-[260px,1fr]'}`}>
        <aside class={`flex flex-col border-r border-base-300/50 bg-base-100/75 backdrop-blur ${sidebarCollapsed ? 'items-center px-3 py-4' : 'p-4'}`}>
          <div>
            <div class={`flex gap-2 ${sidebarCollapsed ? 'w-full flex-col items-center' : 'items-start justify-between'}`}>
              <button class={`min-w-0 ${sidebarCollapsed ? 'text-center' : 'text-left'}`} onClick={() => navigate('/')} title="Go to projects" aria-label="Go to projects">
                <p class={`text-xs font-semibold uppercase tracking-[0.3em] text-accent ${sidebarCollapsed ? 'text-center' : ''}`}>Agilerr</p>
                {!sidebarCollapsed && <h1 class="mt-1.5 text-xl font-black">Workspace</h1>}
              </button>
              <button
                class="btn btn-ghost btn-sm h-9 min-h-9 w-9 px-0"
                onClick={() => setSidebarCollapsed((current) => !current)}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <ChevronLeft class={sidebarCollapsed ? 'rotate-180' : ''} size={16} />
              </button>
            </div>
          </div>

          <div class={`mt-5 ${sidebarCollapsed ? 'w-full' : ''}`}>
            <div class="relative" ref={projectMenuRef}>
              <button
                ref={projectMenuButtonRef}
                class={`btn btn-outline btn-sm h-10 min-h-10 ${sidebarCollapsed ? 'mx-auto flex w-10 justify-center px-0' : 'w-full justify-between'}`}
                onClick={() => {
                  setProjectMenuOpen((current) => !current)
                  projectMenuButtonRef.current?.blur()
                }}
                title={selectedProject?.name || 'Select a project'}
                aria-label={selectedProject?.name || 'Select a project'}
              >
                {sidebarCollapsed ? (
                  <span class="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: selectedProject?.color || 'rgba(148,163,184,0.45)' }}>
                    <span class="text-[10px] font-bold uppercase text-neutral-content">{(selectedProject?.name || 'P').slice(0, 1)}</span>
                  </span>
                ) : (
                  <>
                    <span class="truncate">{selectedProject?.name || 'Select a project'}</span>
                    <span class="inline-flex items-center gap-2 text-xs text-base-content/70">
                      <span>{projects.length} total</span>
                      <ChevronsUpDown size={14} />
                    </span>
                  </>
                )}
              </button>
              {projectMenuOpen && (
                <ul class={`menu absolute z-20 mt-2 rounded-box border border-base-300 bg-base-100 p-2 shadow ${sidebarCollapsed ? 'left-0 w-56' : 'w-full'}`}>
                  {projects.map((project) => (
                    <li key={project.id}>
                      <button
                        class={selectedProjectId === project.id ? 'active' : ''}
                        onClick={() => {
                          if (route.kind === 'api') {
                            setApiProjectId(project.id)
                            window.localStorage.setItem(storageKeys.lastProjectId, project.id)
                            navigate(apiPath())
                          } else {
                            navigate(projectPathForSelection(project.id, activePage))
                          }
                          setProjectMenuOpen(false)
                          projectMenuButtonRef.current?.blur()
                        }}
                      >
                        <span class="inline-flex items-center gap-2">
                          <span class="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                          <span>{project.name}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  <li class="mt-1 border-t border-base-300 pt-1">
                    <button
                      onClick={() => {
                        setProjectMenuOpen(false)
                        projectMenuButtonRef.current?.blur()
                        setProjectModalOpen(true)
                      }}
                    >
                      <Plus size={16} />
                      Create new project
                    </button>
                  </li>
                </ul>
              )}
            </div>
          </div>

          <nav class={`mt-5 ${sidebarCollapsed ? 'w-full' : ''}`}>
            <ul class={`menu rounded-box bg-base-100/75 p-2 ${sidebarCollapsed ? 'items-center' : ''}`}>
              {selectedProjectId && (
                <>
                  <li>
                    <button class={`${activePage === 'dashboard' ? 'active' : ''} ${sidebarCollapsed ? 'w-10 justify-center px-0' : ''}`} onClick={() => navigate(projectDashboardPath(selectedProjectId))} title="Dashboard" aria-label="Dashboard">
                      <House size={16} />
                      {!sidebarCollapsed && <span>Dashboard</span>}
                    </button>
                  </li>
                  <li class={sidebarCollapsed ? '' : 'pl-4'}>
                    <button class={`${activePage === 'kanban' ? 'active' : ''} ${sidebarCollapsed ? 'w-10 justify-center px-0' : ''}`} onClick={() => navigate(projectKanbanPath(selectedProjectId))} title="Kanban" aria-label="Kanban">
                      <FolderKanban size={16} />
                      {!sidebarCollapsed && <span>Kanban</span>}
                    </button>
                  </li>
                  <li class={sidebarCollapsed ? '' : 'pl-4'}>
                    <button class={`${activePage === 'backlog' ? 'active' : ''} ${sidebarCollapsed ? 'w-10 justify-center px-0' : ''}`} onClick={() => navigate(projectBacklogPath(selectedProjectId))} title="Backlog" aria-label="Backlog">
                      <BookOpen size={16} />
                      {!sidebarCollapsed && <span>Backlog</span>}
                    </button>
                  </li>
                  <li class={sidebarCollapsed ? '' : 'pl-4'}>
                    <button class={`${activePage === 'bugs' ? 'active' : ''} ${sidebarCollapsed ? 'w-10 justify-center px-0' : ''}`} onClick={() => navigate(projectBugsPath(selectedProjectId))} title="Bugs" aria-label="Bugs">
                      <Bug size={16} />
                      {!sidebarCollapsed && <span>Bugs</span>}
                    </button>
                  </li>
                  <li class={sidebarCollapsed ? '' : 'pl-4'}>
                    <button class={`${activePage === 'settings' ? 'active' : ''} ${sidebarCollapsed ? 'w-10 justify-center px-0' : ''}`} onClick={() => navigate(projectSettingsPath(selectedProjectId))} title="Settings" aria-label="Settings">
                      <Settings2 size={16} />
                      {!sidebarCollapsed && <span>Settings</span>}
                    </button>
                  </li>
                </>
              )}
              {!selectedProjectId && (
                <li>
                  <button class={`${route.kind === 'root' ? 'active' : ''} ${sidebarCollapsed ? 'w-10 justify-center px-0' : ''}`} onClick={() => navigate('/')} title="Projects" aria-label="Projects">
                    <LayoutGrid size={16} />
                    {!sidebarCollapsed && <span>Projects</span>}
                  </button>
                </li>
              )}
            </ul>
            {selectedProjectId && (
              <div class={`mt-3 border-t border-base-300/70 pt-3 ${sidebarCollapsed ? 'w-full' : ''}`}>
                <ul class={`menu rounded-box bg-base-100/75 p-2 ${sidebarCollapsed ? 'items-center' : ''}`}>
                  <li>
                    <button class={`${apiPageActive ? 'active' : ''} ${sidebarCollapsed ? 'w-10 justify-center px-0' : ''}`} onClick={() => navigate(apiPath())} title="API" aria-label="API">
                      <SquarePen size={16} />
                      {!sidebarCollapsed && <span>API</span>}
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </nav>

          <div class={`mt-auto rounded-xl border border-base-300 bg-base-100 p-3 ${sidebarCollapsed ? 'w-full max-w-[56px]' : ''}`}>
            <div class={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <img class="h-10 w-10 rounded-full ring-2 ring-base-300" src={currentUser.gravatar || gravatar(currentUser.email)} alt={currentUser.name} />
              {!sidebarCollapsed && (
                <div>
                  <div class="text-sm font-semibold">{currentUser.name}</div>
                  <div class="text-xs text-base-content/85">{currentUser.email}</div>
                </div>
              )}
            </div>
            <button class={`btn btn-outline btn-sm mt-3 h-9 min-h-9 ${sidebarCollapsed ? 'w-10 px-0' : 'w-full'}`} onClick={() => pb.authStore.clear()} title="Log out" aria-label="Log out">
              <LogOut size={16} />
              {!sidebarCollapsed && <span>Log out</span>}
            </button>
          </div>
        </aside>

        <main class="p-4 sm:p-5">
          {error && <div class="alert alert-error mb-4">{error}</div>}

          {route.kind === 'root' && (
            <ProjectDirectory
              projects={projects}
              onCreate={() => setProjectModalOpen(true)}
              onOpen={(projectId) => navigate(projectDashboardPath(projectId))}
            />
          )}

          {route.kind === 'api' && (
            <>
              {!tree ? (
                <div class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-6 shadow-panel">Loading API context…</div>
              ) : (
                <>
                  <section class="mb-5 rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">API</p>
                        <h1 class="mt-2 text-2xl font-black">Interactive API docs</h1>
                        <p class="mt-2 max-w-3xl text-sm text-base-content/85">The docs are top-level now. Use the endpoint dropdowns to swap project and item placeholders without changing the route.</p>
                      </div>
                    </div>
                  </section>
                  <ApiDocsPage project={tree.project} projects={projects} units={units} />
                </>
              )}
            </>
          )}

          {route.kind === 'project' && !tree && <div class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-6 shadow-panel">Loading project…</div>}

          {route.kind === 'project' && tree && (
            <>
              {route.view === 'backlog' && (
                <>
                  <ProjectHero project={tree.project} tags={tree.tags} onEdit={() => navigate(projectSettingsPath(tree.project.id))} onAddPrimary={() => openNewUnit(tree.project.id)} addLabel="Add epic" addTitle="Add epic" />
                  <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-4 shadow-panel">
                    <div class="mb-4 flex items-center justify-between">
                      <h2 class="text-lg font-bold">Backlog</h2>
                      <div class="flex items-center gap-3">
                        <div class="relative" ref={backlogFilterRef}>
                          <button
                            ref={backlogFilterButtonRef}
                            class="btn btn-outline btn-xs h-8 min-h-8 gap-2"
                            onClick={() => {
                              setBacklogFilterOpen((current) => !current)
                              backlogFilterButtonRef.current?.blur()
                            }}
                            title="Filter backlog item types"
                            aria-label="Filter backlog item types"
                          >
                            <ListFilter size={14} />
                            Filter
                          </button>
                          {backlogFilterOpen && (
                            <div class="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-base-300 bg-base-100 p-2 shadow-xl">
                              <div class="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.2em] text-base-content/75">Visible types</div>
                              <div class="space-y-1">
                                {(['epic', 'feature', 'story', 'task'] as UnitType[]).map((type) => {
                                  const selected = backlogTypes.includes(type)
                                  return (
                                    <button
                                      class={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-base-200 ${selected ? 'bg-base-200/80 text-base-content' : 'text-base-content/80'}`}
                                      onClick={() =>
                                        setBacklogTypes((current) => {
                                          const exists = current.includes(type)
                                          if (exists) {
                                            return current.length === 1 ? current : current.filter((item) => item !== type)
                                          }
                                          return [...current, type]
                                        })
                                      }
                                    >
                                      <span>{typeLabels[type]}</span>
                                      <span class={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'border-primary bg-primary text-primary-content' : 'border-base-300 text-transparent'}`}>
                                        <Check size={12} />
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        <span class="text-xs text-base-content/75">{countBacklogNodes(backlogNodes)} items</span>
                      </div>
                    </div>
                    <div class="space-y-3">
                      {backlogNodes.map((node) => (
                        <UnitTreeNode
                          key={`${node.unit.id}-${node.implicit ? 'implicit' : 'explicit'}`}
                          project={tree.project}
                          node={node}
                          userById={userById}
                          commentsByUnit={commentsByUnit}
                          onOpenRoute={openUnitRoute}
                          onOpenDetails={openUnitDetails}
                          onEdit={openEditUnit}
                          onCreateChild={(target) => openNewUnit(tree.project.id, target)}
                        />
                      ))}
                      {!backlogNodes.length && <div class="rounded-xl border border-dashed border-base-300 p-3 text-xs text-base-content/80">No items match the current filter.</div>}
                    </div>
                  </section>
                </>
              )}

              {route.view === 'dashboard' && (
                <ProjectDashboardPage
                  currentUser={currentUser}
                  project={tree.project}
                  units={standardUnits}
                  bugs={bugUnits}
                  comments={comments}
                  assignedFilterOpen={assignedFilterOpen}
                  assignedTypes={assignedTypes}
                  onEditProject={() => navigate(projectSettingsPath(tree.project.id))}
                  onAddPrimary={() => openNewUnit(tree.project.id)}
                  onToggleAssignedFilter={() => {
                    setAssignedFilterOpen((current) => !current)
                    assignedFilterButtonRef.current?.blur()
                  }}
                  onAssignedTypesChange={setAssignedTypes}
                  assignedFilterRef={assignedFilterRef}
                  assignedFilterButtonRef={assignedFilterButtonRef}
                />
              )}

              {route.view === 'bugs' && (
                <BugsPage
                  project={tree.project}
                  bugs={bugUnits}
                  commentsByUnit={commentsByUnit}
                  userById={userById}
                  bugsView={bugsView}
                  onChangeView={setBugsView}
                  onEditProject={() => navigate(projectSettingsPath(tree.project.id))}
                  onAddBug={() => openNewBug(tree.project.id)}
                  onOpenDetails={openUnitDetails}
                  onEditBug={openEditUnit}
                  onMoveBug={(unitId, status) => void moveUnit(unitId, status)}
                />
              )}

              {route.view === 'settings' && (
                <ProjectSettingsPage
                  draft={projectEditor}
                  suggestions={tree.tags}
                  onChange={setProjectEditor}
                  onSave={(event) => void handleUpdateProject(event)}
                />
              )}

              {route.view === 'kanban' && (
                <>
                  {projectRouteInvalid ? (
                    <div class="rounded-[1.5rem] border border-warning/30 bg-base-100/90 p-6 shadow-panel">
                      <h2 class="text-lg font-bold">Item path not found</h2>
                      <p class="mt-2 text-sm text-base-content/85">This link does not match the current project hierarchy.</p>
                      <button class="btn btn-primary btn-sm mt-4" onClick={() => navigate(projectKanbanPath(tree.project.id), true)}>
                        <FolderKanban size={16} />
                        Back to project board
                      </button>
                    </div>
                  ) : (
                    <KanbanRoutePage
                      project={tree.project}
                      allTags={tree.tags}
                      routeContext={routeContext}
                      treeByParent={treeByParent}
                      commentsByUnit={commentsByUnit}
                      userById={userById}
                      users={users}
                      unitById={unitById}
                      onEditProject={() => navigate(projectSettingsPath(tree.project.id))}
                      onAddEpic={() => openNewUnit(tree.project.id)}
                      onOpenRoute={openUnitRoute}
                      onOpenDetails={openUnitDetails}
                      onEditUnit={openEditUnit}
                      onCreateChild={(unit) => openNewUnit(tree.project.id, unit)}
                      onMoveUnit={(unitId, status) => void moveUnit(unitId, status)}
                      onSaveComment={(event, unitId) => void saveComment(event, unitId)}
                      commentBody={commentBody}
                      commentMentions={commentMentions}
                      onCommentBodyChange={setCommentBody}
                      onInsertCommentMention={(mention) => insertMention('comment', mention)}
                      suggestions={suggestions}
                      navigate={navigate}
                    />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {projectModalOpen && (
        <Modal title="Create Project" onClose={() => setProjectModalOpen(false)}>
          <form class="space-y-4" onSubmit={handleCreateProject}>
            <Field label="Name">
              <input class="input input-bordered w-full" required value={projectDraft.name} onInput={(e) => setProjectDraft({ ...projectDraft, name: (e.currentTarget as HTMLInputElement).value })} />
            </Field>
            <Field label="Description">
              <textarea class="textarea textarea-bordered min-h-28 w-full" value={projectDraft.description} onInput={(e) => setProjectDraft({ ...projectDraft, description: (e.currentTarget as HTMLTextAreaElement).value })} />
            </Field>
            <Field label="Color">
              <ColorPicker value={projectDraft.color} onChange={(color) => setProjectDraft({ ...projectDraft, color })} />
            </Field>
            <TagEditor tags={projectDraft.tags} suggestions={suggestions.tags} onChange={(tags) => setProjectDraft({ ...projectDraft, tags })} />
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost" type="button" onClick={() => setProjectModalOpen(false)}>
                Cancel
              </button>
              <button class="btn btn-primary" type="submit">
                <Plus size={16} />
                Create project
              </button>
            </div>
          </form>
        </Modal>
      )}

      {unitEditor && (
        <Modal title={unitEditor.id ? `Edit ${typeLabels[unitEditor.type]}` : `Add ${typeLabels[unitEditor.type]}`} onClose={() => setUnitEditor(null)} wide>
          <form class="space-y-5" onSubmit={saveUnit}>
            <div class="grid gap-6 lg:grid-cols-[1fr,0.9fr]">
              <section class="space-y-4 rounded-[1.5rem] border border-base-300 bg-base-100 p-4">
                <h3 class="text-lg font-bold">Required</h3>
                <Field label="Type">
                  <select
                    class="select select-bordered w-full"
                    value={unitEditor.type}
                    disabled={Boolean(unitEditor.parentId)}
                    onChange={(e) => {
                      const nextType = (e.currentTarget as HTMLSelectElement).value as UnitType
                      setUnitEditor({
                        ...unitEditor,
                        type: nextType,
                        parentId: nextType === 'bug' ? undefined : unitEditor.parentId,
                        status: nextType === 'bug' ? 'triage' : unitEditor.status === 'triage' ? 'todo' : unitEditor.status,
                        priority: nextType === 'bug' ? unitEditor.priority || 'medium' : undefined,
                      })
                    }}
                  >
                    {(['epic', 'feature', 'story', 'task', 'bug'] as UnitType[]).map((type) => (
                      <option value={type}>{typeLabels[type]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Title">
                  <input class="input input-bordered w-full" required value={unitEditor.title} onInput={(e) => setUnitEditor({ ...unitEditor, title: (e.currentTarget as HTMLInputElement).value })} />
                </Field>
                <Field label="Description (Markdown supported)">
                  <textarea class="textarea textarea-bordered min-h-52 w-full" value={unitEditor.description} onInput={(e) => setUnitEditor({ ...unitEditor, description: (e.currentTarget as HTMLTextAreaElement).value })} />
                </Field>
                <div class="grid gap-4 lg:grid-cols-2">
                  <MentionPanel title="Mention users" items={suggestions.users.map((item) => ({ id: item.id, label: item.label, type: 'user' as const }))} onPick={(mention) => insertMention('description', mention)} />
                  <MentionPanel title="Mention items" items={suggestions.units.map((item) => ({ id: item.id, label: item.label, type: 'unit' as const }))} onPick={(mention) => insertMention('description', mention)} />
                </div>
              </section>

              <section class="space-y-4 rounded-[1.5rem] border border-base-300 bg-base-100 p-4">
                <h3 class="text-lg font-bold">Optional</h3>
                <Field label="Assignee">
                  <UserPicker users={users} value={unitEditor.assigneeId} onChange={(assigneeId) => setUnitEditor({ ...unitEditor, assigneeId })} />
                </Field>
                <Field label="Status">
                  <select class="select select-bordered w-full" value={unitEditor.status} onChange={(e) => setUnitEditor({ ...unitEditor, status: (e.currentTarget as HTMLSelectElement).value as UnitStatus })}>
                    {(unitEditor.type === 'bug' ? bugStatuses : standardStatuses).map((status) => (
                      <option value={status.key}>{status.label}</option>
                    ))}
                  </select>
                </Field>
                {unitEditor.type === 'bug' ? (
                  <Field label="Priority">
                    <select class="select select-bordered w-full" value={unitEditor.priority || 'medium'} onChange={(e) => setUnitEditor({ ...unitEditor, priority: (e.currentTarget as HTMLSelectElement).value as BugPriority })}>
                      {bugPriorities.map((priority) => (
                        <option value={priority.key}>{priority.label}</option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="Parent">
                    <select class="select select-bordered w-full" value={unitEditor.parentId || ''} onChange={(e) => setUnitEditor({ ...unitEditor, parentId: (e.currentTarget as HTMLSelectElement).value || undefined })}>
                      <option value="">No parent</option>
                      {standardUnits
                        .filter((unit) => unit.id !== unitEditor.id)
                        .map((unit) => (
                          <option value={unit.id}>
                            {typeLabels[unit.type]}: {unit.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <TagEditor tags={unitEditor.tags} suggestions={tree?.tags || []} onChange={(tags) => setUnitEditor({ ...unitEditor, tags })} />
              </section>
            </div>

            <div class="flex flex-wrap justify-between gap-2">
              {unitEditor.id ? (
                <button class="btn btn-error btn-outline" type="button" onClick={() => void deleteUnit(unitEditor.id!)}>
                  <X size={16} />
                  Delete item
                </button>
              ) : (
                <span />
              )}
              <div class="flex gap-2">
                <button class="btn btn-ghost" type="button" onClick={() => setUnitEditor(null)}>
                  Cancel
                </button>
                <button class="btn btn-primary" type="submit">
                  <SquarePen size={16} />
                  Save item
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {modalUnit && (
        <Modal title={modalUnit.title} onClose={closeUnitDetails} wide>
          <UnitDetailContent
            unit={modalUnit}
            comments={commentsByUnit.get(modalUnit.id) || []}
            userById={userById}
            suggestions={suggestions}
            commentBody={commentBody}
            onCommentBodyChange={setCommentBody}
            onInsertCommentMention={(mention) => insertMention('comment', mention)}
            onSaveComment={(event) => void saveComment(event, modalUnit.id)}
            onEdit={() => openEditUnit(modalUnit)}
            onCreateChild={nextChildType[modalUnit.type] ? () => openNewUnit(modalUnit.projectId, modalUnit) : undefined}
          />
        </Modal>
      )}
    </div>
  )
}

function ProjectDirectory(props: { projects: Project[]; onCreate: () => void; onOpen: (projectId: string) => void }) {
  return (
    <section class="space-y-5">
      <header class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Projects</p>
            <h2 class="mt-2 text-2xl font-black">Choose a workspace</h2>
            <p class="mt-2 max-w-2xl text-sm text-base-content/85">Select a project to open its dashboard, or create a new one from here.</p>
          </div>
          <button class="btn btn-primary btn-sm h-9 min-h-9" onClick={props.onCreate} title="Create project" aria-label="Create project">
            <Plus size={16} />
            <span class="sr-only">Create project</span>
          </button>
        </div>
      </header>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {props.projects.map((project) => (
          <button class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 text-left shadow-panel transition hover:-translate-y-0.5 hover:border-primary/50" onClick={() => props.onOpen(project.id)}>
            <div class="flex items-center gap-3">
              <span class="h-4 w-4 rounded-full" style={{ backgroundColor: project.color }} />
              <h3 class="text-lg font-bold">{project.name}</h3>
            </div>
            <p class="mt-3 line-clamp-3 text-sm text-base-content/88">{project.description || 'No description yet.'}</p>
            <div class="mt-4 flex flex-wrap gap-2">
              {project.tags.length ? (
                project.tags.slice(0, 6).map((tag) => (
                  <span class="badge badge-outline border-base-content/40 text-base-content">{tag}</span>
                ))
              ) : (
                <span class="text-xs text-base-content/80">No tags</span>
              )}
            </div>
          </button>
        ))}
        {!props.projects.length && <div class="rounded-[1.5rem] border border-dashed border-base-300 bg-base-100/90 p-6 text-sm text-base-content/80">No projects yet.</div>}
      </div>
    </section>
  )
}

function ProjectHero(props: { project: Project; tags: string[]; onEdit: () => void; onAddPrimary: () => void; addLabel: string; addTitle: string }) {
  return (
    <header class="mb-5 rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="h-4 w-4 rounded-full" style={{ backgroundColor: props.project.color }} />
            <h1 class="text-2xl font-black">{props.project.name}</h1>
          </div>
          <p class="mt-2.5 max-w-3xl text-sm text-base-content/90">{props.project.description || 'No project description yet.'}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            {props.tags.map((tag) => (
              <span class="badge badge-outline border-base-content/40 text-base-content">{tag}</span>
            ))}
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-outline btn-sm h-9 min-h-9" onClick={props.onEdit} title="Edit project" aria-label="Edit project">
            <Pencil size={16} />
            <span class="sr-only">Edit project</span>
          </button>
          <button class="btn btn-primary btn-sm h-9 min-h-9" onClick={props.onAddPrimary} title={props.addTitle} aria-label={props.addTitle}>
            <Plus size={16} />
            <span class="sr-only">{props.addLabel}</span>
          </button>
        </div>
      </div>
    </header>
  )
}

function ProjectDashboardPage(props: {
  currentUser: User
  project: Project
  units: Unit[]
  bugs: Unit[]
  comments: Comment[]
  assignedFilterOpen: boolean
  assignedTypes: UnitType[]
  onEditProject: () => void
  onAddPrimary: () => void
  onToggleAssignedFilter: () => void
  onAssignedTypesChange: (types: UnitType[]) => void
  assignedFilterRef: { current: HTMLDivElement | null }
  assignedFilterButtonRef: { current: HTMLButtonElement | null }
}) {
  const assignedSelection = new Set(props.assignedTypes)
  const unitIndex = Object.fromEntries(props.units.concat(props.bugs).map((item) => [item.id, item]))
  const standardStatusesForCounts = ['todo', 'in_progress', 'review', 'done'] as UnitStatus[]
  const assignedItems = [...props.units, ...props.bugs]
    .filter((unit) => unit.assigneeId === props.currentUser.id && assignedSelection.has(unit.type))
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 6)
  const typeCounts = {
    epic: props.units.filter((unit) => unit.type === 'epic').length,
    feature: props.units.filter((unit) => unit.type === 'feature').length,
    story: props.units.filter((unit) => unit.type === 'story').length,
    task: props.units.filter((unit) => unit.type === 'task').length,
  }
  const statusCounts = Object.fromEntries(standardStatusesForCounts.map((status) => [status, props.units.filter((unit) => unit.status === status).length])) as Record<string, number>
  const quickLinks = [
    { title: 'Kanban', body: 'Open the live delivery board and move work between lanes.', path: projectKanbanPath(props.project.id), icon: FolderKanban },
    { title: 'Backlog', body: 'Browse the hierarchy, filter by type, and expand the work breakdown.', path: projectBacklogPath(props.project.id), icon: BookOpen },
    { title: 'API', body: 'See the available endpoints for local integrations and automation.', path: apiPath(), icon: SquarePen },
  ]

  return (
    <section class="space-y-5">
      <ProjectHero project={props.project} tags={props.project.tags} onEdit={props.onEditProject} onAddPrimary={props.onAddPrimary} addLabel="Add epic" addTitle="Add epic" />

      <section class="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <div class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Overview</p>
          <h2 class="mt-2 text-2xl font-black">Project dashboard</h2>
          <p class="mt-2 max-w-3xl text-sm text-base-content/85">Get a quick read on the current delivery shape, then jump straight into the board, backlog, or API docs.</p>
          <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Epics" value={typeCounts.epic} accent={props.project.unitColors.epic} />
            <MetricCard label="Features" value={typeCounts.feature} accent={props.project.unitColors.feature} />
            <MetricCard label="Stories" value={typeCounts.story} accent={props.project.unitColors.story} />
            <MetricCard label="Tasks" value={typeCounts.task} accent={props.project.unitColors.task} />
          </div>
        </div>

        <div class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Flow</p>
          <h2 class="mt-2 text-xl font-black">Work by status</h2>
          <div class="mt-4 space-y-3">
            {standardStatusesForCounts.map((status) => (
              <div class="flex items-center justify-between rounded-xl border border-base-300 bg-base-100 p-3">
                <div class="flex items-center gap-3">
                  <span class="h-3 w-3 rounded-full" style={{ backgroundColor: props.project.statusColors[status] }} />
                  <span class="text-sm font-medium">{statusLabel(status)}</span>
                </div>
                <span class="text-lg font-bold">{statusCounts[status]}</span>
              </div>
            ))}
            <div class="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Bugs" value={props.bugs.length} accent={props.project.unitColors.bug} compact />
              <MetricCard label="Comments" value={props.comments.length} accent={props.project.color} compact />
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Assigned to you</p>
            <h2 class="mt-2 text-xl font-black">Your items</h2>
          </div>
          <div class="flex items-center gap-3">
            <div class="relative" ref={props.assignedFilterRef}>
              <button
                ref={props.assignedFilterButtonRef}
                class="btn btn-outline btn-xs h-8 min-h-8 gap-2"
                onClick={props.onToggleAssignedFilter}
                title="Filter assigned item types"
                aria-label="Filter assigned item types"
              >
                <ListFilter size={14} />
                Filter
              </button>
              {props.assignedFilterOpen && (
                <div class="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-base-300 bg-base-100 p-2 shadow-xl">
                  <div class="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.2em] text-base-content/75">Visible types</div>
                  <div class="space-y-1">
                    {(['epic', 'feature', 'story', 'task'] as UnitType[]).map((type) => {
                      const selected = props.assignedTypes.includes(type)
                      return (
                        <button
                          class={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-base-200 ${selected ? 'bg-base-200/80 text-base-content' : 'text-base-content/80'}`}
                          onClick={() =>
                            props.onAssignedTypesChange(
                              selected
                                ? props.assignedTypes.length === 1
                                  ? props.assignedTypes
                                  : props.assignedTypes.filter((item) => item !== type)
                                : [...props.assignedTypes, type],
                            )
                          }
                        >
                          <span>{typeLabels[type]}</span>
                          <span class={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'border-primary bg-primary text-primary-content' : 'border-base-300 text-transparent'}`}>
                            <Check size={12} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <span class="text-sm text-base-content/75">{assignedItems.length} showing</span>
          </div>
        </div>
        <div class="space-y-3">
          {assignedItems.map((unit) => (
            <a href={unit.type === 'bug' ? projectBugsPath(props.project.id) : buildUnitPath(props.project.id, unitIndex, unit.id)} class="flex items-center justify-between gap-3 rounded-xl border border-base-300 bg-base-100 p-3 transition hover:border-primary/50 hover:bg-base-200/40">
              <div class="min-w-0">
                <div class="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-base-content/75">
                  <span class="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: unit.color }} />
                  <span>{typeLabels[unit.type]}</span>
                  <span class="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: `${props.project.statusColors[unit.status]}22`, color: props.project.statusColors[unit.status] }}>
                    {statusLabel(unit.status)}
                  </span>
                </div>
                <div class="mt-1 truncate text-sm font-semibold">{unit.title}</div>
                <div class="mt-1 line-clamp-1 text-xs text-base-content/75">{plainText(unit.description) || 'No description yet.'}</div>
              </div>
              <ChevronRight class="shrink-0 text-base-content/45" size={18} />
            </a>
          ))}
          {!assignedItems.length && <div class="rounded-xl border border-dashed border-base-300 p-4 text-sm text-base-content/80">No items match the current filter for your assignments.</div>}
        </div>
      </section>

      <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Quick links</p>
            <h2 class="mt-2 text-xl font-black">Jump into the project</h2>
          </div>
        </div>
        <div class="grid gap-4 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <a href={link.path} class="group rounded-[1.25rem] border border-base-300 bg-base-100 p-4 transition hover:-translate-y-0.5 hover:border-primary/50">
              <div class="flex items-start justify-between gap-3">
                <div class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <link.icon size={18} />
                </div>
                <ChevronRight class="text-base-content/45 transition group-hover:translate-x-0.5 group-hover:text-primary" size={18} />
              </div>
              <h3 class="mt-4 text-lg font-bold">{link.title}</h3>
              <p class="mt-2 text-sm text-base-content/82">{link.body}</p>
            </a>
          ))}
        </div>
      </section>
    </section>
  )
}

function MetricCard(props: { label: string; value: number; accent: string; compact?: boolean }) {
  return (
    <div class={`rounded-xl border border-base-300 bg-base-100 ${props.compact ? 'p-3' : 'p-4'}`}>
      <div class="flex items-center gap-3">
        <span class={`${props.compact ? 'h-3 w-3' : 'h-4 w-4'} rounded-full`} style={{ backgroundColor: props.accent }} />
        <span class="text-sm text-base-content/80">{props.label}</span>
      </div>
      <div class={`${props.compact ? 'mt-2 text-2xl' : 'mt-3 text-3xl'} font-black`}>{props.value}</div>
    </div>
  )
}

function ProjectSettingsPage(props: {
  draft: typeof emptyProjectDraft
  suggestions: string[]
  onChange: (draft: typeof emptyProjectDraft) => void
  onSave: (event: Event) => void
}) {
  const [tab, setTab] = useState<'general' | 'items' | 'statuses'>('general')

  return (
    <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
      <div class="mb-5">
        <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Settings</p>
        <h2 class="mt-2 text-2xl font-black">Project settings</h2>
        <p class="mt-2 text-sm text-base-content/85">Set the project metadata and the default colors used for each item type.</p>
      </div>

      <form class="space-y-5" onSubmit={props.onSave}>
        <div class="grid gap-5 xl:grid-cols-[240px,1fr]">
          <aside class="space-y-4 rounded-[1.5rem] border border-base-300 bg-base-100 p-4">
            <div class="rounded-xl border border-base-300 bg-base-200/40 p-2">
              <div class="flex flex-col gap-2">
                <button class={`btn btn-sm justify-start ${tab === 'general' ? 'btn-primary' : 'btn-ghost border border-base-300'}`} type="button" onClick={() => setTab('general')}>
                General
                </button>
                <button class={`btn btn-sm justify-start ${tab === 'items' ? 'btn-primary' : 'btn-ghost border border-base-300'}`} type="button" onClick={() => setTab('items')}>
                Item colors
                </button>
                <button class={`btn btn-sm justify-start ${tab === 'statuses' ? 'btn-primary' : 'btn-ghost border border-base-300'}`} type="button" onClick={() => setTab('statuses')}>
                Status colors
                </button>
              </div>
            </div>

            <div class="rounded-xl border border-base-300 bg-base-200/40 p-4">
              <div class="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/70">Current project</div>
              <div class="mt-3 flex items-center gap-3">
                <span class="h-4 w-4 rounded-full" style={{ backgroundColor: props.draft.color }} />
                <div class="min-w-0">
                  <div class="truncate font-semibold">{props.draft.name || 'Untitled project'}</div>
                  <div class="text-xs text-base-content/75">{props.draft.tags.length} tags configured</div>
                </div>
              </div>
            </div>
          </aside>

          <div class="space-y-5">
            {tab === 'general' && (
              <section class="space-y-4 rounded-[1.5rem] border border-base-300 bg-base-100 p-4">
                <div>
                  <h3 class="text-lg font-bold">General</h3>
                  <p class="mt-1 text-sm text-base-content/80">Edit the core project information and tagging defaults.</p>
                </div>
                <Field label="Name">
                  <input class="input input-bordered w-full" required value={props.draft.name} onInput={(e) => props.onChange({ ...props.draft, name: (e.currentTarget as HTMLInputElement).value })} />
                </Field>
                <Field label="Description">
                  <textarea class="textarea textarea-bordered min-h-36 w-full" value={props.draft.description} onInput={(e) => props.onChange({ ...props.draft, description: (e.currentTarget as HTMLTextAreaElement).value })} />
                </Field>
                <Field label="Project color">
                  <ColorPicker value={props.draft.color} onChange={(color) => props.onChange({ ...props.draft, color })} />
                </Field>
                <TagEditor tags={props.draft.tags} suggestions={props.suggestions} onChange={(tags) => props.onChange({ ...props.draft, tags })} />
              </section>
            )}

            {tab === 'items' && (
              <section class="space-y-4 rounded-[1.5rem] border border-base-300 bg-base-100 p-4">
                <div>
                  <h3 class="text-lg font-bold">Item colors</h3>
                  <p class="mt-1 text-sm text-base-content/80">Choose the default color used for each backlog item type.</p>
                </div>
                <div class="grid gap-4 lg:grid-cols-2">
                  {(['epic', 'feature', 'story', 'task', 'bug'] as UnitType[]).map((type) => (
                    <div class="rounded-xl border border-base-300 bg-base-100 p-3" key={type}>
                      <Field label={typeLabels[type]}>
                        <ColorPicker
                          value={props.draft.unitColors[type]}
                          onChange={(color) =>
                            props.onChange({
                              ...props.draft,
                              unitColors: {
                                ...props.draft.unitColors,
                                [type]: color,
                              },
                            })
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tab === 'statuses' && (
              <section class="space-y-4 rounded-[1.5rem] border border-base-300 bg-base-100 p-4">
                <div>
                  <h3 class="text-lg font-bold">Status colors</h3>
                  <p class="mt-1 text-sm text-base-content/80">Define the lane colors that appear on item borders and status summaries.</p>
                </div>
                <div class="grid gap-4 lg:grid-cols-2">
                  {statuses.map((status) => (
                    <div class="rounded-xl border border-base-300 bg-base-100 p-3" key={status.key}>
                      <Field label={status.label}>
                        <ColorPicker
                          value={props.draft.statusColors[status.key]}
                          onChange={(color) =>
                            props.onChange({
                              ...props.draft,
                              statusColors: {
                                ...props.draft.statusColors,
                                [status.key]: color,
                              },
                            })
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <div class="flex justify-between gap-3 border-t border-base-300/70 pt-4">
          <div class="text-sm text-base-content/75">Changes apply to the current project immediately after save.</div>
          <button class="btn btn-primary" type="submit">
            <SquarePen size={16} />
            Save project settings
          </button>
        </div>
      </form>
    </section>
  )
}

function BugsPage(props: {
  project: Project
  bugs: Unit[]
  commentsByUnit: Map<string, Comment[]>
  userById: Record<string, User>
  bugsView: 'list' | 'kanban'
  onChangeView: (view: 'list' | 'kanban') => void
  onEditProject: () => void
  onAddBug: () => void
  onOpenDetails: (unit: Unit) => void
  onEditBug: (unit: Unit) => void
  onMoveBug: (unitId: string, status: UnitStatus) => void
}) {
  return (
    <section class="space-y-5">
      <ProjectHero project={props.project} tags={props.project.tags} onEdit={props.onEditProject} onAddPrimary={props.onAddBug} addLabel="Add bug" addTitle="Add bug" />
      <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-4 shadow-panel">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold">Bugs</h2>
            <p class="mt-1 text-xs text-base-content/80">Project-wide bugs stay separate from the epic-feature-story-task flow.</p>
          </div>
          <div class="join">
            <button class={`btn btn-sm join-item ${props.bugsView === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => props.onChangeView('list')}>
              <List size={16} />
              List
            </button>
            <button class={`btn btn-sm join-item ${props.bugsView === 'kanban' ? 'btn-primary' : 'btn-outline'}`} onClick={() => props.onChangeView('kanban')}>
              <FolderKanban size={16} />
              Board
            </button>
          </div>
        </div>

        {props.bugsView === 'list' ? (
          <BugList project={props.project} bugs={props.bugs} commentsByUnit={props.commentsByUnit} userById={props.userById} onOpenDetails={props.onOpenDetails} onEditBug={props.onEditBug} />
        ) : (
          <KanbanBoard
            project={props.project}
            userById={props.userById}
            title="Bug Board"
            subtitle="New bugs start in triage before they move into planned work."
            units={props.bugs}
            onMoveUnit={props.onMoveBug}
            onOpenRoute={props.onOpenDetails}
            onOpenDetails={props.onOpenDetails}
            statusOptions={bugStatuses}
          />
        )}
      </section>
    </section>
  )
}

function BugList(props: {
  project: Project
  bugs: Unit[]
  commentsByUnit: Map<string, Comment[]>
  userById: Record<string, User>
  onOpenDetails: (unit: Unit) => void
  onEditBug: (unit: Unit) => void
}) {
  const sorted = [...props.bugs].sort((a, b) => bugPriorityRank(a.priority) - bugPriorityRank(b.priority) || a.position - b.position)
  return (
    <div class="space-y-3">
      {sorted.map((bug) => (
        <article class="rounded-xl border border-base-300 bg-base-100 p-3" style={statusBorderStyle(props.project, bug.status)}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge badge-error">Bug</span>
                <PriorityBadge priority={bug.priority} />
                <span class="badge badge-outline border-base-content/40 text-base-content">{statusLabel(bug.status)}</span>
                {bug.assigneeId && <AssigneeBadge assignee={props.userById[bug.assigneeId]} />}
              </div>
              <button class="mt-2 block text-left text-base font-semibold hover:text-primary" onClick={() => props.onOpenDetails(bug)}>
                {bug.title}
              </button>
              <div class="mt-1.5 text-xs text-base-content/90">{plainText(bug.description) || 'No description yet.'}</div>
            </div>
            <button class="btn btn-outline btn-xs" onClick={() => props.onEditBug(bug)} title="Edit bug" aria-label="Edit bug">
              <Pencil size={14} />
            </button>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <span class="badge badge-outline border-base-content/40 text-base-content">{props.commentsByUnit.get(bug.id)?.length || 0} comments</span>
            {bug.tags.map((tag) => (
              <span class="badge">{tag}</span>
            ))}
          </div>
        </article>
      ))}
      {!sorted.length && <div class="rounded-xl border border-dashed border-base-300 p-4 text-sm text-base-content/80">No bugs yet.</div>}
    </div>
  )
}

function KanbanRoutePage(props: {
  project: Project
  allTags: string[]
  routeContext: RouteContext | null
  treeByParent: Map<string, Unit[]>
  commentsByUnit: Map<string, Comment[]>
  userById: Record<string, User>
  users: User[]
  unitById: Record<string, Unit>
  onEditProject: () => void
  onAddEpic: () => void
  onOpenRoute: (unit: Unit) => void
  onOpenDetails: (unit: Unit) => void
  onEditUnit: (unit: Unit) => void
  onCreateChild: (unit: Unit) => void
  onMoveUnit: (unitId: string, status: UnitStatus) => void
  onSaveComment: (event: Event, unitId: string) => void
  commentBody: string
  commentMentions: Mention[]
  onCommentBodyChange: (value: string) => void
  onInsertCommentMention: (mention: Mention) => void
  suggestions: Suggestions
  navigate: (path: string, replace?: boolean) => void
}) {
  const currentUnit = props.routeContext?.currentUnit || null
  const taskUnit = props.routeContext?.taskUnit || null
  const children = props.treeByParent.get(currentUnit?.id || 'root') || []
  const laneTitle = currentUnit ? `${typeLabels[nextChildType[currentUnit.type] || 'task']} Board` : 'Epic Board'

  return (
    <section class="space-y-5">
      {currentUnit ? (
        <>
          <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
            <Breadcrumbs project={props.project} chain={props.routeContext?.chainUnits || []} task={taskUnit} unitById={props.unitById} navigate={props.navigate} />
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class="h-4 w-4 rounded-full" style={{ backgroundColor: currentUnit.color }} />
                <div>
                  <div class="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/78">{typeLabels[currentUnit.type]}</div>
                  <h1 class="text-2xl font-black">{currentUnit.title}</h1>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button class="btn btn-outline btn-sm h-9 min-h-9" onClick={() => props.onEditUnit(currentUnit)} title={`Edit ${typeLabels[currentUnit.type]}`} aria-label={`Edit ${typeLabels[currentUnit.type]}`}>
                  <Pencil size={16} />
                  <span class="sr-only">{`Edit ${typeLabels[currentUnit.type]}`}</span>
                </button>
                {nextChildType[currentUnit.type] && (
                  <button class="btn btn-primary btn-sm h-9 min-h-9" onClick={() => props.onCreateChild(currentUnit)} title={`Add ${typeLabels[nextChildType[currentUnit.type] as UnitType]}`} aria-label={`Add ${typeLabels[nextChildType[currentUnit.type] as UnitType]}`}>
                    <Plus size={16} />
                    <span class="sr-only">{`Add ${typeLabels[nextChildType[currentUnit.type] as UnitType]}`}</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
            <UnitDetailContent
              unit={currentUnit}
              comments={[]}
              userById={props.userById}
              suggestions={props.suggestions}
              commentBody={props.commentBody}
              onCommentBodyChange={props.onCommentBodyChange}
              onInsertCommentMention={props.onInsertCommentMention}
              onSaveComment={(event) => props.onSaveComment(event, currentUnit.id)}
              hideActions
              hideComments
            />
          </section>
        </>
      ) : (
        <ProjectHero project={props.project} tags={props.allTags} onEdit={props.onEditProject} onAddPrimary={props.onAddEpic} addLabel="Add epic" addTitle="Add epic" />
      )}

      {!taskUnit && (
        <KanbanBoard
          project={props.project}
          userById={props.userById}
          title={laneTitle}
          subtitle={currentUnit ? `Direct ${typeLabels[nextChildType[currentUnit.type] as UnitType] || 'Task'} children only` : 'Direct epics only'}
          units={children}
          onMoveUnit={props.onMoveUnit}
          onOpenRoute={props.onOpenRoute}
          onOpenDetails={props.onOpenDetails}
          statusOptions={standardStatuses}
        />
      )}

      {currentUnit && (
        <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
          <UnitCommentsSection
            comments={props.commentsByUnit.get(currentUnit.id) || []}
            userById={props.userById}
            suggestions={props.suggestions}
            commentBody={props.commentBody}
            onCommentBodyChange={props.onCommentBodyChange}
            onInsertCommentMention={props.onInsertCommentMention}
            onSaveComment={(event) => props.onSaveComment(event, currentUnit.id)}
          />
        </section>
      )}
    </section>
  )
}

function KanbanBoard(props: {
  project: Project
  userById: Record<string, User>
  title: string
  subtitle: string
  units: Unit[]
  onMoveUnit: (unitId: string, status: UnitStatus) => void
  onOpenRoute: (unit: Unit) => void
  onOpenDetails: (unit: Unit) => void
  statusOptions: Array<{ key: UnitStatus; label: string }>
}) {
  return (
    <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-4 shadow-panel">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold">{props.title}</h2>
          <p class="mt-1 text-xs text-base-content/80">{props.subtitle}</p>
        </div>
        <span class="text-xs text-base-content/75">Drag cards between lanes</span>
      </div>
      <div class="grid gap-4 xl:grid-cols-4">
        {props.statusOptions.map((status) => {
          const laneUnits = props.units
            .filter((unit) => unit.status === status.key)
            .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))

          return (
            <div
              class="rounded-xl border border-base-300 bg-base-200/60 p-2.5"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const unitId = event.dataTransfer?.getData('text/unit-id')
                if (unitId) props.onMoveUnit(unitId, status.key)
              }}
            >
              <div class="mb-3 flex items-center justify-between">
                <span class="font-semibold">{status.label}</span>
                <span class="badge">{laneUnits.length}</span>
              </div>
              <div class="space-y-3">
                {laneUnits.map((unit) => (
                  <UnitKanbanCard project={props.project} userById={props.userById} unit={unit} onOpenRoute={props.onOpenRoute} onOpenDetails={props.onOpenDetails} />
                ))}
                {!laneUnits.length && <div class="rounded-xl border border-dashed border-base-300 px-3 py-5 text-center text-xs text-base-content/75">No items</div>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function UnitKanbanCard(props: { project: Project; userById: Record<string, User>; unit: Unit; onOpenRoute: (unit: Unit) => void; onOpenDetails: (unit: Unit) => void }) {
  return (
    <article
      draggable
      class="rounded-xl border border-base-300 bg-base-100 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50"
      style={statusBorderStyle(props.project, props.unit.status)}
      onDragStart={(event) => event.dataTransfer?.setData('text/unit-id', props.unit.id)}
      onClick={() => props.onOpenRoute(props.unit)}
    >
      <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-base-content/75">
        <span class="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: props.unit.color }} />
        <span>{typeLabels[props.unit.type]}</span>
      </div>
      <button
        class="mt-1.5 block text-left text-sm font-semibold hover:text-primary"
        onClick={(event) => {
          event.stopPropagation()
          props.onOpenDetails(props.unit)
        }}
      >
        {props.unit.title}
      </button>
      {props.unit.assigneeId && <div class="mt-1.5"><AssigneeBadge assignee={props.userById[props.unit.assigneeId]} fallbackId={props.unit.assigneeId} /></div>}
      <div class="mt-1.5 line-clamp-3 text-xs text-base-content/90">{plainText(props.unit.description) || 'No description yet.'}</div>
    </article>
  )
}

function UnitDetailContent(props: {
  unit: Unit
  comments: Comment[]
  userById: Record<string, User>
  suggestions: Suggestions
  commentBody: string
  onCommentBodyChange: (value: string) => void
  onInsertCommentMention: (mention: Mention) => void
  onSaveComment: (event: Event) => void
  onEdit?: () => void
  onCreateChild?: () => void
  hideActions?: boolean
  hideComments?: boolean
}) {
  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="badge badge-primary">{typeLabels[props.unit.type]}</span>
        <span class="badge badge-outline border-base-content/40 text-base-content">{statuses.find((status) => status.key === props.unit.status)?.label}</span>
        {props.unit.type === 'bug' && props.unit.priority && <PriorityBadge priority={props.unit.priority} />}
        {props.unit.assigneeId && <AssigneeBadge assignee={props.userById[props.unit.assigneeId]} fallbackId={props.unit.assigneeId} />}
        {props.unit.tags.map((tag) => (
          <span class="badge badge-outline border-base-content/40 text-base-content">{tag}</span>
        ))}
      </div>

      <div class="rounded-2xl border border-base-300 bg-base-100 p-4">
        <CollapsibleMarkdown title="Description" source={props.unit.description || '*No description yet.*'} />
      </div>

      {!props.hideActions && (
        <div class="flex flex-wrap gap-2">
          {props.onEdit && (
            <button class="btn btn-primary btn-sm" onClick={props.onEdit}>
              <Pencil size={16} />
              Edit item
            </button>
          )}
          {props.onCreateChild && (
            <button class="btn btn-outline btn-sm" onClick={props.onCreateChild}>
              <Plus size={16} />
              Add child
            </button>
          )}
        </div>
      )}

      {!props.hideComments && (
        <UnitCommentsSection
          comments={props.comments}
          userById={props.userById}
          suggestions={props.suggestions}
          commentBody={props.commentBody}
          onCommentBodyChange={props.onCommentBodyChange}
          onInsertCommentMention={props.onInsertCommentMention}
          onSaveComment={props.onSaveComment}
        />
      )}
    </div>
  )
}

function UnitCommentsSection(props: {
  comments: Comment[]
  userById: Record<string, User>
  suggestions: Suggestions
  commentBody: string
  onCommentBodyChange: (value: string) => void
  onInsertCommentMention: (mention: Mention) => void
  onSaveComment: (event: Event) => void
}) {
  return (
    <div class="space-y-5">
      <section>
        <h3 class="mb-3 text-lg font-bold">Comments</h3>
        <div class="space-y-3">
          {props.comments.map((comment) => (
            <article class="rounded-2xl border border-base-300 bg-base-100 p-4">
              <div class="mb-3 flex items-center gap-3">
                <img class="h-10 w-10 rounded-full" src={props.userById[comment.authorId]?.gravatar || gravatar(props.userById[comment.authorId]?.email || '')} alt={props.userById[comment.authorId]?.name || 'User'} />
                <div>
                  <div class="font-semibold">{props.userById[comment.authorId]?.name || 'Unknown user'}</div>
                  <div class="text-xs text-base-content/80">{new Date(comment.created).toLocaleString()}</div>
                </div>
              </div>
              <Markdown source={comment.body} />
            </article>
          ))}
          {!props.comments.length && <div class="rounded-2xl border border-dashed border-base-300 p-4 text-sm text-base-content/80">No comments yet.</div>}
        </div>
      </section>

      <form class="space-y-4 rounded-2xl border border-base-300 bg-base-200/60 p-4" onSubmit={props.onSaveComment}>
        <Field label="Add comment">
          <textarea class="textarea textarea-bordered min-h-28 w-full" value={props.commentBody} onInput={(e) => props.onCommentBodyChange((e.currentTarget as HTMLTextAreaElement).value)} />
        </Field>
        <div class="grid gap-4 lg:grid-cols-2">
          <MentionPanel title="Mention users" items={props.suggestions.users.map((item) => ({ id: item.id, label: item.label, type: 'user' as const }))} onPick={props.onInsertCommentMention} />
          <MentionPanel title="Mention items" items={props.suggestions.units.map((item) => ({ id: item.id, label: item.label, type: 'unit' as const }))} onPick={props.onInsertCommentMention} />
        </div>
        <button class="btn btn-primary" type="submit">
          Save comment
        </button>
      </form>
    </div>
  )
}

function Breadcrumbs(props: { project: Project; chain: Unit[]; task: Unit | null; unitById: Record<string, Unit>; navigate: (path: string, replace?: boolean) => void }) {
  const items = [{ label: props.project.name, path: projectKanbanPath(props.project.id) }]
  for (const unit of props.chain) {
    items.push({ label: unit.title, path: buildUnitPath(props.project.id, props.unitById, unit.id) })
  }
  if (props.task) {
    items.push({ label: props.task.title, path: buildUnitPath(props.project.id, props.unitById, props.task.id) })
  }

  return (
    <div class="breadcrumbs text-sm text-base-content/80">
      <ul>
        {items.map((item, index) => (
          <li>
            <button class={index === items.length - 1 ? 'font-semibold text-base-content' : 'hover:text-primary'} onClick={() => props.navigate(item.path)}>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Modal(props: { title: string; onClose: () => void; wide?: boolean; children: ComponentChildren }) {
  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-neutral/40 p-4 backdrop-blur-sm">
      <div class={`mt-6 w-full rounded-[1.25rem] border border-base-300 bg-base-100 p-5 shadow-panel ${props.wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <div class="mb-4 flex items-center justify-between gap-4">
          <h2 class="text-xl font-black">{props.title}</h2>
          <button class="btn btn-ghost btn-sm h-8 min-h-8" onClick={props.onClose} title="Close" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

function Field(props: { label: string; children: ComponentChildren }) {
  return (
    <label class="form-control gap-2">
      <span class="font-medium">{props.label}</span>
      {props.children}
    </label>
  )
}

function ValueCard(props: { title: string; body: string }) {
  return (
    <div class="rounded-xl border border-base-300 bg-base-100/80 p-3">
      <h3 class="text-sm font-bold">{props.title}</h3>
      <p class="mt-1.5 text-xs text-base-content/82">{props.body}</p>
    </div>
  )
}

function TagEditor(props: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  return (
    <div class="space-y-2">
      <span class="font-medium">Tags</span>
      <div class="flex flex-wrap gap-2">
        {props.tags.map((tag) => (
          <button class="badge badge-primary gap-2 px-3 py-3" type="button" onClick={() => props.onChange(props.tags.filter((item) => item !== tag))}>
            {tag}
            <span>x</span>
          </button>
        ))}
      </div>
      <div class="flex gap-2">
        <input list="tag-options" class="input input-bordered flex-1" placeholder="Add a tag" value={draft} onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)} />
        <button
          class="btn btn-outline"
          type="button"
          onClick={() => {
            const next = draft.trim()
            if (!next) return
            props.onChange([...props.tags, next])
            setDraft('')
          }}
        >
          <Plus size={16} />
          Add
        </button>
      </div>
      <datalist id="tag-options">
        {props.suggestions.map((tag) => (
          <option value={tag} />
        ))}
      </datalist>
    </div>
  )
}

function UserPicker(props: { users: User[]; value?: string; onChange: (userId?: string) => void }) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const selectedUser = props.users.find((user) => user.id === props.value)
  const filteredUsers = props.users.filter((user) => {
    if (!normalized) return true
    return user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized)
  })

  return (
    <div class="space-y-2 rounded-xl border border-base-300 bg-base-100 p-3">
      <input class="input input-bordered input-sm w-full" placeholder={selectedUser ? `Assigned to ${selectedUser.name}` : 'Search all users'} value={query} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
      <div class="flex items-center justify-between text-xs text-base-content/75">
        <span>{selectedUser ? `Selected: ${selectedUser.name}` : 'Unassigned'}</span>
        {props.value && (
          <button class="link text-xs" type="button" onClick={() => props.onChange(undefined)}>
            Clear
          </button>
        )}
      </div>
      <div class="max-h-44 space-y-1 overflow-auto">
        {filteredUsers.map((user) => {
          const selected = user.id === props.value
          return (
            <button
              type="button"
              class={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${selected ? 'bg-primary/15 text-base-content' : 'hover:bg-base-200/80'}`}
              onClick={() => props.onChange(user.id)}
            >
              <img class="h-7 w-7 rounded-full" src={user.gravatar || gravatar(user.email)} alt={user.name} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{user.name}</span>
                <span class="block truncate text-xs text-base-content/75">{user.email}</span>
              </span>
              {selected && <Check size={14} class="shrink-0 text-primary" />}
            </button>
          )
        })}
        {!filteredUsers.length && <div class="rounded-lg border border-dashed border-base-300 px-3 py-2 text-xs text-base-content/75">No users match that search.</div>}
      </div>
    </div>
  )
}

function AssigneeBadge(props: { assignee?: User; fallbackId?: string }) {
  const label = props.assignee?.name || props.assignee?.email || props.fallbackId
  if (!label) return null
  return (
    <span class="inline-flex items-center gap-2 rounded-full border border-base-content/25 px-2.5 py-1 text-xs text-base-content/85">
      <img class="h-4 w-4 rounded-full" src={props.assignee?.gravatar || gravatar(props.assignee?.email || '')} alt={label} />
      <span class="max-w-36 truncate">{label}</span>
    </span>
  )
}

function ColorPicker(props: { value: string; onChange: (value: string) => void }) {
  return (
    <div class="space-y-3">
      <div class="flex flex-wrap gap-2">
        {presetColors.map((color) => (
          <button
            type="button"
            class={`h-10 w-10 rounded-full border-4 transition ${props.value.toLowerCase() === color.toLowerCase() ? 'border-neutral scale-105' : 'border-base-300'}`}
            style={{ backgroundColor: color }}
            onClick={() => props.onChange(color)}
            aria-label={`Choose color ${color}`}
          />
        ))}
      </div>
      <div class="flex items-center gap-3">
        <input class="h-11 w-16 cursor-pointer rounded border border-base-300 bg-transparent p-1" type="color" value={props.value} onInput={(e) => props.onChange((e.currentTarget as HTMLInputElement).value)} />
        <input class="input input-bordered flex-1" value={props.value} onInput={(e) => props.onChange((e.currentTarget as HTMLInputElement).value)} />
      </div>
    </div>
  )
}

function MentionPanel(props: { title: string; items: Mention[]; onPick: (mention: Mention) => void }) {
  return (
    <div class="rounded-xl border border-base-300 bg-base-100 p-3">
      <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/85">{props.title}</div>
      <div class="flex max-h-36 flex-wrap gap-2 overflow-auto">
        {props.items.slice(0, 12).map((item) => (
          <button class="badge badge-outline border-base-content/40 bg-base-100 px-2.5 py-2 text-base-content" type="button" onClick={() => props.onPick(item)}>
            {item.label}
          </button>
        ))}
        {!props.items.length && <span class="text-xs text-base-content/75">No suggestions</span>}
      </div>
    </div>
  )
}

function Markdown(props: { source: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(props.source, { breaks: true }) as string), [props.source])
  return <div class="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
}

function CollapsibleMarkdown(props: { title: string; source: string }) {
  const preview = plainText(props.source)
  return (
    <details class="group" open={false}>
      <summary class="flex cursor-pointer list-none items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="font-semibold">{props.title}</div>
          <div class="mt-1 line-clamp-2 text-sm text-base-content/82">{preview || 'No description yet.'}</div>
        </div>
        <div class="tooltip tooltip-left" data-tip={preview ? 'Expand description' : 'Show description'}>
          <span class="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 bg-base-200/60 text-base-content/75">
            <ChevronRight class="group-open:hidden" size={16} />
            <ChevronDown class="hidden group-open:block" size={16} />
          </span>
        </div>
      </summary>
      <div class="mt-4 border-t border-base-300 pt-4">
        <Markdown source={props.source} />
      </div>
    </details>
  )
}

function UnitTreeNode(props: {
  project: Project
  node: BacklogDisplayNode
  userById: Record<string, User>
  commentsByUnit: Map<string, Comment[]>
  onOpenRoute: (unit: Unit) => void
  onOpenDetails: (unit: Unit) => void
  onEdit: (unit: Unit) => void
  onCreateChild: (unit: Unit) => void
}) {
  const { node } = props
  const { unit, implicit, children } = node
  return (
    <div
      class={`rounded-xl border border-base-300 p-3 ${implicit ? 'bg-base-200/30 opacity-70' : 'bg-base-100'}`}
      style={statusBorderStyle(props.project, unit.status)}
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class={`min-w-0 flex-1 ${implicit ? '' : 'cursor-pointer'}`} onClick={() => !implicit && props.onOpenRoute(unit)}>
          <div class={`flex items-center gap-2 uppercase tracking-[0.2em] text-base-content/75 ${implicit ? 'text-[10px]' : 'text-xs'}`}>
            <span class={`${implicit ? 'h-2.5 w-2.5' : 'h-3 w-3'} rounded-full`} style={{ backgroundColor: unit.color }} />
            <span>{typeLabels[unit.type]}</span>
          </div>
          {implicit ? (
            <div class="mt-1 text-sm font-semibold text-base-content/80">{unit.title}</div>
          ) : (
            <>
              <button
                class="mt-1.5 block text-left text-base font-semibold hover:text-primary"
                onClick={(event) => {
                  event.stopPropagation()
                  props.onOpenDetails(unit)
                }}
              >
                {unit.title}
              </button>
              <div class="mt-1.5">
                <CompactDescription source={unit.description} />
              </div>
              {unit.assigneeId && <div class="mt-2"><AssigneeBadge assignee={props.userById[unit.assigneeId]} fallbackId={unit.assigneeId} /></div>}
            </>
          )}
        </div>
        {!implicit && (
          <div class="flex gap-2">
            <button class="btn btn-outline btn-xs" onClick={() => props.onEdit(unit)} title="Edit item" aria-label="Edit item">
              <Pencil size={14} />
            </button>
            {nextChildType[unit.type] && (
              <button class="btn btn-primary btn-xs" onClick={() => props.onCreateChild(unit)} title="Add child" aria-label="Add child">
                <Plus size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      {!implicit && (
        <div class="mt-3 flex flex-wrap gap-2">
          <span class="badge badge-outline border-base-content/40 text-base-content">{statuses.find((status) => status.key === unit.status)?.label}</span>
          <span class="badge badge-outline border-base-content/40 text-base-content">{props.commentsByUnit.get(unit.id)?.length || 0} comments</span>
          {unit.tags.map((tag) => (
            <span class="badge">{tag}</span>
          ))}
        </div>
      )}
      {!!children.length && (
        <div class="mt-4 space-y-3 border-l-2 border-base-300 pl-4">
          {children.map((child) => (
            <UnitTreeNode project={props.project} node={child} userById={props.userById} commentsByUnit={props.commentsByUnit} onOpenRoute={props.onOpenRoute} onOpenDetails={props.onOpenDetails} onEdit={props.onEdit} onCreateChild={props.onCreateChild} />
          ))}
        </div>
      )}
    </div>
  )
}

function CompactDescription(props: { source: string }) {
  const preview = plainText(props.source)
  if (!preview) {
    return <div class="text-xs text-base-content/75">No description yet.</div>
  }

  return (
    <details class="group max-w-full">
      <summary class="flex cursor-pointer list-none items-start gap-2 text-xs text-base-content/90">
        <span class="line-clamp-2 flex-1">{preview}</span>
        <span class="tooltip tooltip-left shrink-0" data-tip="Expand description">
          <span class="inline-flex h-5 w-5 items-center justify-center rounded-md border border-base-300 bg-base-200/60 text-base-content/75">
            <ChevronRight class="group-open:hidden" size={12} />
            <ChevronDown class="hidden group-open:block" size={12} />
          </span>
        </span>
      </summary>
      <div class="mt-2 rounded-lg border border-base-300 bg-base-200/40 p-2">
        <Markdown source={props.source} />
      </div>
    </details>
  )
}

function buildBacklogNodes(unit: Unit, treeByParent: Map<string, Unit[]>, selectedTypes: Set<UnitType>, hasVisibleAncestor: boolean): BacklogDisplayNode[] {
  const selected = selectedTypes.has(unit.type)
  const children = (treeByParent.get(unit.id) || []).flatMap((child) => buildBacklogNodes(child, treeByParent, selectedTypes, hasVisibleAncestor || selected))
  if (selected) {
    return [{ unit, implicit: false, children }]
  }
  if (!children.length) {
    return []
  }
  if (hasVisibleAncestor) {
    return [{ unit, implicit: true, children }]
  }
  return children
}

function countBacklogNodes(nodes: BacklogDisplayNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countBacklogNodes(node.children), 0)
}

function ApiDocsPage(props: { project: Project; projects: Project[]; units: Unit[] }) {
  const base = '/api/agilerr'
  const [selectedProjectId, setSelectedProjectId] = useState(props.project.id)
  const [selectedUnitId, setSelectedUnitId] = useState(props.units[0]?.id || '')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const selectedProject = props.projects.find((project) => project.id === selectedProjectId) || props.project
  const selectedUnit = props.units.find((unit) => unit.id === selectedUnitId) || props.units[0] || null

  useEffect(() => {
    setSelectedProjectId(props.project.id)
  }, [props.project.id])

  useEffect(() => {
    if (!props.units.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(props.units[0]?.id || '')
    }
  }, [props.units, selectedUnitId])

  const endpoints = [
    {
      key: 'me',
      method: 'GET',
      path: `${base}/me`,
      description: 'Return the authenticated user profile used by the app shell.',
      curl: `curl -X GET ${base}/me \\\n  -H "Authorization: <pb_auth_token>"`,
    },
    {
      key: 'projects-list',
      method: 'GET',
      path: `${base}/projects`,
      description: 'List projects visible to the authenticated user.',
      curl: `curl -X GET ${base}/projects \\\n  -H "Authorization: <pb_auth_token>"`,
    },
    {
      key: 'projects-create',
      method: 'POST',
      path: `${base}/projects`,
      description: 'Create a project with name, description, color, and tags.',
      curl: `curl -X POST ${base}/projects \\\n  -H "Authorization: <pb_auth_token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "name": "Platform refresh",\n    "description": "Main delivery project",\n    "color": "#2563eb",\n    "tags": ["platform", "delivery"]\n  }'`,
    },
    {
      key: 'project-update',
      method: 'PATCH',
      path: `${base}/projects/${selectedProject.id}`,
      description: 'Update the selected project metadata and color settings.',
      variables: [{ label: 'Project', type: 'project' as const }],
      curl: `curl -X PATCH ${base}/projects/${selectedProject.id} \\\n  -H "Authorization: <pb_auth_token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "name": "${selectedProject.name}",\n    "description": "${escapeJson(selectedProject.description || 'Updated project description')}"\n  }'`,
    },
    {
      key: 'project-tree',
      method: 'GET',
      path: `${base}/projects/${selectedProject.id}`,
      description: 'Fetch the selected project, items, comments, users, and tag suggestions in a single response.',
      variables: [{ label: 'Project', type: 'project' as const }],
      curl: `curl -X GET ${base}/projects/${selectedProject.id} \\\n  -H "Authorization: <pb_auth_token>"`,
    },
    {
      key: 'project-suggest',
      method: 'GET',
      path: `${base}/projects/${selectedProject.id}/suggest?q=backlog`,
      description: 'Return tag, user, and item suggestions for mentions and tagging.',
      variables: [{ label: 'Project', type: 'project' as const }],
      curl: `curl -X GET "${base}/projects/${selectedProject.id}/suggest?q=backlog" \\\n  -H "Authorization: <pb_auth_token>"`,
    },
    {
      key: 'units-create',
      method: 'POST',
      path: `${base}/projects/${selectedProject.id}/units`,
      description: 'Create a new item under the selected project.',
      variables: [{ label: 'Project', type: 'project' as const }],
      curl: `curl -X POST ${base}/projects/${selectedProject.id}/units \\\n  -H "Authorization: <pb_auth_token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "type": "epic",\n    "status": "todo",\n    "title": "Ship onboarding",\n    "description": "Create the onboarding experience",\n    "tags": ["onboarding", "mvp"]\n  }'`,
    },
    {
      key: 'units-update',
      method: 'PATCH',
      path: `${base}/units/${selectedUnit?.id || '[select-item]'}`,
      description: 'Edit the selected item.',
      variables: [{ label: 'Item', type: 'unit' as const }],
      curl: `curl -X PATCH ${base}/units/${selectedUnit?.id || '<unit_id>'} \\\n  -H "Authorization: <pb_auth_token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "title": "${escapeJson(selectedUnit?.title || 'Updated title')}",\n    "status": "${selectedUnit?.status || 'todo'}"\n  }'`,
    },
    {
      key: 'units-move',
      method: 'POST',
      path: `${base}/units/${selectedUnit?.id || '[select-item]'}/move`,
      description: 'Move the selected item between kanban lanes using a status body.',
      variables: [{ label: 'Item', type: 'unit' as const }],
      curl: `curl -X POST ${base}/units/${selectedUnit?.id || '<unit_id>'}/move \\\n  -H "Authorization: <pb_auth_token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "status": "in_progress"\n  }'`,
    },
    {
      key: 'units-delete',
      method: 'DELETE',
      path: `${base}/units/${selectedUnit?.id || '[select-item]'}`,
      description: 'Delete the selected item after its child items are removed.',
      variables: [{ label: 'Item', type: 'unit' as const }],
      curl: `curl -X DELETE ${base}/units/${selectedUnit?.id || '<unit_id>'} \\\n  -H "Authorization: <pb_auth_token>"`,
    },
    {
      key: 'comments-list',
      method: 'GET',
      path: `${base}/units/${selectedUnit?.id || '[select-item]'}/comments`,
      description: 'List comments for the selected item.',
      variables: [{ label: 'Item', type: 'unit' as const }],
      curl: `curl -X GET ${base}/units/${selectedUnit?.id || '<unit_id>'}/comments \\\n  -H "Authorization: <pb_auth_token>"`,
    },
    {
      key: 'comments-create',
      method: 'POST',
      path: `${base}/units/${selectedUnit?.id || '[select-item]'}/comments`,
      description: 'Create a markdown comment with optional mentions.',
      variables: [{ label: 'Item', type: 'unit' as const }],
      curl: `curl -X POST ${base}/units/${selectedUnit?.id || '<unit_id>'}/comments \\\n  -H "Authorization: <pb_auth_token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "body": "Looks good from API docs."\n  }'`,
    },
    {
      key: 'smart-add',
      method: 'POST',
      path: `${base}/smart-add`,
      description: 'Refine a draft item using the configured OpenAI endpoint.',
      curl: `curl -X POST ${base}/smart-add \\\n  -H "Authorization: <pb_auth_token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "unitType": "story",\n    "title": "Tighten login flow",\n    "description": "Make the login flow clearer for new users",\n    "messages": []\n  }'`,
    },
  ]

  async function handleCopy(endpointKey: string, curl: string) {
    setExpandedKey(endpointKey)
    try {
      await navigator.clipboard.writeText(curl)
      setCopiedKey(endpointKey)
      window.setTimeout(() => setCopiedKey((current) => (current === endpointKey ? null : current)), 1600)
    } catch {
      setCopiedKey(null)
    }
  }

  return (
    <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
      <h2 class="text-lg font-bold">API Usage</h2>
      <p class="mt-2 text-sm text-base-content/82">All endpoints below require the PocketBase auth token in the `Authorization` header. Variable segments use the dropdowns shown on each endpoint.</p>
      <div class="mt-6 space-y-4">
        {endpoints.map((endpoint) => (
          <ApiEndpointCard
            key={endpoint.key}
            endpoint={endpoint}
            copied={copiedKey === endpoint.key}
            expanded={expandedKey === endpoint.key}
            projects={props.projects}
            selectedProjectId={selectedProjectId}
            onProjectChange={setSelectedProjectId}
            units={props.units}
            selectedUnitId={selectedUnitId}
            onUnitChange={setSelectedUnitId}
            onCopy={handleCopy}
          />
        ))}
      </div>
    </section>
  )
}

function ApiEndpointCard(props: {
  endpoint: {
    key: string
    method: string
    path: string
    description: string
    curl: string
    variables?: Array<{ label: string; type: 'project' | 'unit' }>
  }
  projects: Project[]
  selectedProjectId: string
  onProjectChange: (projectId: string) => void
  units: Unit[]
  selectedUnitId: string
  onUnitChange: (unitId: string) => void
  copied: boolean
  expanded: boolean
  onCopy: (endpointKey: string, curl: string) => void
}) {
  return (
    <div class="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div class="p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-3">
              <span class="badge badge-primary">{props.endpoint.method}</span>
              <code class="rounded bg-base-200 px-2 py-1 text-sm break-all">{props.endpoint.path}</code>
            </div>
            <p class="mt-2 text-xs text-base-content/82">{props.endpoint.description}</p>
          </div>
          <button class="btn btn-outline btn-xs gap-2" onClick={() => void props.onCopy(props.endpoint.key, props.endpoint.curl)}>
            <Copy size={14} />
            {props.copied ? 'Copied' : 'Copy curl'}
          </button>
        </div>
        {!!props.endpoint.variables?.length && (
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            {props.endpoint.variables.map((variable) =>
              variable.type === 'project' ? (
                <label class="form-control gap-1" key={variable.label}>
                  <span class="text-xs font-medium text-base-content/75">{variable.label}</span>
                  <select class="select select-bordered select-sm w-full" value={props.selectedProjectId} onChange={(event) => props.onProjectChange((event.currentTarget as HTMLSelectElement).value)}>
                    {props.projects.map((project) => (
                      <option value={project.id}>
                        {project.name} - {project.id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label class="form-control gap-1" key={variable.label}>
                  <span class="text-xs font-medium text-base-content/75">{variable.label}</span>
                  <select class="select select-bordered select-sm w-full" value={props.selectedUnitId} onChange={(event) => props.onUnitChange((event.currentTarget as HTMLSelectElement).value)}>
                    {!props.units.length && <option value="">No items loaded</option>}
                    {props.units.map((unit) => (
                      <option value={unit.id}>
                        {typeLabels[unit.type]}: {unit.title} - {unit.id}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}
          </div>
        )}
      </div>
      <div class={`grid transition-all duration-300 ${props.expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div class="overflow-hidden">
          <div class="border-t border-base-300 bg-base-200/60 p-4">
            <pre class="overflow-auto rounded-xl bg-neutral p-4 text-xs text-neutral-content"><code>{props.endpoint.curl}</code></pre>
          </div>
        </div>
      </div>
    </div>
  )
}

function statusBorderStyle(project: Project, status: UnitStatus) {
  return {
    borderRightColor: project.statusColors[status],
    borderRightWidth: '4px',
  }
}

function statusLabel(status: UnitStatus) {
  return statuses.find((item) => item.key === status)?.label || status
}

function bugPriorityRank(priority?: string) {
  switch (priority) {
    case 'critical':
      return 0
    case 'high':
      return 1
    case 'medium':
      return 2
    case 'low':
      return 3
    default:
      return 4
  }
}

function PriorityBadge(props: { priority?: string }) {
  if (!props.priority) return null
  const label = bugPriorities.find((item) => item.key === props.priority)?.label || props.priority
  const badgeClass =
    props.priority === 'critical'
      ? 'badge-error'
      : props.priority === 'high'
        ? 'badge-warning'
        : props.priority === 'medium'
          ? 'badge-info'
          : 'badge-ghost'
  return <span class={`badge ${badgeClass}`}>{label}</span>
}

function parseRoute(pathname: string): AppRoute {
  const trimmed = pathname.replace(/\/+$/, '')
  const segments = (trimmed || '/').split('/').filter(Boolean)

  if (!segments.length) return { kind: 'root' }
  if (segments[0] === 'api' && segments.length === 1) return { kind: 'api' }
  if (segments[0] !== 'projects' || !segments[1]) return { kind: 'root' }

  const projectId = segments[1]
  if (segments.length === 2) return { kind: 'project', projectId, view: 'dashboard', chain: [] }
  if (segments[2] === 'kanban' && segments.length === 3) return { kind: 'project', projectId, view: 'kanban', chain: [] }
  if (segments[2] === 'backlog' && segments.length === 3) return { kind: 'project', projectId, view: 'backlog', chain: [] }
  if (segments[2] === 'bugs' && segments.length === 3) return { kind: 'project', projectId, view: 'bugs', chain: [] }
  if (segments[2] === 'api' && segments.length === 3) return { kind: 'project', projectId, view: 'api', chain: [] }
  if (segments[2] === 'settings' && segments.length === 3) return { kind: 'project', projectId, view: 'settings', chain: [] }

  const expected = ['epics', 'features', 'stories', 'tasks']
  const chain: string[] = []
  let taskId: string | undefined
  let index = 2
  let step = 0
  while (index < segments.length) {
    const label = segments[index]
    const id = segments[index + 1]
    if (!id || label !== expected[step]) {
      return { kind: 'project', projectId, view: 'kanban', chain, taskId, invalid: true }
    }
    if (label === 'tasks') {
      taskId = id
    } else {
      chain.push(id)
    }
    index += 2
    step += 1
  }

  return { kind: 'project', projectId, view: 'kanban', chain, taskId }
}

function resolveRouteContext(route: Extract<AppRoute, { kind: 'project' }>, unitById: Record<string, Unit>): RouteContext {
  if (route.view !== 'kanban') {
    return { projectId: route.projectId, currentUnit: null, chainUnits: [], taskUnit: null, invalid: false }
  }

  const chainUnits: Unit[] = []
  let invalid = Boolean(route.invalid)
  let parentId: string | undefined

  route.chain.forEach((unitId, index) => {
    const unit = unitById[unitId]
    const expectedType = (['epic', 'feature', 'story'] as UnitType[])[index]
    if (!unit || unit.type !== expectedType || unit.parentId !== parentId) {
      invalid = true
      return
    }
    chainUnits.push(unit)
    parentId = unit.id
  })

  let taskUnit: Unit | null = null
  if (route.taskId) {
    const unit = unitById[route.taskId]
    if (!unit || unit.type !== 'task' || unit.parentId !== parentId) {
      invalid = true
    } else {
      taskUnit = unit
    }
  }

  const currentUnit = chainUnits[chainUnits.length - 1] || null
  return { projectId: route.projectId, currentUnit, chainUnits, taskUnit, invalid }
}

function projectDashboardPath(projectId: string) {
  return `/projects/${projectId}`
}

function projectKanbanPath(projectId: string) {
  return `/projects/${projectId}/kanban`
}

function projectBacklogPath(projectId: string) {
  return `/projects/${projectId}/backlog`
}

function apiPath() {
  return '/api'
}

function projectBugsPath(projectId: string) {
  return `/projects/${projectId}/bugs`
}

function projectSettingsPath(projectId: string) {
  return `/projects/${projectId}/settings`
}

function projectPathForSelection(projectId: string, page: ProjectPage | null) {
  if (page === 'dashboard') return projectDashboardPath(projectId)
  if (page === 'backlog') return projectBacklogPath(projectId)
  if (page === 'kanban') return projectKanbanPath(projectId)
  if (page === 'bugs') return projectBugsPath(projectId)
  if (page === 'settings') return projectSettingsPath(projectId)
  return projectDashboardPath(projectId)
}

function taskParentPath(route: Extract<AppRoute, { kind: 'project' }>) {
  if (!route.taskId) return projectKanbanPath(route.projectId)
  const parts = route.chain.flatMap((id, index) => {
    const label = ['epics', 'features', 'stories'][index]
    return [label, id]
  })
  return `/projects/${route.projectId}/${parts.join('/')}`
}

function buildUnitPath(projectId: string, unitById: Record<string, Unit>, unitId: string) {
  const chain: Unit[] = []
  let current: Unit | undefined = unitById[unitId]
  while (current) {
    chain.push(current)
    current = current.parentId ? unitById[current.parentId] : undefined
  }
  chain.reverse()
  if (!chain.length) return projectKanbanPath(projectId)
  const segments = chain.flatMap((unit) => [pluralSegments[unit.type], unit.id])
  return `/projects/${projectId}/${segments.join('/')}`
}

function plainText(markdown: string) {
  return markdown.replace(/[#_*`\[\]\(\)!>-]/g, '').replace(/\s+/g, ' ').trim()
}

function escapeJson(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function gravatar(email: string) {
  return `https://www.gravatar.com/avatar/${md5((email || '').trim().toLowerCase())}?d=identicon&s=120`
}
