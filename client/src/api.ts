import type {
  ActionItem,
  Analysis,
  AuthSession,
  CreateActionItemInput,
  CreateIdeaInput,
  CreateTopicInput,
  Idea,
  JiraConnection,
  JiraProject,
  Topic,
  UpdateActionItemInput,
} from './types'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
let csrfToken = ''

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.method && options.method !== 'GET' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options?.headers,
    },
  })

  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const nestedError = body?.error
    const errorRecord =
      nestedError && typeof nestedError === 'object'
        ? nestedError as { message?: unknown; code?: unknown; details?: unknown }
        : undefined
    const message =
      (typeof errorRecord?.message === 'string' && errorRecord.message) ||
      (typeof body?.error === 'string' && body.error) ||
      (typeof body?.message === 'string' && body.message) ||
      'Something went wrong. Please try again.'
    throw new ApiError(
      message,
      response.status,
      typeof errorRecord?.code === 'string' ? errorRecord.code : undefined,
      errorRecord?.details,
    )
  }
  return body as T
}

type Validator<T> = (value: unknown) => value is T

function entity<T>(value: unknown, validate?: Validator<T>): T {
  if (!value || typeof value !== 'object' || !('data' in value)) {
    throw new ApiError('The server returned an invalid response.', 502, 'INVALID_RESPONSE')
  }
  const data = (value as { data: unknown }).data
  if (validate && !validate(data)) {
    throw new ApiError('The server returned an invalid response.', 502, 'INVALID_RESPONSE')
  }
  return data as T
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isSession: Validator<AuthSession> = (value): value is AuthSession => {
  if (!isRecord(value) || typeof value.authenticated !== 'boolean') return false
  if (value.enabledProviders !== undefined && (
    !Array.isArray(value.enabledProviders) ||
    value.enabledProviders.some((provider) => provider !== 'github' && provider !== 'google')
  )) return false
  if (!value.authenticated) return true
  return isRecord(value.user) && typeof value.user.id === 'string' &&
    typeof value.user.name === 'string' && isRecord(value.organization) &&
    typeof value.organization.id === 'string' &&
    typeof value.organization.name === 'string' &&
    typeof value.csrfToken === 'string'
}

const isTopic: Validator<Topic> = (value): value is Topic =>
  isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string'

const isIdea: Validator<Idea> = (value): value is Idea =>
  isRecord(value) && typeof value.id === 'string' &&
  typeof value.topicId === 'string' && typeof value.text === 'string'

const isActionItem: Validator<ActionItem> = (value): value is ActionItem =>
  isRecord(value) && typeof value.id === 'string' && typeof value.topicId === 'string' &&
  typeof value.text === 'string' &&
  (value.status === 'open' || value.status === 'in_progress' || value.status === 'done')

const isAnalysis: Validator<Analysis> = (value): value is Analysis =>
  isRecord(value) && typeof value.topicId === 'string' &&
  Array.isArray(value.themes) && Array.isArray(value.suggestions) &&
  Array.isArray(value.actionItems) &&
  value.actionItems.every((item) => isRecord(item) && typeof item.text === 'string')

const isJiraConnection: Validator<JiraConnection> = (value): value is JiraConnection =>
  isRecord(value) && typeof value.connected === 'boolean' &&
  (value.siteName === undefined || typeof value.siteName === 'string') &&
  (value.siteUrl === undefined || typeof value.siteUrl === 'string')

const isJiraProject: Validator<JiraProject> = (value): value is JiraProject =>
  isRecord(value) && typeof value.id === 'string' && typeof value.key === 'string' &&
  typeof value.name === 'string' && (value.issueTypes === undefined ||
    (Array.isArray(value.issueTypes) && value.issueTypes.every((issueType) =>
      isRecord(issueType) && typeof issueType.id === 'string' && typeof issueType.name === 'string')))

export const api = {
  async getSession(): Promise<AuthSession> {
    const session = entity<AuthSession>(await request<{ data: AuthSession }>('/auth/session'), isSession)
    csrfToken = session.csrfToken ?? ''
    return session
  },
  async logout(): Promise<void> {
    await request('/auth/logout', { method: 'POST' })
    csrfToken = ''
  },
  async listTopics(): Promise<Topic[]> {
    return entity<Topic[]>(await request<{ data: Topic[] }>('/topics'), (value): value is Topic[] =>
      Array.isArray(value) && value.every(isTopic))
  },
  async getTopic(id: string): Promise<Topic> {
    return entity<Topic>(await request<{ data: Topic }>(`/topics/${id}`), isTopic)
  },
  async createTopic(input: CreateTopicInput): Promise<Topic> {
    return entity<Topic>(await request<{ data: Topic }>('/topics', {
      method: 'POST',
      body: JSON.stringify(input),
    }), isTopic)
  },
  async addIdea(topicId: string, input: CreateIdeaInput): Promise<Idea> {
    return entity<Idea>(await request<{ data: Idea }>(`/topics/${topicId}/ideas`, {
      method: 'POST',
      body: JSON.stringify(input),
    }), isIdea)
  },
  async analyze(topicId: string, regenerate = false): Promise<Analysis> {
    return entity<Analysis>(await request<{ data: Analysis }>(
      `/topics/${topicId}/analyze`,
      { method: 'POST', body: JSON.stringify({ regenerate }) },
    ), isAnalysis)
  },
  async listActionItems(topicId: string): Promise<ActionItem[]> {
    return entity<ActionItem[]>(await request<{ data: ActionItem[] }>(`/topics/${topicId}/action-items`),
      (value): value is ActionItem[] => Array.isArray(value) && value.every(isActionItem))
  },
  async createActionItem(topicId: string, input: CreateActionItemInput): Promise<ActionItem> {
    return entity<ActionItem>(await request<{ data: ActionItem }>(`/topics/${topicId}/action-items`, {
      method: 'POST',
      body: JSON.stringify(input),
    }), isActionItem)
  },
  async updateActionItem(id: string, input: UpdateActionItemInput): Promise<ActionItem> {
    return entity<ActionItem>(await request<{ data: ActionItem }>(`/action-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }), isActionItem)
  },
  async claimActionItem(id: string): Promise<ActionItem> {
    return entity<ActionItem>(await request<{ data: ActionItem }>(`/action-items/${id}/claim`, {
      method: 'POST',
    }), isActionItem)
  },
  async unclaimActionItem(id: string): Promise<ActionItem> {
    return entity<ActionItem>(await request<{ data: ActionItem }>(`/action-items/${id}/claim`, {
      method: 'DELETE',
    }), isActionItem)
  },
  async getJiraStatus(): Promise<JiraConnection> {
    return entity<JiraConnection>(
      await request<{ data: JiraConnection }>('/integrations/jira/status'),
      isJiraConnection,
    )
  },
  async listJiraProjects(): Promise<JiraProject[]> {
    return entity<JiraProject[]>(
      await request<{ data: JiraProject[] }>('/integrations/jira/projects'),
      (value): value is JiraProject[] => Array.isArray(value) && value.every(isJiraProject),
    )
  },
  async createJiraIssue(actionItemId: string, input: { projectKey: string; issueTypeId?: string }): Promise<ActionItem> {
    return entity<ActionItem>(await request<{ data: ActionItem }>(`/action-items/${actionItemId}/jira`, {
      method: 'POST',
      body: JSON.stringify(input),
    }), isActionItem)
  },
  async syncJiraStatus(actionItemId: string): Promise<ActionItem> {
    return entity<ActionItem>(await request<{ data: ActionItem }>(
      `/action-items/${actionItemId}/jira/sync`,
      { method: 'POST' },
    ), isActionItem)
  },
  async disconnectJira(): Promise<void> {
    await request('/integrations/jira', { method: 'DELETE' })
  },
}
