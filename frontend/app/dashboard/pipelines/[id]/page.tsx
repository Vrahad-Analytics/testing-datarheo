"use client"

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, ArrowLeft, Play, Pause, Trash2, ArrowRight, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface JobLog {
  id: string
  level: string
  message: string
  timestamp: string
}

interface Job {
  id: string
  status: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  recordsRead: number
  recordsWritten: number
  errorMessage: string | null
  config?: { trigger?: string }
}

interface Pipeline {
  id: string
  name: string
  description: string | null
  status: string
  schedule: string | null
  lastRunAt: string | null
  nextRunAt: string | null
  sourceConfig: { id: string; name: string; connectorName: string; config?: any }
  destinationConfig: { id: string; name: string; connectorName: string; config?: any }
  creator?: { id: string; name: string; email: string }
  jobs: Job[]
}

const statusStyles: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
  PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
  ARCHIVED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString() : '—'
}

function duration(job: Job) {
  if (!job.startedAt || !job.completedAt) return '—'
  const ms = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function JobRow({ job }: { job: Job }) {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<JobLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const res = await api<{ logs: JobLog[] }>(`/api/jobs/${job.id}/logs?limit=200`)
      setLogs(res.logs)
    } catch {
      /* handled by page-level toast on other actions */
    } finally {
      setLoadingLogs(false)
    }
  }, [job.id])

  useEffect(() => {
    if (!open) return
    loadLogs()
    if (job.status === 'RUNNING' || job.status === 'PENDING') {
      const t = setInterval(loadLogs, 3000)
      return () => clearInterval(t)
    }
  }, [open, job.status, loadLogs])

  return (
    <div className="border rounded-md">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyles[job.status] || statusStyles.CANCELLED}`}>
          {job.status}
        </span>
        <span className="font-mono text-xs text-gray-500">{job.id.slice(0, 8)}</span>
        <span className="text-gray-600 dark:text-gray-300">{job.config?.trigger === 'schedule' ? 'scheduled' : 'manual'}</span>
        <span className="ml-auto text-gray-500">{fmt(job.startedAt || job.createdAt)}</span>
        <span className="text-gray-500 w-16 text-right">{duration(job)}</span>
        <span className="text-gray-600 dark:text-gray-300 w-32 text-right">
          {job.recordsRead} read / {job.recordsWritten} written
        </span>
      </button>
      {open && (
        <div className="border-t px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
          {job.errorMessage && (
            <div className="mb-2 text-sm text-red-600 dark:text-red-400 font-medium">{job.errorMessage}</div>
          )}
          {loadingLogs && logs.length === 0 ? (
            <div className="text-sm text-gray-500">Loading logs…</div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-gray-500">No logs recorded.</div>
          ) : (
            <div className="font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="flex gap-3">
                  <span className="text-gray-400 shrink-0">{new Date(l.timestamp).toLocaleTimeString()}</span>
                  <span
                    className={`shrink-0 w-16 ${
                      l.level === 'ERROR' || l.level === 'CRITICAL'
                        ? 'text-red-600'
                        : l.level === 'WARNING'
                        ? 'text-yellow-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {l.level}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 break-all">{l.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PipelineDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const id = params?.id as string

  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api<{ pipeline: Pipeline }>(`/api/pipelines/${id}`)
      setPipeline(res.pipeline)
    } catch (err: any) {
      toast({ title: 'Failed to load pipeline', description: err.message, variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      router.push('/auth/login')
      return
    }
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load, router])

  const handleRun = async () => {
    try {
      await api(`/api/pipelines/${id}/run`, { method: 'POST', body: JSON.stringify({}) })
      toast({ title: 'Run queued', description: 'The job worker will pick it up shortly' })
      await load()
    } catch (err: any) {
      toast({ title: 'Run failed', description: err.message, variant: 'destructive' })
    }
  }

  const handlePauseResume = async () => {
    if (!pipeline) return
    const action = pipeline.status === 'PAUSED' ? 'resume' : 'pause'
    try {
      await api(`/api/pipelines/${id}/${action}`, { method: 'POST' })
      toast({ title: action === 'pause' ? 'Pipeline paused' : 'Pipeline resumed' })
      await load()
    } catch (err: any) {
      toast({ title: `Failed to ${action}`, description: err.message, variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    if (!pipeline || !window.confirm(`Delete pipeline "${pipeline.name}"?`)) return
    try {
      await api(`/api/pipelines/${id}`, { method: 'DELETE' })
      router.push('/dashboard/pipelines')
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' })
    }
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-lg">Loading…</div>
  }

  if (!pipeline) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg mb-4">Pipeline not found</p>
          <Link href="/dashboard/pipelines"><Button>Back to pipelines</Button></Link>
        </div>
      </div>
    )
  }

  const activeJob = pipeline.jobs?.find((j) => j.status === 'RUNNING' || j.status === 'PENDING')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Database className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold">DataRheo</span>
          </div>
          <Link href="/dashboard/pipelines">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pipelines
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
              {pipeline.name}
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[pipeline.status]}`}>
                {pipeline.status}
              </span>
            </h1>
            {pipeline.description && <p className="text-gray-600 dark:text-gray-300">{pipeline.description}</p>}
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-600 dark:text-gray-300">
              <span className="font-medium">{pipeline.sourceConfig?.name}</span>
              <span className="text-xs text-gray-400">({pipeline.sourceConfig?.connectorName})</span>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium">{pipeline.destinationConfig?.name}</span>
              <span className="text-xs text-gray-400">({pipeline.destinationConfig?.connectorName})</span>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button onClick={handleRun} disabled={pipeline.status !== 'ACTIVE' || !!activeJob}>
              <Play className="h-4 w-4 mr-2" />
              {activeJob ? 'Running…' : 'Sync now'}
            </Button>
            <Button variant="outline" onClick={handlePauseResume}>
              <Pause className="h-4 w-4 mr-2" />
              {pipeline.status === 'PAUSED' ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="outline" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Schedule</CardTitle></CardHeader>
            <CardContent>
              <div className="font-mono text-sm">{pipeline.schedule || 'Manual only'}</div>
              {pipeline.nextRunAt && (
                <div className="text-xs text-gray-500 mt-1">Next run: {fmt(pipeline.nextRunAt)}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Last run</CardTitle></CardHeader>
            <CardContent><div className="text-sm">{fmt(pipeline.lastRunAt)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total syncs</CardTitle></CardHeader>
            <CardContent><div className="text-sm">{pipeline.jobs?.length ?? 0} shown</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sync history</CardTitle>
            <CardDescription>Click a run to view its logs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pipeline.jobs?.length ? (
              pipeline.jobs.map((j) => <JobRow key={j.id} job={j} />)
            ) : (
              <div className="text-sm text-gray-500 py-6 text-center">
                No runs yet — hit <span className="font-medium">Sync now</span> to start one.
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
