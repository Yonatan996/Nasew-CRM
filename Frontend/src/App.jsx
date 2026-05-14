import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import {
  Bell,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LineChart,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  Users,
  Wallet,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'nasew-crm-token'
const USER_KEY = 'nasew-crm-user'
const THEME_KEY = 'nasew-crm-theme'

const money = new Intl.NumberFormat('en-ET', {
  style: 'currency',
  currency: 'ETB',
  maximumFractionDigits: 0,
})

const roleLabel = {
  admin: 'Admin',
  manager: 'Manager',
  sales: 'Sales Agent',
  operations: 'Operations Officer',
}

const navByRole = {
  sales: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'pipeline', label: 'Pipeline', icon: LineChart },
    { id: 'contracts', label: 'Contracts', icon: FileText },
    { id: 'activities', label: 'Activities', icon: ClipboardList },
    { id: 'approvals', label: 'Approvals', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ],
  operations: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'properties', label: 'Properties', icon: Building2 },
    { id: 'payments', label: 'Payments', icon: Wallet },
    { id: 'contracts', label: 'Contracts', icon: FileText },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'approvals', label: 'Approvals', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ],
  manager: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pipeline', label: 'Pipeline', icon: LineChart },
    { id: 'contracts', label: 'Contracts', icon: FileText },
    { id: 'properties', label: 'Properties', icon: Building2 },
    { id: 'approvals', label: 'Approvals', icon: Shield },
    { id: 'reports', label: 'Reports', icon: ClipboardList },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ],
  admin: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'contracts', label: 'Contracts', icon: FileText },
    { id: 'properties', label: 'Properties', icon: Building2 },
    { id: 'approvals', label: 'Approvals', icon: Shield },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'audits', label: 'Audit Logs', icon: FileText },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ],
}

function normalizeApiData(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeApiData)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const normalized = {}
  for (const [key, item] of Object.entries(value)) {
    normalized[key] = normalizeApiData(item)
  }

  if (!normalized.id && normalized._id) {
    normalized.id = String(normalized._id)
  }

  return normalized
}

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || 'Request failed')
  }

  return normalizeApiData(data)
}

function useSession() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  })

  const saveSession = (nextToken, nextUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
  }

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken('')
    setUser(null)
  }

  return { token, user, saveSession, clearSession }
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  return {
    theme,
    toggleTheme: () => setTheme((current) => (current === 'light' ? 'dark' : 'light')),
  }
}

function App() {
  const { theme, toggleTheme } = useTheme()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<CRMApp theme={theme} onToggleTheme={toggleTheme} />} />
      </Routes>
    </BrowserRouter>
  )
}

function CRMApp({ theme, onToggleTheme }) {
  const { token, user, saveSession, clearSession } = useSession()
  const [bootstrap, setBootstrap] = useState(null)
  const [reports, setReports] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [reportFilters, setReportFilters] = useState({
    from: '',
    to: '',
    agentId: '',
  })

  const loadBootstrap = async () => {
    if (!token) {
      return
    }

    setStatus('loading')
    try {
      const data = await api('/bootstrap', { token })
      setBootstrap(data)
      setError('')
      setStatus('ready')
    } catch (requestError) {
      setError(requestError.message)
      clearSession()
      setStatus('idle')
    }
  }

  useEffect(() => {
    loadBootstrap()
  }, [token])

  useEffect(() => {
    if (!token || !user || (user.role !== 'manager' && user.role !== 'admin')) {
      setReports(null)
      return
    }

    const params = new URLSearchParams()
    if (reportFilters.from) {
      params.set('from', reportFilters.from)
    }
    if (reportFilters.to) {
      params.set('to', reportFilters.to)
    }
    if (reportFilters.agentId) {
      params.set('agentId', reportFilters.agentId)
    }

    const path = params.toString() ? `/reports/summary?${params.toString()}` : '/reports/summary'
    api(path, { token })
      .then((summary) => setReports(summary))
      .catch(() => setReports(null))
  }, [token, user, reportFilters])

  if (!token || !user) {
    return <LoginScreen onAuthenticated={saveSession} error={error} theme={theme} onToggleTheme={onToggleTheme} />
  }

  if (status === 'loading' || !bootstrap) {
    return <LoadingScreen />
  }

  return (
    <Workspace
      bootstrap={bootstrap}
      reports={reports}
      reportFilters={reportFilters}
      onReportFilterChange={setReportFilters}
      token={token}
      theme={theme}
      onToggleTheme={onToggleTheme}
      user={user}
      onLogout={clearSession}
      onRefresh={loadBootstrap}
    />
  )
}

function LoginScreen({ onAuthenticated, error, theme, onToggleTheme }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(error || '')

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: form,
      })
      onAuthenticated(data.token, data.user)
    } catch (requestError) {
      setMessage(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="theme-switcher floating">
        <button type="button" className="theme-toggle" onClick={onToggleTheme}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
        </button>
      </div>
      <div className="hero-panel">
        <p className="eyebrow">Customer Relation Management System</p>
        <h1>Nasew Real Estate CRM</h1>
        <p className="hero-copy muted">
          Track real estate clients, properties, approvals, contracts, and follow-ups in one polished operational workspace.
        </p>
      </div>

      <form className="login-card" onSubmit={submit}>
        <div>
          <p className="eyebrow">Secure Access</p>
          <h2>Sign in to continue</h2>
          <p className="muted">Enter your account credentials to continue.</p>
        </div>

        <label>
          Email
          <input
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="Enter your email"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Enter your password"
          />
        </label>

        {message ? <p className="form-error">{message}</p> : null}

        <button className="primary-button" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="loading-shell">
      <div className="loading-card">
        <div className="loading-dot" />
        <p>Loading the CRM workspace...</p>
      </div>
    </div>
  )
}

function Workspace({ bootstrap, reports, reportFilters, onReportFilterChange, token, theme, onToggleTheme, user, onLogout, onRefresh }) {
  const nav = navByRole[user.role] || navByRole.sales
  const [section, setSection] = useState(nav[0]?.id || 'dashboard')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!nav.some((item) => item.id === section)) {
      setSection(nav[0]?.id || 'dashboard')
    }
  }, [user.role])

  const submitAction = async (path, method, body) => {
    setBusy(true)
    setMessage('')
    try {
      await api(path, { token, method, body })
      await onRefresh()
      setMessage('Changes saved.')
    } catch (requestError) {
      setMessage(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const headerText = useMemo(() => {
    const metric = bootstrap.dashboard.metrics
    return `${metric.totalClients} clients, ${metric.activeDeals} active deals, ${metric.availableProperties} available properties`
  }, [bootstrap])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Proposal-aligned build</p>
          <h2>Nasew CRM</h2>
          <p className="muted">{roleLabel[user.role]} workspace</p>
        </div>

        <nav className="nav-stack">
          {nav.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-link ${active ? 'active' : ''}`}
                onClick={() => setSection(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="theme-toggle" onClick={onToggleTheme}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>

          <button type="button" className="ghost-button logout-button" onClick={onLogout}>
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operational snapshot</p>
            <h1>{user.fullName}</h1>
            <p className="muted">{headerText}</p>
          </div>
          <div className="status-cluster">
            <span className="pill neutral-pill">{new Date().toLocaleDateString()}</span>
            <span className="pill">{roleLabel[user.role]}</span>
            <span className="pill muted-pill">{user.department}</span>
          </div>
        </header>

        {message ? <div className="banner">{message}</div> : null}

        <section className="content-grid">
          {section === 'dashboard' ? <DashboardSection bootstrap={bootstrap} /> : null}
          {section === 'clients' ? (
            <ClientsSection
              clients={bootstrap.clients}
              canCreate={user.role === 'sales' || user.role === 'admin'}
              canCommunicate={user.role === 'sales' || user.role === 'manager' || user.role === 'admin'}
              onCreate={(body) => submitAction('/clients', 'POST', body)}
              onLogCommunication={(clientId, body) => submitAction(`/clients/${clientId}/communications`, 'POST', body)}
            />
          ) : null}
          {section === 'pipeline' ? (
            <PipelineSection
              pipelines={bootstrap.pipelines}
              clients={bootstrap.clients}
              properties={bootstrap.properties}
              canEdit={['sales', 'manager', 'admin'].includes(user.role)}
              onUpdate={(id, body) => submitAction(`/pipelines/${id}`, 'PATCH', body)}
              onReserve={
                user.role === 'sales' || user.role === 'admin'
                  ? (propertyId, body) => submitAction(`/properties/${propertyId}/reserve`, 'POST', body)
                  : null
              }
              onCreate={
                user.role === 'sales' || user.role === 'admin'
                  ? (body) => submitAction('/pipelines', 'POST', body)
                  : null
              }
            />
          ) : null}
          {section === 'contracts' ? (
            <ContractsSection
              contracts={bootstrap.contracts}
              clients={bootstrap.clients}
              properties={bootstrap.properties}
              canCreate={user.role === 'sales' || user.role === 'operations' || user.role === 'admin'}
              canSubmit={user.role === 'sales' || user.role === 'operations' || user.role === 'admin'}
              canReview={user.role === 'manager' || user.role === 'admin'}
              canFinalize={user.role === 'operations' || user.role === 'admin'}
              onCreate={(body) => submitAction('/contracts', 'POST', body)}
              onUpdate={(id, body) => submitAction(`/contracts/${id}`, 'PATCH', body)}
            />
          ) : null}
          {section === 'activities' ? (
            <ActivitiesSection
              activities={bootstrap.activities}
              clients={bootstrap.clients}
              onCreate={(body) => submitAction('/activities', 'POST', body)}
            />
          ) : null}
          {section === 'properties' ? (
            <PropertiesSection
              properties={bootstrap.properties}
              canCreate={user.role === 'operations' || user.role === 'admin'}
              canEdit={user.role === 'operations' || user.role === 'admin'}
              onCreate={(body) => submitAction('/properties', 'POST', body)}
              onUpdate={(id, body) => submitAction(`/properties/${id}`, 'PATCH', body)}
            />
          ) : null}
          {section === 'payments' ? (
            <PaymentsSection
              payments={bootstrap.payments}
              clients={bootstrap.clients}
              properties={bootstrap.properties}
              onCreate={(body) => submitAction('/payments', 'POST', body)}
              onValidate={(id) => submitAction(`/payments/${id}`, 'PATCH', { status: 'Validated' })}
            />
          ) : null}
          {section === 'documents' ? (
            <DocumentsSection
              documents={bootstrap.documents}
              clients={bootstrap.clients}
              properties={bootstrap.properties}
              onCreate={(body) => submitAction('/documents', 'POST', body)}
              onApprove={(id) => submitAction(`/documents/${id}`, 'PATCH', { status: 'Approved' })}
              onRequestApproval={(document) =>
                submitAction('/approvals', 'POST', {
                  type: 'Document Approval',
                  title: `Approve ${document.fileName}`,
                  details: `${document.documentType} requires review before final processing.`,
                  relatedEntity: { entityType: 'document', entityId: document.id },
                })
              }
            />
          ) : null}
          {section === 'approvals' ? (
            <ApprovalsSection
              approvals={bootstrap.approvals}
              canReview={user.role === 'manager' || user.role === 'admin'}
              canRequest={user.role === 'sales' || user.role === 'operations' || user.role === 'admin'}
              onCreate={(body) => submitAction('/approvals', 'POST', body)}
              onReview={(id, status) => submitAction(`/approvals/${id}`, 'PATCH', { status })}
            />
          ) : null}
          {section === 'reports' ? (
            <ReportsSection
              reports={reports}
              dashboard={bootstrap.dashboard}
              clients={bootstrap.clients}
              users={bootstrap.users}
              filters={reportFilters}
              onFilterChange={onReportFilterChange}
            />
          ) : null}
          {section === 'users' ? (
            <UsersSection
              users={bootstrap.users}
              onCreate={(body) => submitAction('/users', 'POST', body)}
              onToggleStatus={(id, status) => submitAction(`/users/${id}`, 'PATCH', { status })}
              onDelete={(id) => submitAction(`/users/${id}`, 'DELETE')}
            />
          ) : null}
          {section === 'settings' ? (
            <SettingsSection settings={bootstrap.settings} onSave={(body) => submitAction('/settings', 'PATCH', body)} />
          ) : null}
          {section === 'audits' ? <AuditsSection audits={bootstrap.audits} /> : null}
          {section === 'notifications' ? (
            <NotificationsSection
              notifications={bootstrap.notifications}
              onMarkRead={(id) => submitAction(`/notifications/${id}`, 'PATCH', { status: 'Read' })}
            />
          ) : null}
        </section>

        {busy ? <div className="busy-indicator">Saving updates...</div> : null}
      </main>
    </div>
  )
}

function DashboardSection({ bootstrap }) {
  const { metrics, spotlight } = bootstrap.dashboard
  const cards = [
    ['Total Clients', metrics.totalClients],
    ['Active Deals', metrics.activeDeals],
    ['Available Properties', metrics.availableProperties],
    ['Pending Approvals', metrics.pendingApprovals],
    ['Pending Contracts', metrics.pendingContracts || 0],
    ['Pending Payments', metrics.pendingPayments],
    ['Revenue Collected', money.format(metrics.revenueCollected)],
  ]

  return (
    <>
      <Panel title="Overview" subtitle="Real-time snapshot of proposal-critical activity.">
        <div className="metric-grid">
          {cards.map(([label, value]) => (
            <div className="metric-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Pipeline Distribution" subtitle="Current volume across the sales lifecycle.">
        <div className="bar-stack">
          {spotlight.pipelineDistribution.map((item) => (
            <div className="bar-row" key={item.stage}>
              <span>{item.stage}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.max(item.count * 18, item.count ? 12 : 4)}%` }} />
              </div>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Next Activities" subtitle="Scheduled touchpoints and follow-up work.">
        <SimpleList
          items={spotlight.nextActivities.map((activity) => ({
            title: activity.activityType,
            meta: `${activity.scheduledDate} at ${activity.scheduledTime}`,
            body: activity.notes || activity.location,
          }))}
          emptyText="No activities scheduled."
        />
      </Panel>

      <Panel title="Pending Approvals" subtitle="Pricing requests, reservations, and contract reviews.">
        <SimpleList
          items={spotlight.pendingApprovals.map((approval) => ({
            title: approval.title,
            meta: approval.type,
            body: approval.details,
          }))}
          emptyText="No approvals are waiting right now."
        />
      </Panel>
    </>
  )
}

function ClientsSection({ clients, canCreate, canCommunicate, onCreate, onLogCommunication }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    leadSource: 'Website',
    status: 'Lead',
  })
  const [communication, setCommunication] = useState({
    clientId: clients[0]?.id || '',
    channel: 'Phone',
    note: '',
    followUpDate: new Date().toISOString().slice(0, 10),
  })

  return (
    <>
      <Panel title="Client Portfolio" subtitle="Centralized lead and client repository.">
        <DataTable
          columns={['Name', 'Lead Source', 'Status', 'Phone', 'Email', 'Follow-Up', 'Communication Log']}
          rows={clients.map((client) => [
            `${client.firstName} ${client.lastName}`,
            client.leadSource,
            <span className="pill" key={client.id}>{client.status}</span>,
            client.phone,
            client.email,
            client.followUpDate || 'Not set',
            client.communicationHistory?.length
              ? `${client.communicationHistory.length} entries`
              : 'No entries',
          ])}
        />
      </Panel>

      {canCreate ? (
        <Panel title="Register New Lead" subtitle="FR3, FR4 and FR5 from the proposal.">
          <FormGrid
            fields={[
              textField('First name', form.firstName, (value) => setForm((current) => ({ ...current, firstName: value }))),
              textField('Last name', form.lastName, (value) => setForm((current) => ({ ...current, lastName: value }))),
              textField('Email', form.email, (value) => setForm((current) => ({ ...current, email: value }))),
              textField('Phone', form.phone, (value) => setForm((current) => ({ ...current, phone: value }))),
              textField('Lead source', form.leadSource, (value) => setForm((current) => ({ ...current, leadSource: value }))),
              textField('Status', form.status, (value) => setForm((current) => ({ ...current, status: value }))),
            ]}
            actionLabel="Create client"
            onSubmit={() => {
              onCreate(form)
              setForm({ firstName: '', lastName: '', email: '', phone: '', leadSource: 'Website', status: 'Lead' })
            }}
          />
        </Panel>
      ) : null}

      {canCommunicate ? (
        <Panel title="Log Client Communication" subtitle="UC-19, UC-23 and FR18-FR20 from the UML and requirements.">
          <FormGrid
            fields={[
              selectField('Client', communication.clientId, (value) => setCommunication((current) => ({ ...current, clientId: value })), clients.map((client) => ({
                label: `${client.firstName} ${client.lastName}`,
                value: client.id,
              }))),
              textField('Channel', communication.channel, (value) => setCommunication((current) => ({ ...current, channel: value }))),
              textField('Follow-up date', communication.followUpDate, (value) => setCommunication((current) => ({ ...current, followUpDate: value })), 'date'),
              textField('Communication note', communication.note, (value) => setCommunication((current) => ({ ...current, note: value }))),
            ]}
            actionLabel="Save communication"
            onSubmit={() => {
              onLogCommunication(communication.clientId, communication)
              setCommunication((current) => ({ ...current, note: '' }))
            }}
          />
        </Panel>
      ) : null}

      <Panel title="Recent Communication History" subtitle="Centralized interaction trail by client.">
        <div className="stack">
          {clients.map((client) => (
            <div className="list-card" key={client.id}>
              <strong>{client.firstName} {client.lastName}</strong>
              <span className="muted">Next follow-up: {client.followUpDate || 'Not scheduled'}</span>
              <p>
                {client.communicationHistory?.length
                  ? `${client.communicationHistory[client.communicationHistory.length - 1].channel}: ${client.communicationHistory[client.communicationHistory.length - 1].note}`
                  : 'No communication has been logged yet.'}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}

function PipelineSection({ pipelines, clients, properties, canEdit, onUpdate, onReserve, onCreate }) {
  const [form, setForm] = useState({
    clientId: clients[0]?.id || '',
    propertyId: properties[0]?.id || '',
    currentStage: 'Lead',
    probability: 20,
    estimatedValue: properties[0]?.price || 0,
  })

  const clientName = (id) => {
    const client = clients.find((item) => item.id === id)
    return client ? `${client.firstName} ${client.lastName}` : id
  }

  const propertyName = (id) => properties.find((item) => item.id === id)?.title || id

  return (
    <>
      <Panel title="Sales Pipeline" subtitle="Track pipeline stage changes and closing probability.">
        <div className="stack">
          {pipelines.map((pipeline) => (
            <div className="pipeline-card" key={pipeline.id}>
              <div>
                <strong>{clientName(pipeline.clientId)}</strong>
                <p className="muted">{propertyName(pipeline.propertyId)}</p>
              </div>
              <div className="pipeline-controls">
                <span className="pill">{pipeline.currentStage}</span>
                <span className="muted">{pipeline.probability}% probability</span>
                <span className="muted">{properties.find((item) => item.id === pipeline.propertyId)?.status || 'Unknown status'}</span>
                {canEdit ? (
                  <select
                    value={pipeline.currentStage}
                    onChange={(event) => onUpdate(pipeline.id, { currentStage: event.target.value })}
                  >
                    {['Lead', 'Qualified', 'Prospect', 'Negotiation', 'Reserved', 'Contract', 'Closed'].map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                ) : null}
                {onReserve && properties.find((item) => item.id === pipeline.propertyId)?.status === 'Available' ? (
                  <button
                    type="button"
                    className="inline-button"
                    onClick={() =>
                      onReserve(pipeline.propertyId, {
                        clientId: pipeline.clientId,
                        estimatedValue: pipeline.estimatedValue,
                        probability: pipeline.probability,
                      })
                    }
                  >
                    Reserve property
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {onCreate ? (
        <Panel title="Open New Deal" subtitle="Create and assign a fresh pipeline record.">
          <FormGrid
            fields={[
              selectField('Client', form.clientId, (value) => setForm((current) => ({ ...current, clientId: value })), clients.map((client) => ({
                label: `${client.firstName} ${client.lastName}`,
                value: client.id,
              }))),
              selectField('Property', form.propertyId, (value) => setForm((current) => ({ ...current, propertyId: value })), properties.map((property) => ({
                label: property.title,
                value: property.id,
              }))),
              textField('Stage', form.currentStage, (value) => setForm((current) => ({ ...current, currentStage: value }))),
              textField('Probability', String(form.probability), (value) => setForm((current) => ({ ...current, probability: Number(value || 0) }))),
              textField('Estimated value', String(form.estimatedValue), (value) => setForm((current) => ({ ...current, estimatedValue: Number(value || 0) }))),
            ]}
            actionLabel="Create pipeline"
            onSubmit={() => onCreate(form)}
          />
        </Panel>
      ) : null}
    </>
  )
}

function ActivitiesSection({ activities, clients, onCreate }) {
  const [form, setForm] = useState({
    clientId: clients[0]?.id || '',
    activityType: 'Follow-up Call',
    scheduledDate: new Date().toISOString().slice(0, 10),
    scheduledTime: '09:00',
    notes: '',
  })

  const clientName = (id) => {
    const client = clients.find((item) => item.id === id)
    return client ? `${client.firstName} ${client.lastName}` : id
  }

  return (
    <>
      <Panel title="Scheduled Activities" subtitle="Follow-ups, site visits, and appointment management.">
        <DataTable
          columns={['Client', 'Activity', 'Date', 'Time', 'Status', 'Notes']}
          rows={activities.map((activity) => [
            clientName(activity.clientId),
            activity.activityType,
            activity.scheduledDate,
            activity.scheduledTime,
            activity.status,
            activity.notes,
          ])}
        />
      </Panel>

      <Panel title="Schedule Follow-Up" subtitle="Create reminders and appointment actions.">
        <FormGrid
          fields={[
            selectField('Client', form.clientId, (value) => setForm((current) => ({ ...current, clientId: value })), clients.map((client) => ({
              label: `${client.firstName} ${client.lastName}`,
              value: client.id,
            }))),
            textField('Activity type', form.activityType, (value) => setForm((current) => ({ ...current, activityType: value }))),
            textField('Date', form.scheduledDate, (value) => setForm((current) => ({ ...current, scheduledDate: value })), 'date'),
            textField('Time', form.scheduledTime, (value) => setForm((current) => ({ ...current, scheduledTime: value })), 'time'),
            textField('Notes', form.notes, (value) => setForm((current) => ({ ...current, notes: value }))),
          ]}
          actionLabel="Schedule activity"
          onSubmit={() => onCreate(form)}
        />
      </Panel>
    </>
  )
}

function PropertiesSection({ properties, canCreate, canEdit, onCreate, onUpdate }) {
  const [form, setForm] = useState({
    propertyType: 'Apartment',
    title: '',
    location: '',
    size: 120,
    price: 0,
    status: 'Available',
  })

  return (
    <>
      <Panel title="Property Inventory" subtitle="Availability, pricing, and listing control.">
        <div className="stack">
          {properties.map((property) => (
            <div className="property-card" key={property.id}>
              <div>
                <strong>{property.title}</strong>
                <p className="muted">{property.location} • {property.propertyType}</p>
              </div>
              <div className="property-meta">
                <span>{money.format(property.price)}</span>
                <span>{property.size} sqm</span>
                {canEdit ? (
                  <select
                    value={property.status}
                    onChange={(event) => onUpdate(property.id, { status: event.target.value })}
                  >
                    {['Available', 'Reserved', 'Booked', 'Sold'].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="pill">{property.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {canCreate ? (
        <Panel title="Add Property" subtitle="Operations and admin inventory entry.">
          <FormGrid
            fields={[
              textField('Property type', form.propertyType, (value) => setForm((current) => ({ ...current, propertyType: value }))),
              textField('Title', form.title, (value) => setForm((current) => ({ ...current, title: value }))),
              textField('Location', form.location, (value) => setForm((current) => ({ ...current, location: value }))),
              textField('Size (sqm)', String(form.size), (value) => setForm((current) => ({ ...current, size: Number(value || 0) }))),
              textField('Price', String(form.price), (value) => setForm((current) => ({ ...current, price: Number(value || 0) }))),
              textField('Status', form.status, (value) => setForm((current) => ({ ...current, status: value }))),
            ]}
            actionLabel="Create property"
            onSubmit={() => onCreate(form)}
          />
        </Panel>
      ) : null}
    </>
  )
}

function PaymentsSection({ payments, clients, properties, onCreate, onValidate }) {
  const [form, setForm] = useState({
    clientId: clients[0]?.id || '',
    propertyId: properties[0]?.id || '',
    amount: 0,
    transactionType: 'Reservation',
    receiptReference: '',
    evidenceFileName: '',
  })

  const clientName = (id) => {
    const client = clients.find((item) => item.id === id)
    return client ? `${client.firstName} ${client.lastName}` : id
  }

  const propertyName = (id) => properties.find((item) => item.id === id)?.title || id

  return (
    <>
      <Panel title="Payment Validation" subtitle="Track reservation, booking, and settlement stages.">
        <DataTable
          columns={['Client', 'Property', 'Type', 'Amount', 'Evidence', 'Status', 'Action']}
          rows={payments.map((payment) => [
            clientName(payment.clientId),
            propertyName(payment.propertyId),
            payment.transactionType,
            money.format(payment.amount),
            payment.evidenceFileName || 'Not uploaded',
            payment.status,
            payment.status === 'Validated' ? (
              'Validated'
            ) : (
              <button key={payment.id} className="inline-button" onClick={() => onValidate(payment.id)}>
                Validate
              </button>
            ),
          ])}
        />
      </Panel>

      <Panel title="Record Payment" subtitle="Operations records incoming customer payment evidence.">
        <FormGrid
          fields={[
            selectField('Client', form.clientId, (value) => setForm((current) => ({ ...current, clientId: value })), clients.map((client) => ({
              label: `${client.firstName} ${client.lastName}`,
              value: client.id,
            }))),
            selectField('Property', form.propertyId, (value) => setForm((current) => ({ ...current, propertyId: value })), properties.map((property) => ({
              label: property.title,
              value: property.id,
            }))),
            textField('Amount', String(form.amount), (value) => setForm((current) => ({ ...current, amount: Number(value || 0) }))),
            textField('Transaction type', form.transactionType, (value) => setForm((current) => ({ ...current, transactionType: value }))),
            textField('Receipt reference', form.receiptReference, (value) => setForm((current) => ({ ...current, receiptReference: value }))),
            textField('Evidence file name', form.evidenceFileName, (value) => setForm((current) => ({ ...current, evidenceFileName: value }))),
          ]}
          actionLabel="Create payment"
          onSubmit={() => onCreate(form)}
        />
      </Panel>
    </>
  )
}

function ContractsSection({ contracts, clients, properties, canCreate, canSubmit, canReview, canFinalize, onCreate, onUpdate }) {
  const [form, setForm] = useState({
    clientId: clients[0]?.id || '',
    propertyId: properties.find((property) => property.status === 'Reserved')?.id || properties[0]?.id || '',
    title: '',
    terms: '',
    version: 1,
  })

  const clientName = (id) => {
    const client = clients.find((item) => item.id === id)
    return client ? `${client.firstName} ${client.lastName}` : id
  }

  const propertyName = (id) => properties.find((item) => item.id === id)?.title || id

  return (
    <>
      <Panel title="Contract Workflow" subtitle="UC-07, UC-22 and UC-31 from the UML.">
        <DataTable
          columns={['Client', 'Property', 'Title', 'Version', 'Status', 'Action']}
          rows={contracts.map((contract) => [
            clientName(contract.clientId),
            propertyName(contract.propertyId),
            contract.title,
            `v${contract.version}`,
            contract.status,
            <div key={contract.id} className="approval-actions">
              {canSubmit && contract.status === 'Draft' ? (
                <button className="inline-button" onClick={() => onUpdate(contract.id, { status: 'Pending Approval' })}>
                  Submit
                </button>
              ) : null}
              {canReview && contract.status === 'Pending Approval' ? (
                <button className="inline-button" onClick={() => onUpdate(contract.id, { status: 'Approved' })}>
                  Approve
                </button>
              ) : null}
              {canReview && contract.status === 'Pending Approval' ? (
                <button className="ghost-button small-button" onClick={() => onUpdate(contract.id, { status: 'Rejected' })}>
                  Reject
                </button>
              ) : null}
              {canFinalize && contract.status === 'Approved' ? (
                <button className="inline-button" onClick={() => onUpdate(contract.id, { status: 'Finalized' })}>
                  Finalize
                </button>
              ) : null}
              {!canSubmit && !canReview && !canFinalize ? 'View only' : null}
            </div>,
          ])}
        />
      </Panel>

      <Panel title="Contract Review Queue" subtitle="Terms, approval state, and finalization readiness.">
        <div className="stack">
          {contracts.map((contract) => (
            <div className="list-card" key={contract.id}>
              <strong>{contract.title}</strong>
              <span className="muted">{clientName(contract.clientId)} • {propertyName(contract.propertyId)}</span>
              <p>Status: {contract.status} • Version: v{contract.version}</p>
              <p>{contract.terms || 'No terms have been entered yet.'}</p>
            </div>
          ))}
        </div>
      </Panel>

      {canCreate ? (
        <Panel title="Generate Contract" subtitle="Create a contract after reservation, then route it for approval.">
          <FormGrid
            fields={[
              selectField('Client', form.clientId, (value) => setForm((current) => ({ ...current, clientId: value })), clients.map((client) => ({
                label: `${client.firstName} ${client.lastName}`,
                value: client.id,
              }))),
              selectField('Property', form.propertyId, (value) => setForm((current) => ({ ...current, propertyId: value })), properties.map((property) => ({
                label: `${property.title} (${property.status})`,
                value: property.id,
              }))),
              textField('Title', form.title, (value) => setForm((current) => ({ ...current, title: value }))),
              textField('Version', String(form.version), (value) => setForm((current) => ({ ...current, version: Number(value || 1) }))),
              textField('Terms', form.terms, (value) => setForm((current) => ({ ...current, terms: value }))),
            ]}
            actionLabel="Create contract"
            onSubmit={() =>
              onCreate({
                ...form,
                title: form.title || `Contract for ${propertyName(form.propertyId)}`,
              })
            }
          />
        </Panel>
      ) : null}
    </>
  )
}

function DocumentsSection({ documents, clients, properties, onCreate, onApprove, onRequestApproval }) {
  const [form, setForm] = useState({
    clientId: clients[0]?.id || '',
    propertyId: properties[0]?.id || '',
    documentType: 'Contract',
    fileName: 'new-contract.pdf',
    version: 1,
    filePath: '',
  })

  const clientName = (id) => {
    const client = clients.find((item) => item.id === id)
    return client ? `${client.firstName} ${client.lastName}` : id
  }

  const propertyName = (id) => properties.find((item) => item.id === id)?.title || id
  const latestVersion = documents
    .filter(
      (document) =>
        document.clientId === form.clientId &&
        document.propertyId === form.propertyId &&
        document.documentType === form.documentType,
    )
    .reduce((max, document) => Math.max(max, Number(document.version || 0)), 0)

  return (
    <>
      <Panel title="Document Control" subtitle="Versioned contract and file tracking.">
        <DataTable
          columns={['Client', 'Property', 'Type', 'Version', 'Status', 'Storage Path', 'Action']}
          rows={documents.map((document) => [
            clientName(document.clientId),
            propertyName(document.propertyId),
            document.documentType,
            `v${document.version}`,
            document.status,
            document.filePath,
            <div key={document.id} className="approval-actions">
              {document.status === 'Approved' ? 'Approved' : null}
              {document.status !== 'Approved' ? (
                <button className="inline-button" onClick={() => onApprove(document.id)}>
                  Approve
                </button>
              ) : null}
              {document.status !== 'Pending Approval' && document.status !== 'Approved' ? (
                <button className="ghost-button small-button" onClick={() => onRequestApproval(document)}>
                  Request review
                </button>
              ) : null}
            </div>,
          ])}
        />
      </Panel>

      <Panel title="Document Queue" subtitle="Review readiness for uploaded operational documents.">
        <div className="stack">
          {documents.map((document) => (
            <div className="list-card" key={document.id}>
              <strong>{document.fileName}</strong>
              <span className="muted">{document.documentType} • {propertyName(document.propertyId)}</span>
              <p>Status: {document.status} • Version: v{document.version}</p>
              <p>{document.filePath}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Upload New Document" subtitle="Operations can route files into the approval workflow.">
        <p className="muted">Suggested next version: v{latestVersion + 1}</p>
        <FormGrid
          fields={[
            selectField('Client', form.clientId, (value) => setForm((current) => ({ ...current, clientId: value })), clients.map((client) => ({
              label: `${client.firstName} ${client.lastName}`,
              value: client.id,
            }))),
            selectField('Property', form.propertyId, (value) => setForm((current) => ({ ...current, propertyId: value })), properties.map((property) => ({
              label: property.title,
              value: property.id,
            }))),
            textField('Document type', form.documentType, (value) => setForm((current) => ({ ...current, documentType: value }))),
            textField('File name', form.fileName, (value) => setForm((current) => ({ ...current, fileName: value }))),
            textField('Storage path', form.filePath, (value) => setForm((current) => ({ ...current, filePath: value }))),
            textField('Version', String(form.version), (value) => setForm((current) => ({ ...current, version: Number(value || 1) }))),
          ]}
          actionLabel="Create document"
          onSubmit={() => onCreate(form)}
        />
      </Panel>
    </>
  )
}

function ApprovalsSection({ approvals, canReview, canRequest, onCreate, onReview }) {
  const [form, setForm] = useState({
    type: 'Pricing Request',
    title: '',
    details: '',
  })

  return (
    <>
      <Panel title="Approval Queue" subtitle="Pricing, reservation, and contract approval requests.">
        <div className="stack">
          {approvals.map((approval) => (
            <div className="approval-card" key={approval.id}>
              <div>
                <strong>{approval.title}</strong>
                <p className="muted">{approval.type}</p>
                <p>{approval.details}</p>
              </div>
              <div className="approval-actions">
                <span className="pill">{approval.status}</span>
                {canReview && approval.status === 'Pending' ? (
                  <>
                    <button className="inline-button" onClick={() => onReview(approval.id, 'Approved')}>
                      Approve
                    </button>
                    <button className="ghost-button small-button" onClick={() => onReview(approval.id, 'Rejected')}>
                      Reject
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {canRequest ? (
        <Panel title="Request Approval" subtitle="Send pricing or contract decisions up the chain.">
          <FormGrid
            fields={[
              textField('Type', form.type, (value) => setForm((current) => ({ ...current, type: value }))),
              textField('Title', form.title, (value) => setForm((current) => ({ ...current, title: value }))),
              textField('Details', form.details, (value) => setForm((current) => ({ ...current, details: value }))),
            ]}
            actionLabel="Submit request"
            onSubmit={() => onCreate(form)}
          />
        </Panel>
      ) : null}
    </>
  )
}

function ReportsSection({ reports, dashboard, clients, users, filters, onFilterChange }) {
  if (!reports) {
    return (
      <Panel title="Reports" subtitle="No report payload is available yet.">
        <p className="muted">Log in as Manager or Admin to view organization-wide reporting.</p>
      </Panel>
    )
  }

  const exportRows = [
    ['Generated At', reports.generatedAt || ''],
    ['Sales Forecast', reports.salesForecast],
    ['Validated Payments', reports.validatedPayments],
    ['Active Agents', reports.activeAgents],
    ['Overdue Follow-Ups', reports.followUpSummary?.overdue || 0],
  ]

  const downloadCsv = () => {
    const sections = [
      ['Executive Summary', 'Value'],
      ...exportRows,
      [],
      ['Agent', 'Clients', 'Active Deals', 'Closed Deals', 'Reserved Deals', 'Scheduled Activities', 'Overdue Follow-Ups', 'Validated Revenue'],
      ...(reports.agentPerformance || []).map((item) => [
        item.fullName,
        item.totalClients,
        item.activeDeals,
        item.closedDeals,
        item.reservedDeals,
        item.scheduledActivities,
        item.overdueFollowUps,
        item.validatedRevenue,
      ]),
    ]

    const csv = sections
      .map((row) =>
        row
          .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'nasew-manager-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const printReport = () => {
    window.print()
  }

  return (
    <>
      <Panel title="Report Filters" subtitle="Refine analytics by date window and responsible sales agent.">
        <FormGrid
          fields={[
            textField('From', filters.from, (value) => onFilterChange((current) => ({ ...current, from: value })), 'date'),
            textField('To', filters.to, (value) => onFilterChange((current) => ({ ...current, to: value })), 'date'),
            selectField(
              'Sales agent',
              filters.agentId,
              (value) => onFilterChange((current) => ({ ...current, agentId: value })),
              [
                { label: 'All active agents', value: '' },
                ...users
                  .filter((user) => user.role === 'sales')
                  .map((user) => ({ label: user.fullName, value: user.id })),
              ],
            ),
          ]}
          actionLabel="Apply filters"
          onSubmit={() => {}}
        />
      </Panel>

      <Panel title="Executive Summary" subtitle="Management visibility into sales and property performance.">
        <div className="approval-actions">
          <button className="inline-button" onClick={downloadCsv}>
            Export CSV
          </button>
          <button className="ghost-button small-button" onClick={printReport}>
            Print
          </button>
        </div>
        <div className="metric-grid">
          <div className="metric-card">
            <span>Sales Forecast</span>
            <strong>{money.format(reports.salesForecast)}</strong>
          </div>
          <div className="metric-card">
            <span>Validated Payments</span>
            <strong>{money.format(reports.validatedPayments)}</strong>
          </div>
          <div className="metric-card">
            <span>Active Agents</span>
            <strong>{reports.activeAgents}</strong>
          </div>
          <div className="metric-card">
            <span>Unread Notifications</span>
            <strong>{dashboard.spotlight.unreadNotifications.length}</strong>
          </div>
          <div className="metric-card">
            <span>Overdue Follow-Ups</span>
            <strong>{reports.followUpSummary?.overdue || 0}</strong>
          </div>
          <div className="metric-card">
            <span>Pending Approvals</span>
            <strong>{reports.approvalQueue?.pending || 0}</strong>
          </div>
        </div>
      </Panel>

      <Panel title="Pipeline Health" subtitle="Operational view across current opportunity stages.">
        <DataTable
          columns={['Stage', 'Count']}
          rows={(reports.pipelineStageBreakdown || []).map((item) => [item.stage, item.count])}
        />
      </Panel>

      <Panel title="Property Status" subtitle="Availability and reservation mix.">
        <DataTable
          columns={['Status', 'Count']}
          rows={reports.propertyStatusBreakdown.map((item) => [item.status, item.count])}
        />
      </Panel>

      <Panel title="Contract and Payment Status" subtitle="Contract progress and payment validation coverage.">
        <DataTable
          columns={['Category', 'Status', 'Count', 'Amount']}
          rows={[
            ...(reports.contractStatusBreakdown || []).map((item) => ['Contract', item.status, item.count, '-']),
            ...(reports.paymentStatusBreakdown || []).map((item) => ['Payment', item.status, item.count, money.format(item.totalAmount || 0)]),
          ]}
        />
      </Panel>

      <Panel title="Lead Sources" subtitle="Top inbound channels from the CRM repository.">
        <DataTable
          columns={['Lead Source', 'Count']}
          rows={reports.leadSourceBreakdown.map((item) => [item.source, item.count])}
        />
      </Panel>

      <Panel title="Agent Performance" subtitle="Richer manager analytics aligned to the UML reporting use cases.">
        <DataTable
          columns={['Agent', 'Clients', 'Active Deals', 'Closed Deals', 'Reserved Deals', 'Activities', 'Overdue Follow-Ups', 'Validated Revenue']}
          rows={(reports.agentPerformance || []).map((item) => [
            item.fullName,
            item.totalClients,
            item.activeDeals,
            item.closedDeals,
            item.reservedDeals,
            item.scheduledActivities,
            item.overdueFollowUps,
            money.format(item.validatedRevenue || 0),
          ])}
        />
      </Panel>

      <Panel title="Follow-Up Snapshot" subtitle="Client urgency overview for managers.">
        <DataTable
          columns={['Bucket', 'Count']}
          rows={[
            ['Overdue', reports.followUpSummary?.overdue || 0],
            ['Due Today', reports.followUpSummary?.dueToday || 0],
            ['Upcoming', reports.followUpSummary?.upcoming || 0],
            ['Total Clients', clients.length],
          ]}
        />
      </Panel>
    </>
  )
}

function UsersSection({ users, onCreate, onToggleStatus, onDelete }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    role: 'sales',
    department: 'Sales',
    password: '',
  })

  return (
    <>
      <Panel title="User Management" subtitle="Admin control over account lifecycle and roles.">
        <DataTable
          columns={['Name', 'Email', 'Role', 'Department', 'Status', 'Action']}
          rows={users.map((user) => [
            user.fullName,
            user.email,
            user.role,
            user.department,
            user.status,
            <div key={user.id} className="approval-actions">
              <button
                className="inline-button"
                onClick={() => onToggleStatus(user.id, user.status === 'active' ? 'inactive' : 'active')}
              >
                {user.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
              <button className="ghost-button small-button" onClick={() => onDelete(user.id)}>
                Delete
              </button>
            </div>,
          ])}
        />
      </Panel>

      <Panel title="Create User" subtitle="Seed additional internal accounts.">
        <FormGrid
          fields={[
            textField('Full name', form.fullName, (value) => setForm((current) => ({ ...current, fullName: value }))),
            textField('Email', form.email, (value) => setForm((current) => ({ ...current, email: value }))),
            textField('Role', form.role, (value) => setForm((current) => ({ ...current, role: value }))),
            textField('Department', form.department, (value) => setForm((current) => ({ ...current, department: value }))),
            textField('Password', form.password, (value) => setForm((current) => ({ ...current, password: value }))),
          ]}
          actionLabel="Create user"
          onSubmit={() => onCreate(form)}
        />
      </Panel>
    </>
  )
}

function SettingsSection({ settings, onSave }) {
  const [form, setForm] = useState(settings || {})

  useEffect(() => {
    setForm(settings || {})
  }, [settings])

  return (
    <Panel title="System Settings" subtitle="Administrative configuration and low-bandwidth tuning.">
      <FormGrid
        fields={[
          textField('Company name', form.companyName || '', (value) => setForm((current) => ({ ...current, companyName: value }))),
          textField('Timezone', form.timezone || '', (value) => setForm((current) => ({ ...current, timezone: value }))),
          textField('Reminder lead days', String(form.reminderLeadDays || 0), (value) => setForm((current) => ({ ...current, reminderLeadDays: Number(value || 0) }))),
          selectField('Low bandwidth mode', String(form.lowBandwidthMode), (value) => setForm((current) => ({ ...current, lowBandwidthMode: value === 'true' })), [
            { label: 'Enabled', value: 'true' },
            { label: 'Disabled', value: 'false' },
          ]),
        ]}
        actionLabel="Save settings"
        onSubmit={() => onSave(form)}
      />
    </Panel>
  )
}

function AuditsSection({ audits }) {
  return (
    <Panel title="Audit Logs" subtitle="Security and accountability trail for critical actions.">
      <DataTable
        columns={['Timestamp', 'Action', 'Entity', 'User']}
        rows={audits.map((audit) => [audit.timestamp, audit.action, `${audit.entityType}:${audit.entityId}`, audit.userId])}
      />
    </Panel>
  )
}

function NotificationsSection({ notifications, onMarkRead }) {
  return (
    <Panel title="Notifications" subtitle="Automated reminders and in-app operational alerts.">
      <div className="stack">
        {notifications.map((notification) => (
          <div className="notification-card" key={notification.id}>
            <div>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
            </div>
            <div className="approval-actions">
              <span className="pill">{notification.priority}</span>
              {notification.status === 'Unread' ? (
                <button className="inline-button" onClick={() => onMarkRead(notification.id)}>
                  Mark as read
                </button>
              ) : (
                <span className="muted">Read</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          <p className="muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>No records available.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function SimpleList({ items, emptyText }) {
  if (!items.length) {
    return <p className="muted">{emptyText}</p>
  }

  return (
    <div className="stack">
      {items.map((item, index) => (
        <div className="list-card" key={`${item.title}-${index}`}>
          <strong>{item.title}</strong>
          <span className="muted">{item.meta}</span>
          <p>{item.body}</p>
        </div>
      ))}
    </div>
  )
}

function FormGrid({ fields, actionLabel, onSubmit }) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {fields.map((field) => (
        <label key={field.label}>
          <span>{field.label}</span>
          {field.type === 'select' ? (
            <select value={field.value} onChange={(event) => field.onChange(event.target.value)}>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input type={field.inputType || 'text'} value={field.value} onChange={(event) => field.onChange(event.target.value)} />
          )}
        </label>
      ))}
      <button className="primary-button" type="submit">
        {actionLabel}
      </button>
    </form>
  )
}

const textField = (label, value, onChange, inputType = 'text') => ({
  label,
  value,
  onChange,
  inputType,
  type: 'input',
})

const selectField = (label, value, onChange, options) => ({
  label,
  value,
  onChange,
  options,
  type: 'select',
})

export default App
