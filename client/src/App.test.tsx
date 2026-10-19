import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const topic = {
  id: 'topic-1',
  title: 'Make onboarding kinder',
  description: 'Rethink the first week for new teammates.',
  goal: 'Choose three experiments',
  createdAt: '2026-07-20T12:00:00.000Z',
  ideas: [],
  analysis: null,
}

const session = {
  authenticated: true,
  enabledProviders: ['github', 'google'] as const,
  user: { id: 'user-1', name: 'Mina Park', email: 'mina@example.com', role: 'owner' },
  organization: { id: 'org-1', name: 'Northstar Studio', slug: 'northstar' },
  csrfToken: 'csrf-test-token',
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

describe('Brainwave', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => json({ data: session })))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('lists topics and opens a topic workspace', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [topic] }))
      .mockResolvedValueOnce(await json({ data: { connected: false } }))
      .mockResolvedValueOnce(await json({ data: topic }))
      .mockResolvedValueOnce(await json({ data: [] }))

    render(<App />)
    expect(await screen.findByText(topic.title)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: `Open ${topic.title}` }))
    expect(await screen.findByRole('heading', { name: topic.title })).toBeInTheDocument()
    expect(screen.getByText(topic.goal)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyze ideas' })).toBeDisabled()
  })

  it('creates a topic with trimmed input', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [] }))
      .mockResolvedValueOnce(await json({ data: { connected: false } }))
      .mockResolvedValueOnce(await json({ data: topic }))
      .mockResolvedValueOnce(await json({ data: topic }))
      .mockResolvedValueOnce(await json({ data: [] }))

    render(<App />)
    await screen.findByText('Fresh canvas. Endless possibility.')
    await userEvent.click(screen.getByRole('button', { name: 'Create your first topic' }))
    await userEvent.type(screen.getByLabelText('Topic'), `  ${topic.title}  `)
    await userEvent.type(screen.getByLabelText('Context (optional)'), topic.description)
    await userEvent.type(screen.getByLabelText('Goal'), topic.goal)
    await userEvent.click(screen.getByRole('button', { name: 'Create topic' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
    const options = fetchMock.mock.calls[3][1]
    expect(JSON.parse(String(options?.body))).toMatchObject({ title: topic.title, goal: topic.goal })
    expect(options?.credentials).toBe('include')
    expect(new Headers(options?.headers).get('X-CSRF-Token')).toBe('csrf-test-token')
    expect(await screen.findByRole('heading', { name: topic.title })).toBeInTheDocument()
  })

  it('shows a recoverable API error', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ error: { code: 'unavailable', message: 'Service is warming up' } }, 503))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Service is warming up')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('adds an idea and renders analysis', async () => {
    const populated = { ...topic, ideas: [{ id: 'idea-1', topicId: topic.id, text: 'A welcome buddy', author: 'Mina', createdAt: topic.createdAt }] }
    const analysis = {
      topicId: topic.id,
      themes: ['Human connection'],
      suggestions: ['Pair people across teams'],
      actionItems: [{ text: 'Pilot a buddy program', priority: 'high' }],
      createdAt: topic.createdAt,
    }
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [topic] }))
      .mockResolvedValueOnce(await json({ data: { connected: false } }))
      .mockResolvedValueOnce(await json({ data: populated }))
      .mockResolvedValueOnce(await json({ data: [] }))
      .mockResolvedValueOnce(await json({ data: analysis }))

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: `Open ${topic.title}` }))
    await screen.findByText('A welcome buddy')
    await userEvent.click(screen.getByRole('button', { name: 'Analyze ideas' }))
    expect(await screen.findByText('Human connection')).toBeInTheDocument()
    expect(screen.getByText('Pilot a buddy program')).toBeInTheDocument()
    expect(fetchMock.mock.calls[5][1]?.body).toBe(JSON.stringify({ regenerate: false }))
  })

  it('offers direct OAuth login links when signed out', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(await json({
      data: { authenticated: false, enabledProviders: ['github', 'google'] },
    }))

    render(<App />)

    expect(await screen.findByRole('heading', { name: /bring your best ideas/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute('href', '/auth/github/start')
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/auth/google/start')
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('shows the signed-in account and signs out with CSRF protection', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [] }))
      .mockResolvedValueOnce(await json({ data: { connected: false } }))
      .mockResolvedValueOnce(await json({ data: { authenticated: false } }))

    render(<App />)

    expect(await screen.findByText('Northstar Studio')).toBeInTheDocument()
    expect(screen.getByText('Mina Park')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument()

    const [logoutUrl, logoutOptions] = fetchMock.mock.calls[3]
    expect(logoutUrl).toBe('/auth/logout')
    expect(logoutOptions?.credentials).toBe('include')
    expect(new Headers(logoutOptions?.headers).get('X-CSRF-Token')).toBe('csrf-test-token')
  })

  it('creates and manages an action item without losing returned updates', async () => {
    const baseAction = {
      id: 'action-1',
      topicId: topic.id,
      text: 'Pilot a buddy program',
      priority: 'medium',
      rationale: 'New teammates need a clear first connection.',
      status: 'open',
      assignee: null,
      assigneeId: null,
      provenance: 'manual',
      createdAt: topic.createdAt,
    }
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [topic] }))
      .mockResolvedValueOnce(await json({ data: { connected: false } }))
      .mockResolvedValueOnce(await json({ data: topic }))
      .mockResolvedValueOnce(await json({ data: [] }))
      .mockResolvedValueOnce(await json({ data: baseAction }, 201))
      .mockResolvedValueOnce(await json({ data: { ...baseAction, priority: 'high', rationale: 'Fastest learning path.' } }))
      .mockResolvedValueOnce(await json({ data: { ...baseAction, priority: 'high', rationale: 'Fastest learning path.', status: 'in_progress' } }))
      .mockResolvedValueOnce(await json({
        data: {
          ...baseAction,
          priority: 'high',
          rationale: 'Fastest learning path.',
          status: 'in_progress',
          assignee: { id: session.user.id, name: session.user.name },
          assigneeId: session.user.id,
        },
      }))

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: `Open ${topic.title}` }))
    await screen.findByText('No next moves yet')

    await userEvent.type(screen.getByLabelText('Action'), `  ${baseAction.text}  `)
    await userEvent.type(screen.getByLabelText('Rationale (optional)'), baseAction.rationale)
    await userEvent.click(screen.getByRole('button', { name: 'Add action item' }))
    expect(await screen.findByRole('heading', { name: baseAction.text })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit priority and rationale' }))
    const priorityInputs = screen.getAllByLabelText('Priority')
    const rationaleInputs = screen.getAllByLabelText('Rationale')
    await userEvent.selectOptions(priorityInputs.at(-1)!, 'high')
    await userEvent.clear(rationaleInputs.at(-1)!)
    await userEvent.type(rationaleInputs.at(-1)!, 'Fastest learning path.')
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByText('Fastest learning path.')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText(`Status for ${baseAction.text}`), 'in_progress')
    await waitFor(() => expect(screen.getByLabelText(`Status for ${baseAction.text}`)).toHaveValue('in_progress'))
    await userEvent.click(screen.getByRole('button', { name: 'Claim this' }))
    expect(await screen.findByText(`Owned by ${session.user.name}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unclaim' })).toBeInTheDocument()

    expect(fetchMock.mock.calls[5][0]).toBe(`/topics/${topic.id}/action-items`)
    expect(fetchMock.mock.calls[6][0]).toBe(`/action-items/${baseAction.id}`)
    expect(fetchMock.mock.calls[7][0]).toBe(`/action-items/${baseAction.id}`)
    expect(fetchMock.mock.calls[8][0]).toBe(`/action-items/${baseAction.id}/claim`)
    expect(new Headers(fetchMock.mock.calls[8][1]?.headers).get('X-CSRF-Token')).toBe('csrf-test-token')
  })

  it('reports a claim conflict and keeps the item available', async () => {
    const action = {
      id: 'action-2',
      topicId: topic.id,
      text: 'Host a welcome lunch',
      priority: 'low',
      status: 'open',
      assignee: null,
      provenance: 'ai',
      createdAt: topic.createdAt,
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [topic] }))
      .mockResolvedValueOnce(await json({ data: { connected: false } }))
      .mockResolvedValueOnce(await json({ data: topic }))
      .mockResolvedValueOnce(await json({ data: [action] }))
      .mockResolvedValueOnce(await json({ error: { code: 'CLAIM_CONFLICT', message: 'Already claimed' } }, 409))

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: `Open ${topic.title}` }))
    await userEvent.click(await screen.findByRole('button', { name: 'Claim this' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else claimed this action item first')
    expect(screen.getByRole('heading', { name: action.text })).toBeInTheDocument()
    expect(screen.getByText('Suggested by analysis')).toBeInTheDocument()
  })

  it('shows organization Jira connection controls and disconnects safely', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [] }))
      .mockResolvedValueOnce(await json({ data: { connected: true, siteName: 'Northstar Jira', siteUrl: 'https://example.atlassian.net' } }))
      .mockResolvedValueOnce(await json({ data: { connected: false } }))

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Jira connected' }))
    expect(screen.getByRole('region', { name: 'Jira integration' })).toHaveTextContent('Connected to Northstar Jira')
    expect(screen.getByRole('link', { name: 'Open Jira site ↗' })).toHaveAttribute('href', 'https://example.atlassian.net')
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect Jira' }))
    expect(await screen.findByRole('link', { name: 'Connect Jira' })).toHaveAttribute('href', '/integrations/jira/connect')

    const [url, options] = fetchMock.mock.calls[3]
    expect(url).toBe('/integrations/jira')
    expect(options?.method).toBe('DELETE')
    expect(new Headers(options?.headers).get('X-CSRF-Token')).toBe('csrf-test-token')
  })

  it('creates a Jira issue from an action item and renders the linked issue', async () => {
    const action = {
      id: 'action-jira',
      topicId: topic.id,
      text: 'Ship the onboarding checklist',
      priority: 'high',
      status: 'in_progress',
      provenance: 'manual',
      createdAt: topic.createdAt,
    }
    const linked = {
      ...action,
      jiraIssueId: '10001',
      jiraIssueKey: 'ONB-12',
      jiraIssueUrl: 'https://example.atlassian.net/browse/ONB-12',
      jiraSyncStatus: 'synced',
    }
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [topic] }))
      .mockResolvedValueOnce(await json({ data: { connected: true, siteName: 'Northstar Jira' } }))
      .mockResolvedValueOnce(await json({ data: topic }))
      .mockResolvedValueOnce(await json({ data: [action] }))
      .mockResolvedValueOnce(await json({
        data: [{ id: 'project-1', key: 'ONB', name: 'Onboarding', issueTypes: [{ id: 'task', name: 'Task' }] }],
      }))
      .mockResolvedValueOnce(await json({ data: linked }, 201))

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: `Open ${topic.title}` }))
    await userEvent.click(await screen.findByRole('button', { name: 'Create Jira issue' }))
    await userEvent.selectOptions(screen.getByLabelText('Jira project'), 'ONB')
    await userEvent.selectOptions(screen.getByLabelText('Issue type'), 'task')
    await userEvent.click(screen.getByRole('button', { name: 'Create issue' }))

    expect(await screen.findByRole('link', { name: 'ONB-12 ↗' })).toHaveAttribute(
      'href',
      'https://example.atlassian.net/browse/ONB-12',
    )
    const [url, options] = fetchMock.mock.calls[6]
    expect(url).toBe(`/action-items/${action.id}/jira`)
    expect(JSON.parse(String(options?.body))).toEqual({ projectKey: 'ONB', issueTypeId: 'task' })
    expect(options?.credentials).toBe('include')
  })

  it('rejects malformed Jira responses at the API boundary', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(await json({ data: session }))
      .mockResolvedValueOnce(await json({ data: [] }))
      .mockResolvedValueOnce(await json({ data: { connected: 'yes' } }))

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Connect Jira' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The server returned an invalid response.')
  })
})
