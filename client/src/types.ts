export interface Topic {
  id: string
  title: string
  description: string
  goal: string
  createdAt: string
  ideas?: Idea[]
  analysis?: Analysis | null
  ideaCount?: number
  hasAnalysis?: boolean
}

export interface Idea {
  id: string
  topicId: string
  text: string
  author?: string
  createdAt: string
}

export interface ActionItem {
  id: string
  topicId: string
  text: string
  priority?: 'low' | 'medium' | 'high'
  rationale?: string
  status: 'open' | 'in_progress' | 'done'
  assignee?: Pick<User, 'id' | 'name' | 'avatarUrl'> | null
  assigneeId?: string | null
  assigneeUserId?: string | null
  provenance?: 'manual' | 'ai' | string
  createdBy?: Pick<User, 'id' | 'name'> | null
  createdAt: string
  updatedAt?: string
  jiraIssueId?: string
  jiraIssueKey?: string
  jiraIssueUrl?: string
  jiraSyncStatus?: 'not_synced' | 'pending' | 'synced' | 'error'
  jiraSyncedAt?: string
}

export interface Analysis {
  id?: string
  topicId: string
  themes: Array<string | { name?: string; title?: string; description?: string }>
  suggestions: Array<string | { text?: string; title?: string; description?: string }>
  actionItems: ActionItem[]
  createdAt: string
  regeneratedAt?: string
}

export interface CreateTopicInput {
  title: string
  description: string
  goal: string
}

export interface CreateIdeaInput {
  text: string
  author?: string
}

export interface CreateActionItemInput {
  text: string
  priority?: ActionItem['priority']
  rationale?: string
}

export interface UpdateActionItemInput {
  priority?: ActionItem['priority']
  rationale?: string
  status?: ActionItem['status']
  reopen?: boolean
}

export interface User {
  id: string
  name: string
  email?: string
  avatarUrl?: string
  role?: 'owner' | 'member' | string
}

export interface Organization {
  id: string
  name: string
  slug?: string
}

export interface AuthSession {
  authenticated: boolean
  enabledProviders?: Array<'github' | 'google'>
  user?: User
  organization?: Organization
  csrfToken?: string
}

export interface JiraConnection {
  connected: boolean
  siteName?: string
  siteUrl?: string
  connectedAt?: string
}

export interface JiraIssueType {
  id: string
  name: string
}

export interface JiraProject {
  id: string
  key: string
  name: string
  issueTypes?: JiraIssueType[]
}
