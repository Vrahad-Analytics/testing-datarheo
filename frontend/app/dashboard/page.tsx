"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, Plus, Play, LogOut, ListChecks } from 'lucide-react'
import { api } from '@/lib/api'

interface Stats {
  pipelines: number
  activeJobs: number
  connectors: number
  recordsSynced: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ pipelines: 0, activeJobs: 0, connectors: 0, recordsSynced: 0 })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/auth/login')
      return
    }
    setUser(JSON.parse(userData))
    setIsLoading(false)

    const loadStats = async () => {
      try {
        const [p, c, j] = await Promise.all([
          api<{ pagination: { total: number } }>('/api/pipelines?limit=1'),
          api<{ connectors: any[] }>('/api/connectors'),
          api<{ jobs: any[]; pagination: { total: number } }>('/api/jobs'),
        ])
        const jobs = j.jobs || []
        setStats({
          pipelines: p.pagination?.total ?? 0,
          connectors: c.connectors?.length ?? 0,
          activeJobs: jobs.filter((job: any) => job.status === 'PENDING' || job.status === 'RUNNING').length,
          recordsSynced: jobs.reduce((sum: number, job: any) => sum + (job.recordsWritten || 0), 0),
        })
      } catch {
        // Stats are non-critical; leave zeros if the API is unreachable
      }
    }
    loadStats()
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    router.push('/auth/login')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Database className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold">DataRheo</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {user?.name}
            </span>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to DataRheo</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Manage your data integration pipelines from here
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Plus className="h-5 w-5 text-blue-600" />
                <span>New Pipeline</span>
              </CardTitle>
              <CardDescription>
                Create a new data integration pipeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/pipelines">
                <Button className="w-full">Create Pipeline</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5 text-blue-600" />
                <span>Connectors</span>
              </CardTitle>
              <CardDescription>
                Manage your source and destination connectors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/connectors">
                <Button variant="outline" className="w-full">Manage Connectors</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Play className="h-5 w-5 text-blue-600" />
                <span>Run Pipeline</span>
              </CardTitle>
              <CardDescription>
                Manually trigger a pipeline run
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/pipelines">
                <Button variant="outline" className="w-full">View Pipelines</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ListChecks className="h-5 w-5 text-blue-600" />
                <span>Jobs</span>
              </CardTitle>
              <CardDescription>
                Monitor every sync run and view logs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/jobs">
                <Button variant="outline" className="w-full">View Jobs</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Total Pipelines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.pipelines}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.activeJobs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Connectors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.connectors}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Records Synced</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.recordsSynced}</div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
