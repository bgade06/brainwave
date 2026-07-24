import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type {
  ActionItem,
  Analysis,
  AuthSession,
  CreateActionItemInput,
  CreateTopicInput,
  JiraConnection,
  JiraProject,
  Topic,
  UpdateActionItemInput,
  User,
} from './types'

const emptyTopic: CreateTopicInput = { title: '', description: '', goal: '' }

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? ''
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function textOf(item: string | { name?: string; title?: string; text?: string; description?: string }) {
  if (typeof item === 'string') return item
  return item.name ?? item.title ?? item.text ?? item.description ?? 'Untitled'
}

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" />{label}</div>
}

function ErrorNotice({ children, retry }: { children: string; retry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <span><strong>We hit a snag.</strong> {children}</span>
      {retry && <button className="text-button" onClick={retry}>Try again</button>}
    </div>
  )
}

function TopicCard({ topic, onOpen }: { topic: Topic; onOpen: () => void }) {
  const count = topic.ideaCount ?? topic.ideas?.length ?? 0
  return (
    <article className="topic-card">
      <div className="card-topline">
        <span className="eyebrow">{count} {count === 1 ? 'idea' : 'ideas'}</span>
        {(topic.hasAnalysis ?? Boolean(topic.analysis)) && <span className="analyzed">Analyzed</span>}
      </div>
      <h3>{topic.title}</h3>
      <p>{topic.description || topic.goal}</p>
      <div className="card-footer">
        <span>{formatDate(topic.createdAt)}</span>
        <button className="arrow-button" onClick={onOpen} aria-label={`Open ${topic.title}`}>→</button>
      </div>
    </article>
  )
}

function NewTopicDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (topic: Topic) => void
}) {
  const [form, setForm] = useState(emptyTopic)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const topic = await api.createTopic({
        title: form.title.trim(),
        description: form.description.trim(),
        goal: form.goal.trim(),
      })
      setForm(emptyTopic)
      onCreated(topic)
    } catch (caught) {
      setError(message(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-topic-title">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow">New brainstorm</span>
        <h2 id="new-topic-title">What should we think through?</h2>
        <p className="muted">A focused goal helps people contribute stronger ideas.</p>
        <form onSubmit={submit}>
          <label>
            Topic
            <input
              required
              autoFocus
              maxLength={120}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Plan our fall community event"
            />
          </label>
          <label>
            Context <span>(optional)</span>
            <textarea
              maxLength={1000}
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What should contributors know?"
            />
          </label>
          <label>
            Goal
            <textarea
              required
              maxLength={500}
              rows={2}
              value={form.goal}
              onChange={(event) => setForm({ ...form, goal: event.target.value })}
              placeholder="Leave with three realistic concepts to explore"
            />
          </label>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
            <button className="button primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create topic'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function AnalysisView({ analysis }: { analysis: Analysis }) {
  return (
    <section className="analysis-panel" aria-labelledby="analysis-heading">
      <header className="section-heading">
        <div>
          <span className="eyebrow">Synthesis</span>
          <h2 id="analysis-heading">The shape of your thinking</h2>
        </div>
        <span className="timestamp">Generated {formatDate(analysis.regeneratedAt ?? analysis.createdAt)}</span>
      </header>
      <div className="analysis-grid">
        <div className="analysis-block themes">
          <span className="block-number">01</span>
          <h3>Themes</h3>
          {analysis.themes.length ? (
            <ul className="tag-list">
              {analysis.themes.map((theme, index) => <li key={`${textOf(theme)}-${index}`}>{textOf(theme)}</li>)}
            </ul>
          ) : <p className="muted">No themes surfaced yet.</p>}
        </div>
        <div className="analysis-block">
          <span className="block-number">02</span>
          <h3>Suggestions</h3>
          {analysis.suggestions.length ? (
            <ol className="suggestion-list">
              {analysis.suggestions.map((suggestion, index) => (
                <li key={`${textOf(suggestion)}-${index}`}><span>{index + 1}</span>{textOf(suggestion)}</li>
              ))}
            </ol>
          ) : <p className="muted">No suggestions surfaced yet.</p>}
        </div>
      </div>
      <div className="action-section">
        <div className="action-title"><span className="block-number">03</span><h3>Next moves</h3></div>
        {analysis.actionItems.length ? (
          <ul className="action-list">
            {analysis.actionItems.map((item, index) => (
              <li key={item.id ?? `${item.text}-${index}`}>
                <span className="check" aria-hidden="true" />
                <span className="action-copy">{item.text}</span>
                {item.priority && <span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="muted">No action items surfaced yet.</p>}
      </div>
    </section>
  )
}

function JiraMenu({
  connection,
  loading,
  error,
  onRetry,
  onDisconnect,
}: {
  connection: JiraConnection | null
  loading: boolean
  error: string
  onRetry: () => void
  onDisconnect: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  async function disconnect() {
    setDisconnecting(true)
    try {
      await onDisconnect()
    } catch {
      // The parent renders the API error in this panel.
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="jira-menu">
      <button
        className={`jira-trigger ${connection?.connected ? 'connected' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="jira-integration-panel"
      >
        <span aria-hidden="true">◆</span>
        {connection?.connected ? 'Jira connected' : 'Connect Jira'}
      </button>
      {open && (
        <section id="jira-integration-panel" className="jira-panel" aria-label="Jira integration">
          <button className="close jira-close" onClick={() => setOpen(false)} aria-label="Close Jira integration">×</button>
          <span className="eyebrow">Organization integration</span>
          <h2>Jira</h2>
          {loading ? <Loading label="Checking Jira connection…" /> : error ? (
            <ErrorNotice retry={onRetry}>{error}</ErrorNotice>
          ) : connection?.connected ? (
            <>
              <p><strong>Connected{connection.siteName ? ` to ${connection.siteName}` : ''}.</strong></p>
              {connection.siteUrl && <a href={connection.siteUrl} target="_blank" rel="noreferrer">Open Jira site ↗</a>}
              <button className="button secondary disconnect" onClick={() => void disconnect()} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect Jira'}
              </button>
            </>
          ) : (
            <>
              <p>Connect this organization to create Jira issues from Brainwave action items.</p>
              <a className="button primary connect-jira" href="/integrations/jira/connect">Connect Jira</a>
            </>
          )}
        </section>
      )}
    </div>
  )
}

function ActionItemCard({
  item,
  currentUser,
  pending,
  onUpdate,
  onClaim,
  projects,
  jiraConnected,
  onCreateJira,
}: {
  item: ActionItem
  currentUser: User
  pending: boolean
  onUpdate: (input: UpdateActionItemInput) => Promise<boolean>
  onClaim: (claim: boolean) => Promise<void>
  projects: JiraProject[]
  jiraConnected: boolean
  onCreateJira: (projectKey: string, issueTypeId?: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [priority, setPriority] = useState<NonNullable<ActionItem['priority']>>(item.priority ?? 'medium')
  const [rationale, setRationale] = useState(item.rationale ?? '')
  const [jiraOpen, setJiraOpen] = useState(false)
  const [projectKey, setProjectKey] = useState('')
  const [issueTypeId, setIssueTypeId] = useState('')
  const assignedId = item.assignee?.id ?? item.assigneeId ?? item.assigneeUserId
  const isMine = assignedId === currentUser.id
  const assigneeName = item.assignee?.name ?? (isMine ? currentUser.name : assignedId ? 'a teammate' : '')
  const project = projects.find((candidate) => candidate.key === projectKey)

  useEffect(() => {
    setPriority(item.priority ?? 'medium')
    setRationale(item.rationale ?? '')
  }, [item.priority, item.rationale])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (await onUpdate({ priority, rationale: rationale.trim() })) setEditing(false)
  }

  return (
    <li className={`action-card ${pending ? 'is-pending' : ''}`} aria-busy={pending}>
      <div className="action-card-main">
        <div className="action-meta">
          <span className={`priority ${item.priority ?? 'medium'}`}>{item.priority ?? 'medium'}</span>
          <span>{item.provenance === 'ai' ? 'Suggested by analysis' : 'Added by a teammate'}</span>
        </div>
        <h4>{item.text}</h4>
        {editing ? (
          <form className="action-edit" onSubmit={save}>
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as NonNullable<ActionItem['priority']>)}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label>
              Rationale
              <textarea
                rows={2}
                maxLength={2000}
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                placeholder="Why does this matter?"
              />
            </label>
            <div className="compact-actions">
              <button className="button primary" disabled={pending}>Save details</button>
              <button type="button" className="text-button" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <p className="action-rationale">{item.rationale || 'No rationale added yet.'}</p>
            <button className="text-button edit-action" onClick={() => setEditing(true)} disabled={pending}>
              Edit priority and rationale
            </button>
          </>
        )}
      </div>
      <div className="action-controls">
        <label>
          Status
          <select
            aria-label={`Status for ${item.text}`}
            value={item.status}
            disabled={pending}
            onChange={(event) => {
              const status = event.target.value as ActionItem['status']
              void onUpdate({ status, reopen: item.status === 'done' && status === 'in_progress' })
            }}
          >
            {item.status === 'open' && <option value="open">Open</option>}
            {item.status !== 'done' && <option value="in_progress">In progress</option>}
            {item.status === 'done' && <option value="done">Done</option>}
            {item.status === 'done' && <option value="in_progress">Reopen in progress</option>}
            {item.status === 'in_progress' && <option value="done">Done</option>}
          </select>
        </label>
        <div className="assignment">
          <span>{assigneeName ? `Owned by ${assigneeName}` : 'Unassigned'}</span>
          {!assignedId || isMine ? (
            <button className="button secondary" onClick={() => void onClaim(!isMine)} disabled={pending}>
              {pending ? 'Updating…' : isMine ? 'Unclaim' : 'Claim this'}
            </button>
          ) : null}
        </div>
        {item.jiraIssueKey && item.jiraIssueUrl ? (
          <div className="jira-link">
            <span>Jira · {item.jiraSyncStatus ?? 'synced'}</span>
            <a href={item.jiraIssueUrl} target="_blank" rel="noreferrer">{item.jiraIssueKey} ↗</a>
          </div>
        ) : jiraConnected ? (
          <div className="jira-create">
            {!jiraOpen ? (
              <button className="text-button" onClick={() => setJiraOpen(true)} disabled={pending}>
                Create Jira issue
              </button>
            ) : (
              <>
                <label>
                  Jira project
                  <select
                    value={projectKey}
                    onChange={(event) => {
                      setProjectKey(event.target.value)
                      setIssueTypeId('')
                    }}
                  >
                    <option value="">Select a project</option>
                    {projects.map((candidate) => (
                      <option key={candidate.id} value={candidate.key}>{candidate.key} · {candidate.name}</option>
                    ))}
                  </select>
                </label>
                {project?.issueTypes?.length ? (
                  <label>
                    Issue type
                    <select value={issueTypeId} onChange={(event) => setIssueTypeId(event.target.value)}>
                      <option value="">Project default</option>
                      {project.issueTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                    </select>
                  </label>
                ) : null}
                <div className="compact-actions">
                  <button
                    className="button primary"
                    disabled={pending || !projectKey}
                    onClick={() => void onCreateJira(projectKey, issueTypeId || undefined)}
                  >
                    {pending ? 'Creating…' : 'Create issue'}
                  </button>
                  <button className="text-button" onClick={() => setJiraOpen(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  )
}

function ActionItemsView({
  topicId,
  currentUser,
  jiraConnection,
}: {
  topicId: string
  currentUser: User
  jiraConnection: JiraConnection | null
}) {
  const [items, setItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateActionItemInput>({ text: '', priority: 'medium', rationale: '' })
  const [projects, setProjects] = useState<JiraProject[]>([])
  const [jiraError, setJiraError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setItems(await api.listActionItems(topicId))
    } catch (caught) {
      setLoadError(message(caught))
    } finally {
      setLoading(false)
    }
  }, [topicId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!jiraConnection?.connected) {
      setProjects([])
      return
    }
    let active = true
    setJiraError('')
    api.listJiraProjects()
      .then((value) => { if (active) setProjects(value) })
      .catch((caught) => { if (active) setJiraError(message(caught)) })
    return () => { active = false }
  }, [jiraConnection?.connected])

  function setPending(id: string, value: boolean) {
    setPendingIds((current) => {
      const next = new Set(current)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function replaceItem(updated: ActionItem) {
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!form.text.trim()) return
    setCreating(true)
    setMutationError('')
    try {
      const created = await api.createActionItem(topicId, {
        text: form.text.trim(),
        priority: form.priority,
        rationale: form.rationale?.trim() || undefined,
      })
      setItems((current) => [...current, created])
      setForm({ text: '', priority: 'medium', rationale: '' })
    } catch (caught) {
      setMutationError(message(caught))
    } finally {
      setCreating(false)
    }
  }

  async function update(id: string, input: UpdateActionItemInput): Promise<boolean> {
    setPending(id, true)
    setMutationError('')
    try {
      const updated = await api.updateActionItem(id, input)
      replaceItem(updated)
      if (input.status && updated.jiraIssueKey) {
        replaceItem(await api.syncJiraStatus(id))
      }
      return true
    } catch (caught) {
      setMutationError(message(caught))
      return false
    } finally {
      setPending(id, false)
    }
  }

  async function claim(id: string, shouldClaim: boolean) {
    setPending(id, true)
    setMutationError('')
    try {
      replaceItem(shouldClaim ? await api.claimActionItem(id) : await api.unclaimActionItem(id))
    } catch (caught) {
      setMutationError(
        caught instanceof ApiError && caught.status === 409
          ? 'Someone else claimed this action item first. Refreshing will show its current owner.'
          : message(caught),
      )
    } finally {
      setPending(id, false)
    }
  }

  async function createJira(id: string, projectKey: string, issueTypeId?: string) {
    setPending(id, true)
    setJiraError('')
    try {
      replaceItem(await api.createJiraIssue(id, { projectKey, issueTypeId }))
    } catch (caught) {
      setJiraError(message(caught))
    } finally {
      setPending(id, false)
    }
  }

  return (
    <section className="work-section" aria-labelledby="actions-heading">
      <div className="section-heading">
        <div><span className="eyebrow">Act</span><h2 id="actions-heading">Turn ideas into movement</h2></div>
        {!loading && <span className="topic-count">{items.length} action {items.length === 1 ? 'item' : 'items'}</span>}
      </div>
      <form className="new-action-form" onSubmit={create}>
        <div>
          <label>
            Action
            <input
              required
              maxLength={5000}
              value={form.text}
              onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))}
              placeholder="Schedule the first experiment"
            />
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(event) => setForm((current) => ({
                ...current,
                priority: event.target.value as ActionItem['priority'],
              }))}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <label>
          Rationale <span>(optional)</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={form.rationale}
            onChange={(event) => setForm((current) => ({ ...current, rationale: event.target.value }))}
            placeholder="Why is this a useful next move?"
          />
        </label>
        <button className="button primary" disabled={creating}>{creating ? 'Adding action…' : 'Add action item'}</button>
      </form>
      {mutationError && <ErrorNotice>{mutationError}</ErrorNotice>}
      {jiraError && <ErrorNotice>{jiraError}</ErrorNotice>}
      {loading ? <Loading label="Gathering next moves…" /> : loadError ? (
        <ErrorNotice retry={load}>{loadError}</ErrorNotice>
      ) : items.length ? (
        <ul className="work-list">
          {items.map((item) => (
            <ActionItemCard
              key={item.id}
              item={item}
              currentUser={currentUser}
              pending={pendingIds.has(item.id)}
              onUpdate={(input) => update(item.id, input)}
              onClaim={(shouldClaim) => claim(item.id, shouldClaim)}
              projects={projects}
              jiraConnected={Boolean(jiraConnection?.connected)}
              onCreateJira={(projectKey, issueTypeId) => createJira(item.id, projectKey, issueTypeId)}
            />
          ))}
        </ul>
      ) : <div className="empty inline-empty"><h3>No next moves yet</h3><p>Add one manually or analyze the brainstorm.</p></div>}
    </section>
  )
}

function TopicDetail({
  topicId,
  currentUser,
  jiraConnection,
  onBack,
}: {
  topicId: string
  currentUser: User
  jiraConnection: JiraConnection | null
  onBack: () => void
}) {
  const [topic, setTopic] = useState<Topic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [idea, setIdea] = useState('')
  const [author, setAuthor] = useState('')
  const [adding, setAdding] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setTopic(await api.getTopic(topicId))
    } catch (caught) {
      setError(message(caught))
    } finally {
      setLoading(false)
    }
  }, [topicId])

  useEffect(() => { void load() }, [load])

  async function addIdea(event: FormEvent) {
    event.preventDefault()
    if (!topic || !idea.trim()) return
    setAdding(true)
    setActionError('')
    try {
      const created = await api.addIdea(topic.id, { text: idea.trim(), author: author.trim() || undefined })
      setTopic((current) => current
        ? {
            ...current,
            ideas: [...(current.ideas ?? []), created],
            analysis: null,
          }
        : current)
      setIdea('')
      setAuthor('')
    } catch (caught) {
      setActionError(message(caught))
    } finally {
      setAdding(false)
    }
  }

  async function analyze(regenerate: boolean) {
    if (!topic) return
    setAnalyzing(true)
    setActionError('')
    try {
      const analysis = await api.analyze(topic.id, regenerate)
      setTopic((current) => current ? { ...current, analysis } : current)
    } catch (caught) {
      setActionError(message(caught))
    } finally {
      setAnalyzing(false)
    }
  }

  if (loading) return <main className="detail-wrap"><Loading label="Gathering this brainstorm…" /></main>
  if (error) return <main className="detail-wrap"><button className="back" onClick={onBack}>← All topics</button><ErrorNotice retry={load}>{error}</ErrorNotice></main>
  if (!topic) return null
  const ideas = topic.ideas ?? []

  return (
    <main>
      <div className="detail-wrap">
        <button className="back" onClick={onBack}>← All topics</button>
        <header className="topic-hero">
          <div>
            <span className="eyebrow">Brainstorm · {ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'}</span>
            <h1>{topic.title}</h1>
            {topic.description && <p>{topic.description}</p>}
          </div>
          <aside className="goal-card">
            <span>Our goal</span>
            <p>{topic.goal}</p>
          </aside>
        </header>

        <section className="ideas-section" aria-labelledby="ideas-heading">
          <div className="section-heading">
            <div><span className="eyebrow">Collect</span><h2 id="ideas-heading">Ideas on the table</h2></div>
            <button
              className="button analyze"
              onClick={() => void analyze(Boolean(topic.analysis))}
              disabled={analyzing || adding || ideas.length === 0}
            >
              <span aria-hidden="true">✦</span>
              {analyzing ? 'Finding patterns…' : topic.analysis ? 'Regenerate analysis' : 'Analyze ideas'}
            </button>
          </div>
          <div className="idea-layout">
            <form className="idea-form" onSubmit={addIdea}>
              <label htmlFor="idea-text">Add your perspective</label>
              <textarea
                id="idea-text"
                rows={5}
              required
              disabled={analyzing}
                maxLength={1000}
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="What if we…"
              />
              <div className="idea-form-row">
                <input
                  aria-label="Your name (optional)"
                  disabled={analyzing}
                  maxLength={80}
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="Your name (optional)"
                />
                <button className="button primary" disabled={adding || analyzing}>
                  {adding ? 'Adding…' : 'Add idea'}
                </button>
              </div>
            </form>
            <div>
              {ideas.length ? (
                <ol className="ideas-list">
                  {ideas.map((entry, index) => (
                    <li key={entry.id}>
                      <span className="idea-number">{String(index + 1).padStart(2, '0')}</span>
                      <div><p>{entry.text}</p><span>{entry.author || 'Anonymous'} · {formatDate(entry.createdAt)}</span></div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty inline-empty">
                  <span className="empty-spark">✦</span>
                  <h3>Be the first voice</h3>
                  <p>Add an idea to get this brainstorm moving.</p>
                </div>
              )}
            </div>
          </div>
          {actionError && <ErrorNotice>{actionError}</ErrorNotice>}
        </section>
      </div>
      {analyzing && <div className="analysis-loading"><Loading label="Looking for themes, possibilities, and next moves…" /></div>}
      {topic.analysis && !analyzing && <AnalysisView analysis={topic.analysis} />}
      <div className="detail-wrap action-wrap">
        <ActionItemsView topicId={topic.id} currentUser={currentUser} jiraConnection={jiraConnection} />
      </div>
    </main>
  )
}

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [jiraConnection, setJiraConnection] = useState<JiraConnection | null>(null)
  const [jiraLoading, setJiraLoading] = useState(false)
  const [jiraError, setJiraError] = useState('')

  const loadSession = useCallback(async () => {
    setAuthLoading(true)
    setAuthError('')
    try {
      setSession(await api.getSession())
    } catch (caught) {
      setAuthError(message(caught))
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setTopics(await api.listTopics())
    } catch (caught) {
      setError(message(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadJira = useCallback(async () => {
    setJiraLoading(true)
    setJiraError('')
    try {
      setJiraConnection(await api.getJiraStatus())
    } catch (caught) {
      setJiraError(message(caught))
    } finally {
      setJiraLoading(false)
    }
  }, [])

  useEffect(() => { void loadSession() }, [loadSession])
  useEffect(() => {
    if (session?.authenticated) {
      void load()
      void loadJira()
    }
  }, [load, loadJira, session?.authenticated])

  async function disconnectJira() {
    setJiraError('')
    try {
      await api.disconnectJira()
      setJiraConnection({ connected: false })
    } catch (caught) {
      setJiraError(message(caught))
      throw caught
    }
  }

  async function logout() {
    setLoggingOut(true)
    setAuthError('')
    try {
      await api.logout()
      setSession((current) => ({
        authenticated: false,
        enabledProviders: current?.enabledProviders,
      }))
      setTopics([])
      setSelectedId(null)
      setDialogOpen(false)
      setJiraConnection(null)
    } catch (caught) {
      setAuthError(message(caught))
    } finally {
      setLoggingOut(false)
    }
  }

  function openTopic(id: string) {
    setSelectedId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (authLoading) {
    return (
      <div className="app-shell auth-state">
        <Mark />
        <Loading label="Opening your workspace…" />
      </div>
    )
  }

  if (authError && !session?.authenticated) {
    return (
      <div className="app-shell auth-state">
        <Mark />
        <ErrorNotice retry={loadSession}>{authError}</ErrorNotice>
      </div>
    )
  }

  if (!session?.authenticated || !session.user || !session.organization) {
    return (
      <div className="app-shell">
        <header className="site-header">
          <span className="brand"><Mark /><span>BRAINWAVE</span></span>
        </header>
        <main className="sign-in">
          <section aria-labelledby="sign-in-heading">
            <span className="eyebrow">A shared thinking space</span>
            <h1 id="sign-in-heading">Bring your best ideas <em>into focus.</em></h1>
            <p>Sign in to collect perspectives, uncover patterns, and turn possibility into a plan with your team.</p>
            <div className="login-actions">
              {session?.enabledProviders?.includes('github') &&
                <a className="button primary" href="/auth/github/start">Continue with GitHub</a>}
              {session?.enabledProviders?.includes('google') &&
                <a className="button secondary" href="/auth/google/start">Continue with Google</a>}
              {!session?.enabledProviders?.length &&
                <p role="status">Sign-in providers have not been configured yet.</p>}
            </div>
          </section>
          <aside aria-label="How Brainwave works">
            <span>01</span><p>Gather ideas without losing the human voice.</p>
            <span>02</span><p>Find themes and promising directions.</p>
            <span>03</span><p>Move forward with clear next steps.</p>
          </aside>
        </main>
        <footer><span>Brainwave</span><span>Ideas become clearer when we share them.</span></footer>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setSelectedId(null)} aria-label="Brainwave home">
          <Mark />
          <span>BRAINWAVE</span>
        </button>
        <div className="account">
          <JiraMenu
            connection={jiraConnection}
            loading={jiraLoading}
            error={jiraError}
            onRetry={loadJira}
            onDisconnect={disconnectJira}
          />
          <span className="workspace-pill"><i /> {session.organization.name}</span>
          <span className="user-name">{session.user.name}</span>
          <button className="text-button logout" onClick={() => void logout()} disabled={loggingOut}>
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>
      {selectedId ? (
        <TopicDetail
          topicId={selectedId}
          currentUser={session.user}
          jiraConnection={jiraConnection}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <main className="home">
          <header className="home-hero">
            <div>
              <span className="eyebrow">Your thinking space</span>
              <h1>Better ideas,<br /><em>made together.</em></h1>
              <p>Collect every perspective. Find the patterns. Turn possibility into a plan.</p>
            </div>
            <button className="button primary new-topic" onClick={() => setDialogOpen(true)}>
              <span>＋</span> Start a topic
            </button>
          </header>
          <section className="topics-section" aria-labelledby="topics-heading">
            <div className="section-heading">
              <div><span className="eyebrow">Workspace</span><h2 id="topics-heading">Current topics</h2></div>
              {!loading && <span className="topic-count">{topics.length} total</span>}
            </div>
            {loading ? <Loading /> : error ? <ErrorNotice retry={load}>{error}</ErrorNotice> : topics.length ? (
              <div className="topics-grid">
                {topics.map((topic) => <TopicCard key={topic.id} topic={topic} onOpen={() => openTopic(topic.id)} />)}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-lines" aria-hidden="true"><i /><i /><i /></div>
                <h3>Fresh canvas. Endless possibility.</h3>
                <p>Start a topic, invite some perspectives, and see what takes shape.</p>
                <button className="button secondary" onClick={() => setDialogOpen(true)}>Create your first topic</button>
              </div>
            )}
          </section>
        </main>
      )}
      <footer><span>Brainwave</span><span>Ideas become clearer when we share them.</span></footer>
      <NewTopicDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(topic) => {
          setTopics((current) => [topic, ...current])
          setDialogOpen(false)
          openTopic(topic.id)
        }}
      />
    </div>
  )
}
