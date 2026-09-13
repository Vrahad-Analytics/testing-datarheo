"use client"

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, ArrowLeft, RefreshCw, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface Job {
  id: string
  status: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  recordsRead: number
  recordsWritten: number
  errorMessage: string | null
  pipeline: { id: string; name: string }
}

const statusStyles: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString() : '—'
}

export default function JobsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    try {
      const q = statusFilter ? `?status=${statusFilter}&limit=50` : '?limit=50'
      const res = await api<{ jobs: Job[] }>(`/api/jobs${q}`)
      setJobs(res.jobs)
    } catch (err: any) {
      toast({ title: 'Failed to load jobs', description: err.message, variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, toast])

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      router.push('/auth/login')
      return
    }
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load, router])

  const handleCancel = async (job: Job) => {
    try {
      await api(`/api/jobs/${job.id}/cancel`, { method: 'POST' })
      toast({ title: 'Job cancelled' })
      await load()
    } catch (err: any) {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' })
    }
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

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Jobs</h1>
            <p className="text-gray-600 dark:text-gray-300">Every sync run across all pipelines</p>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background text-sm"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="RUNNING">Running</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Button variant="outline" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
            <CardDescription>Auto-refreshes every 5 seconds</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : jobs.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center">No jobs yet.</div>
            ) : (
              <div className="divide-y">
                {jobs.map((j) => (
                  <div key={j.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyles[j.status] || ''}`}>
                      {j.status}
                    </span>
                    <Link
                      href={`/dashboard/pipelines/${j.pipeline?.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {j.pipeline?.name}
                    </Link>
                    <span className="font-mono text-xs text-gray-400">{j.id.slice(0, 8)}</span>
                    {j.errorMessage && (
                      <span className="text-xs text-red-600 truncate max-w-xs" title={j.errorMessage}>
                        {j.errorMessage}
                      </span>
                    )}
                    <span className="ml-auto text-gray-500">{fmt(j.startedAt || j.createdAt)}</span>
                    <span className="text-gray-600 dark:text-gray-300 w-32 text-right">
                      {j.recordsRead} / {j.recordsWritten} rows
                    </span>
                    {(j.status === 'PENDING' || j.status === 'RUNNING') && (
                      <Button variant="ghost" size="icon" title="Cancel" onClick={() => handleCancel(j)}>
                        <XCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
