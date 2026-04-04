import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FolderKanban,
  LayoutGrid,
  LogOut,
  Pencil,
  Plus,
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
  SmartAddMessage,
  Suggestions,
  Unit,
  UnitStatus,
  UnitType,
  User,
} from './types'

const statuses: Array<{ key: UnitStatus; label: string }> = [
  { key: 'todo', label: 'Todo' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]

const typeLabels: Record<UnitType, string> = {
  epic: 'Epic',
  feature: 'Feature',
  story: 'User Story',
  task: 'Task',
}

const pluralSegments: Record<UnitType, string> = {
  epic: 'epics',
  feature: 'features',
  story: 'stories',
  task: 'tasks',
}

const nextChildType: Record<UnitType, UnitType | null> = {
  epic: 'feature',
  feature: 'story',
  story: 'task',
  task: null,
}

const presetColors = ['#c2410c', '#2563eb', '#0f766e', '#7c3aed', '#e11d48']

const defaultColors: Record<UnitType, string> = {
  epic: presetColors[0],
  feature: presetColors[1],
  story: presetColors[2],
  task: presetColors[3],
}

type UnitDraft = {
  id?: string
  projectId: string
  parentId?: string
  type: UnitType
  status: UnitStatus
  title: string
  description: string
  color: string
  tags: string[]
}

type AppRoute =
  | { kind: 'root' }
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

const emptyProjectDraft = {
  name: '',
  description: '',
  color: presetColors[1],
  tags: [] as string[],
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
  const [projectEditorOpen, setProjectEditorOpen] = useState(false)
  const [projectEditor, setProjectEditor] = useState(emptyProjectDraft)
  const [unitEditor, setUnitEditor] = useState<UnitDraft | null>(null)
  const [detailUnitId, setDetailUnitId] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [commentMentions, setCommentMentions] = useState<Mention[]>([])
  const [suggestions, setSuggestions] = useState<Suggestions>({ units: [], users: [], tags: [] })
  const [smartAddOpen, setSmartAddOpen] = useState(false)
  const [smartAddMessages, setSmartAddMessages] = useState<SmartAddMessage[]>([])
  const [smartAddInput, setSmartAddInput] = useState('')
  const [smartAddLoading, setSmartAddLoading] = useState(false)
  const [smartAddSuggestion, setSmartAddSuggestion] = useState<{ title: string; description: string } | null>(null)

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

  const selectedProjectId = route.kind === 'project' ? route.projectId : null

  useEffect(() => {
    if (!selectedProjectId || !currentUser) {
      setTree(null)
      return
    }
    void loadProject(selectedProjectId)
    void loadSuggestions(selectedProjectId)
  }, [selectedProjectId, currentUser])

  const units = tree?.units ?? []
  const comments = tree?.comments ?? []
  const users = tree?.users ?? []
  const selectedProject = tree?.project.id === selectedProjectId ? tree.project : projects.find((project) => project.id === selectedProjectId) || null
  const unitById = useMemo<Record<string, Unit>>(() => Object.fromEntries(units.map((unit) => [unit.id, unit])), [units])
  const userById = useMemo<Record<string, User>>(() => Object.fromEntries(users.map((user) => [user.id, user])), [users])
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
    for (const unit of units) {
      const key = unit.parentId || 'root'
      const bucket = map.get(key) || []
      bucket.push(unit)
      map.set(key, bucket)
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
    }
    return map
  }, [units])
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
      navigate(projectKanbanPath(response.project.id))
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
      setProjectEditorOpen(false)
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
        const fallback = unit.parentId ? buildUnitPath(unit.projectId, unitById, unit.parentId) : projectKanbanPath(unit.projectId)
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
      type,
      status: 'todo',
      title: '',
      description: '',
      color: defaultColors[type],
      tags: [],
    })
    resetSmartAdd()
  }

  function openEditUnit(unit: Unit) {
    setUnitEditor({
      id: unit.id,
      projectId: unit.projectId,
      parentId: unit.parentId,
      type: unit.type,
      status: unit.status,
      title: unit.title,
      description: unit.description,
      color: unit.color,
      tags: [...unit.tags],
    })
    resetSmartAdd()
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

  function resetSmartAdd() {
    setSmartAddOpen(false)
    setSmartAddMessages([])
    setSmartAddInput('')
    setSmartAddSuggestion(null)
  }

  async function runSmartAdd() {
    if (!unitEditor) return
    setSmartAddLoading(true)
    setError('')
    try {
      const nextMessages = smartAddInput.trim()
        ? [...smartAddMessages, { role: 'user' as const, content: smartAddInput.trim() }]
        : [...smartAddMessages]

      const result = await api.smartAdd({
        unitType: unitEditor.type,
        title: unitEditor.title,
        description: unitEditor.description,
        messages: nextMessages,
      })

      setSmartAddMessages([...nextMessages, { role: 'assistant', content: result.assistantMessage }])
      setSmartAddInput('')
      if (result.ready) {
        setSmartAddSuggestion({
          title: result.suggestedTitle,
          description: result.suggestedDescription,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smart Add failed')
    } finally {
      setSmartAddLoading(false)
    }
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
  const projectRouteInvalid = route.kind === 'project' && route.view === 'kanban' && routeContext?.invalid

  return (
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,transparent_20%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] text-base-content">
      <div class="grid min-h-screen lg:grid-cols-[260px,1fr]">
        <aside class="border-r border-base-300/50 bg-base-100/75 p-4 backdrop-blur">
          <div>
            <button class="text-left" onClick={() => navigate('/')}>
              <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Agilerr</p>
              <h1 class="mt-1.5 text-xl font-black">Workspace</h1>
            </button>
          </div>

          <div class="mt-5">
            <details class="dropdown w-full">
              <summary class="btn btn-outline btn-sm h-10 min-h-10 w-full justify-between">
                <span class="truncate">{selectedProject?.name || 'Select a project'}</span>
                <span class="inline-flex items-center gap-2 text-xs text-base-content/70">
                  <span>{projects.length} total</span>
                  <ChevronsUpDown size={14} />
                </span>
              </summary>
              <ul class="menu dropdown-content z-20 mt-2 w-full rounded-box border border-base-300 bg-base-100 p-2 shadow">
                {projects.map((project) => (
                  <li key={project.id}>
                    <button
                      class={selectedProjectId === project.id ? 'active' : ''}
                      onClick={() => navigate(projectPathForSelection(project.id, activePage))}
                    >
                      <span class="inline-flex items-center gap-2">
                        <span class="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                        <span>{project.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
                <li class="mt-1 border-t border-base-300 pt-1">
                  <button onClick={() => setProjectModalOpen(true)}>
                    <Plus size={16} />
                    Create new project
                  </button>
                </li>
              </ul>
            </details>
          </div>

          <nav class="mt-5">
            <ul class="menu rounded-box bg-base-100/75 p-2">
              <li>
                <button class={route.kind === 'root' ? 'active' : ''} onClick={() => navigate('/')}>
                  <LayoutGrid size={16} />
                  Projects
                </button>
              </li>
              <li>
                <button class={activePage === 'kanban' ? 'active' : ''} disabled={!selectedProjectId} onClick={() => selectedProjectId && navigate(projectKanbanPath(selectedProjectId))}>
                  <FolderKanban size={16} />
                  Kanban
                </button>
              </li>
              <li>
                <button class={activePage === 'backlog' ? 'active' : ''} disabled={!selectedProjectId} onClick={() => selectedProjectId && navigate(projectBacklogPath(selectedProjectId))}>
                  <BookOpen size={16} />
                  Backlog
                </button>
              </li>
              <li>
                <button class={activePage === 'api' ? 'active' : ''} disabled={!selectedProjectId} onClick={() => selectedProjectId && navigate(projectApiPath(selectedProjectId))}>
                  <SquarePen size={16} />
                  API
                </button>
              </li>
            </ul>
          </nav>

          <div class="mt-6 rounded-xl border border-base-300 bg-base-100 p-3">
            <div class="flex items-center gap-3">
              <img class="h-10 w-10 rounded-full ring-2 ring-base-300" src={currentUser.gravatar || gravatar(currentUser.email)} alt={currentUser.name} />
              <div>
                <div class="text-sm font-semibold">{currentUser.name}</div>
                <div class="text-xs text-base-content/85">{currentUser.email}</div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm mt-3 h-9 min-h-9 w-full" onClick={() => pb.authStore.clear()}>
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </aside>

        <main class="p-4 sm:p-5">
          {error && <div class="alert alert-error mb-4">{error}</div>}

          {route.kind === 'root' && (
            <ProjectDirectory
              projects={projects}
              onCreate={() => setProjectModalOpen(true)}
              onOpen={(projectId) => navigate(projectKanbanPath(projectId))}
            />
          )}

          {route.kind === 'project' && !tree && <div class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-6 shadow-panel">Loading project…</div>}

          {route.kind === 'project' && tree && (
            <>
              {route.view === 'backlog' && (
                <>
                  <ProjectHero project={tree.project} tags={tree.tags} onEdit={() => setProjectEditorOpen(true)} onAddEpic={() => openNewUnit(tree.project.id)} />
                  <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-4 shadow-panel">
                    <div class="mb-4 flex items-center justify-between">
                      <h2 class="text-lg font-bold">Backlog</h2>
                      <span class="text-xs text-base-content/75">{units.length} items</span>
                    </div>
                    <div class="space-y-3">
                      {(treeByParent.get('root') || []).map((unit) => (
                        <UnitTreeNode
                          key={unit.id}
                          unit={unit}
                          treeByParent={treeByParent}
                          commentsByUnit={commentsByUnit}
                          onOpenRoute={openUnitRoute}
                          onOpenDetails={openUnitDetails}
                          onEdit={openEditUnit}
                          onCreateChild={(target) => openNewUnit(tree.project.id, target)}
                        />
                      ))}
                      {!units.length && <div class="rounded-xl border border-dashed border-base-300 p-3 text-xs text-base-content/80">No items yet. Start with an Epic.</div>}
                    </div>
                  </section>
                </>
              )}

              {route.view === 'api' && (
                <>
                  <ProjectHero project={tree.project} tags={tree.tags} onEdit={() => setProjectEditorOpen(true)} onAddEpic={() => openNewUnit(tree.project.id)} />
                  <ApiDocsPage projectId={tree.project.id} />
                </>
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
                      unitById={unitById}
                      onEditProject={() => setProjectEditorOpen(true)}
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

      {projectEditorOpen && (
        <Modal title="Edit Project" onClose={() => setProjectEditorOpen(false)}>
          <form class="space-y-4" onSubmit={handleUpdateProject}>
            <Field label="Name">
              <input class="input input-bordered w-full" required value={projectEditor.name} onInput={(e) => setProjectEditor({ ...projectEditor, name: (e.currentTarget as HTMLInputElement).value })} />
            </Field>
            <Field label="Description">
              <textarea class="textarea textarea-bordered min-h-36 w-full" value={projectEditor.description} onInput={(e) => setProjectEditor({ ...projectEditor, description: (e.currentTarget as HTMLTextAreaElement).value })} />
            </Field>
            <Field label="Color">
              <ColorPicker value={projectEditor.color} onChange={(color) => setProjectEditor({ ...projectEditor, color })} />
            </Field>
            <TagEditor tags={projectEditor.tags} suggestions={tree?.tags || []} onChange={(tags) => setProjectEditor({ ...projectEditor, tags })} />
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost" type="button" onClick={() => setProjectEditorOpen(false)}>
                Cancel
              </button>
              <button class="btn btn-primary" type="submit">
                <SquarePen size={16} />
                Save project
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
                    onChange={(e) => setUnitEditor({ ...unitEditor, type: (e.currentTarget as HTMLSelectElement).value as UnitType })}
                  >
                    {(['epic', 'feature', 'story', 'task'] as UnitType[]).map((type) => (
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
                <Field label="Status">
                  <select class="select select-bordered w-full" value={unitEditor.status} onChange={(e) => setUnitEditor({ ...unitEditor, status: (e.currentTarget as HTMLSelectElement).value as UnitStatus })}>
                    {statuses.map((status) => (
                      <option value={status.key}>{status.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Parent">
                  <select class="select select-bordered w-full" value={unitEditor.parentId || ''} onChange={(e) => setUnitEditor({ ...unitEditor, parentId: (e.currentTarget as HTMLSelectElement).value || undefined })}>
                    <option value="">No parent</option>
                    {units
                      .filter((unit) => unit.id !== unitEditor.id)
                      .map((unit) => (
                        <option value={unit.id}>
                          {typeLabels[unit.type]}: {unit.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Color">
                  <ColorPicker value={unitEditor.color} onChange={(color) => setUnitEditor({ ...unitEditor, color })} />
                </Field>
                <TagEditor tags={unitEditor.tags} suggestions={tree?.tags || []} onChange={(tags) => setUnitEditor({ ...unitEditor, tags })} />

                <div class="rounded-2xl border border-base-300 bg-base-200/60 p-4">
                  <div class="mb-3 flex items-center justify-between">
                    <h3 class="font-semibold">Smart Add</h3>
                    <button class="btn btn-outline btn-sm" type="button" onClick={() => setSmartAddOpen((current) => !current)}>
                      {smartAddOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      {smartAddOpen ? 'Hide' : 'Open'}
                    </button>
                  </div>

                  {smartAddOpen && (
                    <div class="space-y-3">
                      <div class="max-h-60 space-y-2 overflow-auto rounded-2xl bg-base-100 p-3">
                        {smartAddMessages.map((message, index) => (
                          <div class={`chat ${message.role === 'user' ? 'chat-end' : 'chat-start'}`} key={`${message.role}-${index}`}>
                            <div class={`chat-bubble ${message.role === 'user' ? 'chat-bubble-primary' : ''}`}>{message.content}</div>
                          </div>
                        ))}
                        {!smartAddMessages.length && <p class="text-sm text-base-content/85">Ask the assistant to tighten the item or call out missing detail.</p>}
                      </div>
                      <textarea class="textarea textarea-bordered min-h-24 w-full" placeholder="What should be improved or clarified?" value={smartAddInput} onInput={(e) => setSmartAddInput((e.currentTarget as HTMLTextAreaElement).value)} />
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        {smartAddSuggestion ? (
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            onClick={() => {
                              setUnitEditor({
                                ...unitEditor,
                                title: smartAddSuggestion.title,
                                description: smartAddSuggestion.description,
                              })
                              setSmartAddOpen(false)
                            }}
                          >
                            Apply suggestion
                          </button>
                        ) : (
                          <span class="text-sm text-base-content/85">Configured with `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`.</span>
                        )}
                        <button class="btn btn-primary btn-sm" disabled={smartAddLoading} type="button" onClick={() => void runSmartAdd()}>
                          {smartAddLoading ? 'Thinking...' : 'Send to Smart Add'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
            <p class="mt-2 max-w-2xl text-sm text-base-content/85">Select a project to jump into the kanban flow, or create a new one from here.</p>
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

function ProjectHero(props: { project: Project; tags: string[]; onEdit: () => void; onAddEpic: () => void }) {
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
          <button class="btn btn-primary btn-sm h-9 min-h-9" onClick={props.onAddEpic} title="Add epic" aria-label="Add epic">
            <Plus size={16} />
            <span class="sr-only">Add epic</span>
          </button>
        </div>
      </div>
    </header>
  )
}

function KanbanRoutePage(props: {
  project: Project
  allTags: string[]
  routeContext: RouteContext | null
  treeByParent: Map<string, Unit[]>
  commentsByUnit: Map<string, Comment[]>
  userById: Record<string, User>
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
        <ProjectHero project={props.project} tags={props.allTags} onEdit={props.onEditProject} onAddEpic={props.onAddEpic} />
      )}

      {!taskUnit && (
        <KanbanBoard
          title={laneTitle}
          subtitle={currentUnit ? `Direct ${typeLabels[nextChildType[currentUnit.type] as UnitType] || 'Task'} children only` : 'Direct epics only'}
          units={children}
          onMoveUnit={props.onMoveUnit}
          onOpenRoute={props.onOpenRoute}
          onOpenDetails={props.onOpenDetails}
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
  title: string
  subtitle: string
  units: Unit[]
  onMoveUnit: (unitId: string, status: UnitStatus) => void
  onOpenRoute: (unit: Unit) => void
  onOpenDetails: (unit: Unit) => void
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
        {statuses.map((status) => {
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
                  <UnitKanbanCard unit={unit} onOpenRoute={props.onOpenRoute} onOpenDetails={props.onOpenDetails} />
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

function UnitKanbanCard(props: { unit: Unit; onOpenRoute: (unit: Unit) => void; onOpenDetails: (unit: Unit) => void }) {
  return (
    <article
      draggable
      class="rounded-xl border border-base-300 bg-base-100 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50"
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
  unit: Unit
  treeByParent: Map<string, Unit[]>
  commentsByUnit: Map<string, Comment[]>
  onOpenRoute: (unit: Unit) => void
  onOpenDetails: (unit: Unit) => void
  onEdit: (unit: Unit) => void
  onCreateChild: (unit: Unit) => void
}) {
  const children = props.treeByParent.get(props.unit.id) || []
  return (
    <div class="rounded-xl border border-base-300 bg-base-100 p-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1 cursor-pointer" onClick={() => props.onOpenRoute(props.unit)}>
          <div class="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-base-content/75">
            <span class="h-3 w-3 rounded-full" style={{ backgroundColor: props.unit.color }} />
            <span>{typeLabels[props.unit.type]}</span>
          </div>
          <button
            class="mt-1.5 block text-left text-base font-semibold hover:text-primary"
            onClick={(event) => {
              event.stopPropagation()
              props.onOpenDetails(props.unit)
            }}
          >
            {props.unit.title}
          </button>
          <div class="mt-1.5 text-xs text-base-content/90">{plainText(props.unit.description) || 'No description yet.'}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-xs" onClick={() => props.onEdit(props.unit)} title="Edit item" aria-label="Edit item">
            <Pencil size={14} />
          </button>
          {nextChildType[props.unit.type] && (
            <button class="btn btn-primary btn-xs" onClick={() => props.onCreateChild(props.unit)} title="Add child" aria-label="Add child">
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <span class="badge badge-outline border-base-content/40 text-base-content">{statuses.find((status) => status.key === props.unit.status)?.label}</span>
        <span class="badge badge-outline border-base-content/40 text-base-content">{props.commentsByUnit.get(props.unit.id)?.length || 0} comments</span>
        {props.unit.tags.map((tag) => (
          <span class="badge">{tag}</span>
        ))}
      </div>
      {!!children.length && (
        <div class="mt-4 space-y-3 border-l-2 border-base-300 pl-4">
          {children.map((child) => (
            <UnitTreeNode unit={child} treeByParent={props.treeByParent} commentsByUnit={props.commentsByUnit} onOpenRoute={props.onOpenRoute} onOpenDetails={props.onOpenDetails} onEdit={props.onEdit} onCreateChild={props.onCreateChild} />
          ))}
        </div>
      )}
    </div>
  )
}

function ApiDocsPage(props: { projectId: string }) {
  const base = '/api/agilerr'
  return (
    <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
      <h2 class="text-lg font-bold">API Usage</h2>
      <p class="mt-2 text-sm text-base-content/82">All endpoints below require the PocketBase auth token in the `Authorization` header.</p>
      <div class="mt-6 space-y-4">
        <ApiEndpoint method="GET" path={`${base}/me`} description="Return the authenticated user profile used by the app shell." />
        <ApiEndpoint method="GET" path={`${base}/projects`} description="List projects visible to the authenticated user." />
        <ApiEndpoint method="POST" path={`${base}/projects`} description="Create a project with `name`, `description`, `color`, and `tags`." />
        <ApiEndpoint method="PATCH" path={`${base}/projects/${props.projectId}`} description="Update the active project's metadata." />
        <ApiEndpoint method="GET" path={`${base}/projects/${props.projectId}`} description="Fetch the project, items, comments, users, and tag suggestions in a single response." />
        <ApiEndpoint method="GET" path={`${base}/projects/${props.projectId}/suggest?q=term`} description="Return tag, user, and item suggestions for mentions and tagging." />
        <ApiEndpoint method="POST" path={`${base}/projects/${props.projectId}/units`} description="Create a new item under the project." />
        <ApiEndpoint method="PATCH" path={`${base}/units/{unitId}`} description="Edit an existing item." />
        <ApiEndpoint method="POST" path={`${base}/units/{unitId}/move`} description="Move an item between kanban lanes using `{ status }`." />
        <ApiEndpoint method="DELETE" path={`${base}/units/{unitId}`} description="Delete an item after its child items are removed." />
        <ApiEndpoint method="GET" path={`${base}/units/{unitId}/comments`} description="List comments for an item." />
        <ApiEndpoint method="POST" path={`${base}/units/{unitId}/comments`} description="Create a markdown comment with optional mentions." />
        <ApiEndpoint method="POST" path={`${base}/smart-add`} description="Refine a draft item using the configured OpenAI endpoint." />
      </div>

      <div class="mt-6 rounded-xl border border-base-300 bg-base-200/60 p-4">
        <h3 class="font-semibold">Example Request</h3>
        <pre class="mt-3 overflow-auto rounded-xl bg-neutral p-4 text-xs text-neutral-content"><code>{`curl -X POST ${base}/projects/${props.projectId}/units \\
  -H "Authorization: <pb_auth_token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "epic",
    "status": "todo",
    "title": "Ship onboarding",
    "description": "Create the onboarding experience",
    "color": "#2563eb",
    "tags": ["onboarding", "mvp"]
  }'`}</code></pre>
      </div>
    </section>
  )
}

function ApiEndpoint(props: { method: string; path: string; description: string }) {
  return (
    <div class="rounded-xl border border-base-300 bg-base-100 p-3">
      <div class="flex flex-wrap items-center gap-3">
        <span class="badge badge-primary">{props.method}</span>
        <code class="rounded bg-base-200 px-2 py-1 text-sm">{props.path}</code>
      </div>
      <p class="mt-2 text-xs text-base-content/82">{props.description}</p>
    </div>
  )
}

function parseRoute(pathname: string): AppRoute {
  const trimmed = pathname.replace(/\/+$/, '')
  const segments = (trimmed || '/').split('/').filter(Boolean)

  if (!segments.length) return { kind: 'root' }
  if (segments[0] !== 'projects' || !segments[1]) return { kind: 'root' }

  const projectId = segments[1]
  if (segments.length === 2) return { kind: 'project', projectId, view: 'kanban', chain: [] }
  if (segments[2] === 'backlog' && segments.length === 3) return { kind: 'project', projectId, view: 'backlog', chain: [] }
  if (segments[2] === 'api' && segments.length === 3) return { kind: 'project', projectId, view: 'api', chain: [] }

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

function projectKanbanPath(projectId: string) {
  return `/projects/${projectId}`
}

function projectBacklogPath(projectId: string) {
  return `/projects/${projectId}/backlog`
}

function projectApiPath(projectId: string) {
  return `/projects/${projectId}/api`
}

function projectPathForSelection(projectId: string, page: ProjectPage | null) {
  if (page === 'backlog') return projectBacklogPath(projectId)
  if (page === 'api') return projectApiPath(projectId)
  return projectKanbanPath(projectId)
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

function gravatar(email: string) {
  return `https://www.gravatar.com/avatar/${md5((email || '').trim().toLowerCase())}?d=identicon&s=120`
}
