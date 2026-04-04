import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
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

const emptyProjectDraft = {
  name: '',
  description: '',
  color: presetColors[1],
  tags: [] as string[],
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<ProjectPage>('backlog')
  const [tree, setTree] = useState<ProjectTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' })
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [projectDraft, setProjectDraft] = useState(emptyProjectDraft)
  const [projectEditorOpen, setProjectEditorOpen] = useState(false)
  const [projectEditor, setProjectEditor] = useState(emptyProjectDraft)
  const [unitEditor, setUnitEditor] = useState<UnitDraft | null>(null)
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null)
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
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!selectedProjectId || !currentUser) return
    void loadProject(selectedProjectId)
    void loadSuggestions(selectedProjectId)
  }, [selectedProjectId, currentUser])

  const units = tree?.units ?? []
  const comments = tree?.comments ?? []
  const users = tree?.users ?? []
  const unitById = useMemo(() => Object.fromEntries(units.map((unit) => [unit.id, unit])), [units])
  const userById = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users])
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
  const activeUnit = activeUnitId ? unitById[activeUnitId] : null

  async function loadSession() {
    setLoading(true)
    setError('')
    try {
      if (!pb.authStore.isValid) {
        setCurrentUser(null)
        setProjects([])
        setSelectedProjectId(null)
        setTree(null)
        return
      }

      const me = await api.me()
      setCurrentUser(me.user)

      const response = await api.projects()
      setProjects(response.projects)
      setSelectedProjectId((current) => {
        if (current && response.projects.some((project) => project.id === current)) {
          return current
        }
        return response.projects[0]?.id || null
      })
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
      setSelectedProjectId(response.project.id)
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
      setUnitEditor(null)
      if (selectedProjectId) await loadProject(selectedProjectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save unit')
    }
  }

  async function moveUnit(unitId: string, status: UnitStatus) {
    try {
      await api.moveUnit(unitId, status)
      if (selectedProjectId) await loadProject(selectedProjectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move unit')
    }
  }

  async function deleteUnit(unitId: string) {
    if (!window.confirm('Delete this unit? Child units must already be removed.')) return
    try {
      await api.deleteUnit(unitId)
      setActiveUnitId(null)
      setUnitEditor(null)
      if (selectedProjectId) await loadProject(selectedProjectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete unit')
    }
  }

  async function saveComment(event: Event) {
    event.preventDefault()
    if (!activeUnit) return
    try {
      await api.createComment(activeUnit.id, {
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
              <ValueCard title="Board and backlog" body="Separate backlog and kanban pages, with a lightweight API guide in-app." />
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
                {authMode === 'login' ? 'Sign in' : 'Create account'}
              </button>

              <p class="text-sm text-base-content/80">Admin access is seeded by the backend from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.</p>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,transparent_20%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] text-base-content">
      <div class="grid min-h-screen lg:grid-cols-[240px,1fr]">
        <aside class="border-r border-base-300/50 bg-base-100/75 p-4 backdrop-blur">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Agilerr</p>
              <h2 class="mt-1.5 text-xl font-black">Projects</h2>
            </div>
            <button class="btn btn-primary btn-sm h-9 min-h-9" onClick={() => setProjectModalOpen(true)}>
              New
            </button>
          </div>

          <div class="mt-5 space-y-2">
            {projects.map((project) => (
              <button
                key={project.id}
                class={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                  selectedProjectId === project.id ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-100 hover:border-primary/50'
                }`}
                onClick={() => {
                  setSelectedProjectId(project.id)
                  setCurrentPage('backlog')
                }}
              >
                <div class="flex items-center gap-3">
                  <span class="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                  <span class="font-semibold text-sm">{project.name}</span>
                </div>
                <p class="mt-1.5 line-clamp-2 text-xs text-base-content/85">{project.description || 'No description yet.'}</p>
              </button>
            ))}
            {!projects.length && <div class="rounded-xl border border-dashed border-base-300 bg-base-100 p-3 text-xs text-base-content/80">Create the first project to start.</div>}
          </div>

          <div class="mt-6 rounded-xl border border-base-300 bg-base-100 p-3">
            <div class="flex items-center gap-3">
              <img class="h-10 w-10 rounded-full ring-2 ring-base-300" src={currentUser.gravatar || gravatar(currentUser.email)} alt={currentUser.name} />
              <div>
                <div class="text-sm font-semibold">{currentUser.name}</div>
                <div class="text-xs text-base-content/85">{currentUser.email}</div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm mt-3 h-9 min-h-9 w-full" onClick={() => pb.authStore.clear()}>
              Log out
            </button>
          </div>
        </aside>

        <main class="p-4 sm:p-5">
          {error && <div class="alert alert-error mb-4">{error}</div>}
          {tree ? (
            <>
              <header class="mb-5 rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-5 shadow-panel">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div class="flex items-center gap-3">
                      <span class="h-4 w-4 rounded-full" style={{ backgroundColor: tree.project.color }} />
                      <h1 class="text-2xl font-black">{tree.project.name}</h1>
                    </div>
                    <p class="mt-2.5 max-w-3xl text-sm text-base-content/90">{tree.project.description || 'No project description yet.'}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      {tree.tags.map((tag) => (
                        <span class="badge badge-outline border-base-content/40 text-base-content" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button class="btn btn-outline btn-sm h-9 min-h-9" onClick={() => setProjectEditorOpen(true)}>
                      Edit Project
                    </button>
                    <button class="btn btn-primary btn-sm h-9 min-h-9" onClick={() => openNewUnit(tree.project.id)}>
                      Add Epic
                    </button>
                  </div>
                </div>

                <div class="mt-5 tabs tabs-boxed inline-flex">
                  <button class={`tab ${currentPage === 'backlog' ? 'tab-active' : ''}`} onClick={() => setCurrentPage('backlog')}>
                    Backlog
                  </button>
                  <button class={`tab ${currentPage === 'kanban' ? 'tab-active' : ''}`} onClick={() => setCurrentPage('kanban')}>
                    Kanban
                  </button>
                  <button class={`tab ${currentPage === 'api' ? 'tab-active' : ''}`} onClick={() => setCurrentPage('api')}>
                    API
                  </button>
                </div>
              </header>

              {currentPage === 'backlog' && (
                <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-4 shadow-panel">
                  <div class="mb-4 flex items-center justify-between">
                    <h2 class="text-lg font-bold">Backlog</h2>
                    <span class="text-xs text-base-content/75">{units.length} units</span>
                  </div>
                  <div class="space-y-3">
                    {(treeByParent.get('root') || []).map((unit) => (
                      <UnitTreeNode
                        key={unit.id}
                        unit={unit}
                        treeByParent={treeByParent}
                        commentsByUnit={commentsByUnit}
                        onOpen={(target) => setActiveUnitId(target.id)}
                        onEdit={openEditUnit}
                        onCreateChild={(target) => openNewUnit(tree.project.id, target)}
                      />
                    ))}
                    {!units.length && <div class="rounded-xl border border-dashed border-base-300 p-3 text-xs text-base-content/80">No units yet. Start with an Epic.</div>}
                  </div>
                </section>
              )}

              {currentPage === 'kanban' && (
                <section class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-4 shadow-panel">
                  <div class="mb-4 flex items-center justify-between">
                    <h2 class="text-lg font-bold">Kanban</h2>
                    <span class="text-xs text-base-content/75">Drag cards between lanes</span>
                  </div>
                  <div class="grid gap-4 xl:grid-cols-4">
                    {statuses.map((status) => {
                      const laneUnits = units
                        .filter((unit) => unit.status === status.key)
                        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))

                      return (
                        <div
                          key={status.key}
                          class="rounded-xl border border-base-300 bg-base-200/60 p-2.5"
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            const unitId = event.dataTransfer?.getData('text/unit-id')
                            if (unitId) void moveUnit(unitId, status.key)
                          }}
                        >
                          <div class="mb-3 flex items-center justify-between">
                            <span class="font-semibold">{status.label}</span>
                            <span class="badge">{laneUnits.length}</span>
                          </div>
                          <div class="space-y-3">
                            {laneUnits.map((unit) => (
                              <button
                                key={unit.id}
                                draggable
                                class="block w-full rounded-xl border border-base-300 bg-base-100 p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50"
                                onDragStart={(event) => event.dataTransfer?.setData('text/unit-id', unit.id)}
                                onClick={() => setActiveUnitId(unit.id)}
                              >
                                <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-base-content/70">
                                  <span class="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: unit.color }} />
                                  <span>{typeLabels[unit.type]}</span>
                                </div>
                                <div class="mt-1.5 text-sm font-semibold">{unit.title}</div>
                                <div class="mt-1.5 line-clamp-3 text-xs text-base-content/90">{plainText(unit.description) || 'No description yet.'}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {currentPage === 'api' && <ApiDocsPage projectId={tree.project.id} />}
            </>
          ) : (
            <div class="rounded-[1.5rem] border border-base-300/50 bg-base-100/90 p-6 shadow-panel">Select or create a project.</div>
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
                Save project
              </button>
            </div>
          </form>
        </Modal>
      )}

      {unitEditor && (
        <Modal title={unitEditor.id ? 'Edit Unit' : `Add ${typeLabels[unitEditor.type]}`} onClose={() => setUnitEditor(null)} wide>
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
                      <option key={type} value={type}>
                        {typeLabels[type]}
                      </option>
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
                  <MentionPanel title="Mention units" items={suggestions.units.map((item) => ({ id: item.id, label: item.label, type: 'unit' as const }))} onPick={(mention) => insertMention('description', mention)} />
                </div>
              </section>

              <section class="space-y-4 rounded-[1.5rem] border border-base-300 bg-base-100 p-4">
                <h3 class="text-lg font-bold">Optional</h3>
                <Field label="Status">
                  <select class="select select-bordered w-full" value={unitEditor.status} onChange={(e) => setUnitEditor({ ...unitEditor, status: (e.currentTarget as HTMLSelectElement).value as UnitStatus })}>
                    {statuses.map((status) => (
                      <option key={status.key} value={status.key}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Parent">
                  <select class="select select-bordered w-full" value={unitEditor.parentId || ''} onChange={(e) => setUnitEditor({ ...unitEditor, parentId: (e.currentTarget as HTMLSelectElement).value || undefined })}>
                    <option value="">No parent</option>
                    {units
                      .filter((unit) => unit.id !== unitEditor.id)
                      .map((unit) => (
                        <option key={unit.id} value={unit.id}>
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
                      {smartAddOpen ? 'Hide' : 'Open'}
                    </button>
                  </div>

                  {smartAddOpen && (
                    <div class="space-y-3">
                      <div class="max-h-60 space-y-2 overflow-auto rounded-2xl bg-base-100 p-3">
                        {smartAddMessages.map((message, index) => (
                          <div key={`${message.role}-${index}`} class={`chat ${message.role === 'user' ? 'chat-end' : 'chat-start'}`}>
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

            <div class="rounded-2xl border border-base-300 bg-base-100 p-4">
              <h3 class="mb-3 font-semibold">Preview</h3>
              <Markdown source={unitEditor.description || '*No description yet.*'} />
            </div>

            <div class="flex flex-wrap justify-between gap-2">
              {unitEditor.id ? (
                <button class="btn btn-error btn-outline" type="button" onClick={() => void deleteUnit(unitEditor.id!)}>
                  Delete unit
                </button>
              ) : (
                <span />
              )}
              <div class="flex gap-2">
                <button class="btn btn-ghost" type="button" onClick={() => setUnitEditor(null)}>
                  Cancel
                </button>
                <button class="btn btn-primary" type="submit">
                  Save unit
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {activeUnit && (
        <Modal title={activeUnit.title} onClose={() => setActiveUnitId(null)} wide>
          <div class="space-y-5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="badge badge-primary">{typeLabels[activeUnit.type]}</span>
              <span class="badge badge-outline border-base-content/40 text-base-content">{statuses.find((status) => status.key === activeUnit.status)?.label}</span>
              {activeUnit.tags.map((tag) => (
                <span class="badge badge-outline border-base-content/40 text-base-content" key={tag}>
                  {tag}
                </span>
              ))}
            </div>

            <div class="rounded-2xl border border-base-300 bg-base-100 p-4">
              <Markdown source={activeUnit.description || '*No description yet.*'} />
            </div>

            <div class="flex flex-wrap gap-2">
              <button class="btn btn-primary btn-sm" onClick={() => openEditUnit(activeUnit)}>
                Edit unit
              </button>
              {nextChildType[activeUnit.type] && (
                <button class="btn btn-outline btn-sm" onClick={() => openNewUnit(activeUnit.projectId, activeUnit)}>
                  Add child
                </button>
              )}
            </div>

            <section>
              <h3 class="mb-3 text-lg font-bold">Comments</h3>
              <div class="space-y-3">
                {(commentsByUnit.get(activeUnit.id) || []).map((comment) => (
                  <article class="rounded-2xl border border-base-300 bg-base-100 p-4" key={comment.id}>
                    <div class="mb-3 flex items-center gap-3">
                      <img class="h-10 w-10 rounded-full" src={userById[comment.authorId]?.gravatar || gravatar(userById[comment.authorId]?.email || '')} alt={userById[comment.authorId]?.name || 'User'} />
                      <div>
                        <div class="font-semibold">{userById[comment.authorId]?.name || 'Unknown user'}</div>
                        <div class="text-xs text-base-content/80">{new Date(comment.created).toLocaleString()}</div>
                      </div>
                    </div>
                    <Markdown source={comment.body} />
                  </article>
                ))}
                {!commentsByUnit.get(activeUnit.id)?.length && <div class="rounded-2xl border border-dashed border-base-300 p-4 text-sm text-base-content/80">No comments yet.</div>}
              </div>
            </section>

            <form class="space-y-4 rounded-2xl border border-base-300 bg-base-200/60 p-4" onSubmit={saveComment}>
              <Field label="Add comment">
                <textarea class="textarea textarea-bordered min-h-28 w-full" value={commentBody} onInput={(e) => setCommentBody((e.currentTarget as HTMLTextAreaElement).value)} />
              </Field>
              <div class="grid gap-4 lg:grid-cols-2">
                <MentionPanel title="Mention users" items={suggestions.users.map((item) => ({ id: item.id, label: item.label, type: 'user' as const }))} onPick={(mention) => insertMention('comment', mention)} />
                <MentionPanel title="Mention units" items={suggestions.units.map((item) => ({ id: item.id, label: item.label, type: 'unit' as const }))} onPick={(mention) => insertMention('comment', mention)} />
              </div>
              <button class="btn btn-primary" type="submit">
                Save comment
              </button>
            </form>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal(props: { title: string; onClose: () => void; wide?: boolean; children: ComponentChildren }) {
  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-neutral/40 p-4 backdrop-blur-sm">
      <div class={`mt-6 w-full rounded-[1.25rem] border border-base-300 bg-base-100 p-5 shadow-panel ${props.wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <div class="mb-4 flex items-center justify-between gap-4">
          <h2 class="text-xl font-black">{props.title}</h2>
          <button class="btn btn-ghost btn-sm h-8 min-h-8" onClick={props.onClose}>
            Close
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
          <button class="badge badge-primary gap-2 px-3 py-3" key={tag} type="button" onClick={() => props.onChange(props.tags.filter((item) => item !== tag))}>
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
          Add
        </button>
      </div>
      <datalist id="tag-options">
        {props.suggestions.map((tag) => (
          <option key={tag} value={tag} />
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
            key={color}
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
          <button class="badge badge-outline border-base-content/40 bg-base-100 px-2.5 py-2 text-base-content" key={`${item.type}-${item.id}`} type="button" onClick={() => props.onPick(item)}>
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

function UnitTreeNode(props: {
  unit: Unit
  treeByParent: Map<string, Unit[]>
  commentsByUnit: Map<string, Comment[]>
  onOpen: (unit: Unit) => void
  onEdit: (unit: Unit) => void
  onCreateChild: (unit: Unit) => void
}) {
  const children = props.treeByParent.get(props.unit.id) || []
  return (
    <div class="rounded-xl border border-base-300 bg-base-100 p-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <button class="min-w-0 flex-1 text-left" onClick={() => props.onOpen(props.unit)}>
          <div class="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-base-content/70">
            <span class="h-3 w-3 rounded-full" style={{ backgroundColor: props.unit.color }} />
            <span>{typeLabels[props.unit.type]}</span>
          </div>
          <div class="mt-1.5 text-base font-semibold">{props.unit.title}</div>
          <div class="mt-1.5 text-xs text-base-content/90">{plainText(props.unit.description) || 'No description yet.'}</div>
        </button>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-xs" onClick={() => props.onEdit(props.unit)}>
            Edit
          </button>
          {nextChildType[props.unit.type] && (
            <button class="btn btn-primary btn-xs" onClick={() => props.onCreateChild(props.unit)}>
              Add child
            </button>
          )}
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <span class="badge badge-outline border-base-content/40 text-base-content">{statuses.find((status) => status.key === props.unit.status)?.label}</span>
        <span class="badge badge-outline border-base-content/40 text-base-content">{props.commentsByUnit.get(props.unit.id)?.length || 0} comments</span>
        {props.unit.tags.map((tag) => (
          <span class="badge" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      {!!children.length && (
        <div class="mt-4 space-y-3 border-l-2 border-base-300 pl-4">
          {children.map((child) => (
            <UnitTreeNode key={child.id} unit={child} treeByParent={props.treeByParent} commentsByUnit={props.commentsByUnit} onOpen={props.onOpen} onEdit={props.onEdit} onCreateChild={props.onCreateChild} />
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
        <ApiEndpoint method="GET" path={`${base}/projects/${props.projectId}`} description="Fetch the project, units, comments, users, and tag suggestions in a single response." />
        <ApiEndpoint method="GET" path={`${base}/projects/${props.projectId}/suggest?q=term`} description="Return tag, user, and unit suggestions for mentions and tagging." />
        <ApiEndpoint method="POST" path={`${base}/projects/${props.projectId}/units`} description="Create a new unit under the project." />
        <ApiEndpoint method="PATCH" path={`${base}/units/{unitId}`} description="Edit an existing unit." />
        <ApiEndpoint method="POST" path={`${base}/units/{unitId}/move`} description="Move a unit between kanban lanes using `{ status }`." />
        <ApiEndpoint method="DELETE" path={`${base}/units/{unitId}`} description="Delete a unit after its child units are removed." />
        <ApiEndpoint method="GET" path={`${base}/units/{unitId}/comments`} description="List comments for a unit." />
        <ApiEndpoint method="POST" path={`${base}/units/{unitId}/comments`} description="Create a markdown comment with optional mentions." />
        <ApiEndpoint method="POST" path={`${base}/smart-add`} description="Refine a draft unit using the configured OpenAI endpoint." />
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

function plainText(markdown: string) {
  return markdown.replace(/[#_*`\[\]\(\)!>-]/g, '').replace(/\s+/g, ' ').trim()
}

function gravatar(email: string) {
  return `https://www.gravatar.com/avatar/${md5((email || '').trim().toLowerCase())}?d=identicon&s=120`
}
