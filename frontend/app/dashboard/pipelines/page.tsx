"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, ArrowLeft, Plus, Play, Pause, Trash2, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface ConnectorSummary {
  id: string
  name: string
  connectorName: string
  type: 'SOURCE' | 'DESTINATION'
}

interface JobSummary {
  id: string
  status: string
  startedAt: string | null
  completedAt: string | null
  recordsRead: number | null
  recordsWritten: number | null
}

interface Pipeline {
  id: string
  name: string
  description: string | null
  status: string
  schedule: string | null
  lastRunAt: string | null
  nextRunAt: string | null
  sourceConfig: ConnectorSummary
  destinationConfig: ConnectorSummary
  jobs: JobSummary[]
  createdAt: string
}

export default function PipelinesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceConfigId, setSourceConfigId] = useState('')
  const [destinationConfigId, setDestinationConfigId] = useState('')
  const [schedule, setSchedule] = useState('')
  const [formError, setFormError] = useState('')

  const load = async () => {
    try {
      const [p, c] = await Promise.all([
        api<{ pipelines: Pipeline[] }>('/api/pipelines'),
        api<{ connectors: ConnectorSummary[] }>('/api/connectors'),
      ])
      setPipelines(p.pipelines)
      setConnectors(c.connectors)
    } catch (err: any) {
      toast({ title: 'Failed to load pipelines', description: err.message, variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      router.push('/auth/login')
      return
    }
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sources = connectors.filter((c) => c.type === 'SOURCE')
  const destinations = connectors.filter((c) => c.type === 'DESTINATION')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setIsSaving(true)
    try {
      await api('/api/pipelines', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: description || undefined,
          sourceConfigId,
          destinationConfigId,
          schedule: schedule || undefined,
          config: {},
          streams: [],
        }),
      })
      toast({ title: 'Pipeline created', description: name })
      setShowForm(false)
      setName('')
      setDescription('')
      setSourceConfigId('')
      setDestinationConfigId('')
      setSchedule('')
      await load()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleRun = async (pipeline: Pipeline) => {
    try {
      await api(`/api/pipelines/${pipeline.id}/run`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      toast({ title: 'Run queued', description: `A job for "${pipeline.name}" is pending` })
      await load()
    } catch (err: any) {
      toast({ title: 'Run failed', description: err.message, variant: 'destructive' })
    }
  }

  const handlePauseResume = async (pipeline: Pipeline) => {
    const action = pipeline.status === 'PAUSED' ? 'resume' : 'pause'
    try {
      await api(`/api/pipelines/${pipeline.id}/${action}`, { method: 'POST' })
      toast({ title: action === 'pause' ? 'Pipeline paused' : 'Pipeline resumed', description: pipeline.name })
      await load()
    } catch (err: any) {
      toast({ title: `Failed to ${action}`, description: err.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (pipeline: Pipeline) => {
    if (!window.confirm(`Delete pipeline "${pipeline.name}"?`)) return
    try {
      await api(`/api/pipelines/${pipeline.id}`, { method: 'DELETE' })
      toast({ title: 'Pipeline deleted', description: pipeline.name })
      await load()
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' })
    }
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
      PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
      FAILED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
      ARCHIVED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    }
    return styles[status] || styles.ARCHIVED
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Database className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold">DataRheo</span>
          </div>
          <Link href="/dashboard">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Pipelines</h1>
            <p className="text-gray-600 dark:text-gray-300">
              Move data from a source connector to a destination
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            New Pipeline
          </Button>
        </div>

        {showForm && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>New Pipeline</CardTitle>
              <CardDescription>
                Needs one SOURCE and one DESTINATION connector.{' '}
                <Link href="/dashboard/connectors" className="text-blue-600 hover:underline">
                  Manage connectors
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4 max-w-xl">
                {formError && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{formError}</div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Postgres to DuckDB sync"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (optional)</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Source</label>
                  <select
                    value={sourceConfigId}
                    onChange={(e) => setSourceConfigId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="" disabled>
                      {sources.length ? 'Select a source…' : 'No SOURCE connectors — create one first'}
                    </option>
                    {sources.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.connectorName})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Destination</label>
                  <select
                    value={destinationConfigId}
                    onChange={(e) => setDestinationConfigId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="" disabled>
                      {destinations.length ? 'Select a destination…' : 'No DESTINATION connectors — create one first'}
                    </option>
                    {destinations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.connectorName})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Schedule (cron, optional)</label>
                  <input
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    placeholder="0 * * * *"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background font-mono text-sm"
                  />
                </div>
                <div className="flex space-x-2">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Creating…' : 'Create Pipeline'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="text-lg">Loading…</div>
        ) : pipelines.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-600 dark:text-gray-300">
              No pipelines yet. Create connectors, then build your first pipeline.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pipelines.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-3">
                      <Link href={`/dashboard/pipelines/${p.id}`} className="hover:text-blue-600 hover:underline">
                        {p.name}
                      </Link>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge(p.status)}`}>
                        {p.status}
                      </span>
                    </span>
                    <span className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Run now"
                        onClick={() => handleRun(p)}
                        disabled={p.status === 'PAUSED'}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={p.status === 'PAUSED' ? 'Resume' : 'Pause'}
                        onClick={() => handlePauseResume(p)}
                      >
                        <Pause className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </span>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 flex-wrap">
                    <span>{p.sourceConfig?.name} ({p.sourceConfig?.connectorName})</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>{p.destinationConfig?.name} ({p.destinationConfig?.connectorName})</span>
                    {p.schedule && <span className="ml-2 font-mono text-xs">cron: {p.schedule}</span>}
                    {p.nextRunAt && (
                      <span className="text-xs">· next run {new Date(p.nextRunAt).toLocaleString()}</span>
                    )}
                    {p.lastRunAt && (
                      <span className="text-xs">· last run {new Date(p.lastRunAt).toLocaleString()}</span>
                    )}
                  </CardDescription>
                </CardHeader>
                {p.jobs.length > 0 && (
                  <CardContent>
                    <div className="text-sm font-medium mb-2">Recent jobs</div>
                    <div className="space-y-1">
                      {p.jobs.map((j) => (
                        <div key={j.id} className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            j.status === 'SUCCESS'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
                              : j.status === 'FAILED'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          }`}>
                            {j.status}
                          </span>
                          <span className="font-mono text-xs">{j.id.slice(0, 8)}</span>
                          {j.recordsRead != null && <span>{j.recordsRead} read / {j.recordsWritten ?? 0} written</span>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
