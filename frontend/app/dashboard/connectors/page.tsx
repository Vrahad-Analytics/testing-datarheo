"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, ArrowLeft, Plus, Trash2, FlaskConical } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface CatalogEntry {
  name: string
  displayName: string
  description: string
}

interface Connector {
  id: string
  name: string
  type: 'SOURCE' | 'DESTINATION'
  connectorName: string
  isActive: boolean
  lastTestStatus: string | null
  createdAt: string
}

export default function ConnectorsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [catalog, setCatalog] = useState<{ sources: CatalogEntry[]; destinations: CatalogEntry[] }>({ sources: [], destinations: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [name, setName] = useState('')
  const [type, setType] = useState<'SOURCE' | 'DESTINATION'>('SOURCE')
  const [connectorName, setConnectorName] = useState('')
  const [configText, setConfigText] = useState('{}')
  const [formError, setFormError] = useState('')

  const load = async () => {
    try {
      const [list, cat] = await Promise.all([
        api<{ connectors: Connector[] }>('/api/connectors'),
        api<{ sources: CatalogEntry[]; destinations: CatalogEntry[] }>('/api/connectors/catalog'),
      ])
      setConnectors(list.connectors)
      setCatalog(cat)
    } catch (err: any) {
      toast({ title: 'Failed to load connectors', description: err.message, variant: 'destructive' })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const options = type === 'SOURCE' ? catalog.sources : catalog.destinations

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    let config: any
    try {
      config = JSON.parse(configText || '{}')
    } catch {
      setFormError('Config must be valid JSON')
      return
    }

    setIsSaving(true)
    try {
      await api('/api/connectors', {
        method: 'POST',
        body: JSON.stringify({ name, type, connectorName, config }),
      })
      toast({ title: 'Connector created', description: `${name} (${connectorName})` })
      setShowForm(false)
      setName('')
      setConnectorName('')
      setConfigText('{}')
      await load()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async (connector: Connector) => {
    try {
      const result = await api<{ success: boolean; message: string }>(
        `/api/connectors/${connector.id}/test`,
        { method: 'POST' }
      )
      if (result.success) {
        toast({ title: 'Connection test passed', description: result.message })
      } else {
        toast({ title: 'Connection test failed', description: result.message, variant: 'destructive' })
      }
      await load()
    } catch (err: any) {
      toast({ title: 'Connection test failed', description: err.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (connector: Connector) => {
    if (!window.confirm(`Delete connector "${connector.name}"?`)) return
    try {
      await api(`/api/connectors/${connector.id}`, { method: 'DELETE' })
      toast({ title: 'Connector deleted', description: connector.name })
      await load()
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' })
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

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Connectors</h1>
            <p className="text-gray-600 dark:text-gray-300">
              Configure sources and destinations for your pipelines
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            New Connector
          </Button>
        </div>

        {showForm && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>New Connector</CardTitle>
              <CardDescription>Pick a connector from the catalog and give it a name</CardDescription>
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
                    placeholder="My Postgres Source"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value as 'SOURCE' | 'DESTINATION')
                      setConnectorName('')
                    }}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="SOURCE">Source</option>
                    <option value="DESTINATION">Destination</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Connector</label>
                  <select
                    value={connectorName}
                    onChange={(e) => setConnectorName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="" disabled>Select a connector…</option>
                    {options.map((o) => (
                      <option key={o.name} value={o.name}>
                        {o.displayName} — {o.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Config (JSON)</label>
                  <textarea
                    value={configText}
                    onChange={(e) => setConfigText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background font-mono text-sm"
                  />
                </div>
                <div className="flex space-x-2">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Creating…' : 'Create Connector'}
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
        ) : connectors.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-600 dark:text-gray-300">
              No connectors yet. Create a source and a destination to build your first pipeline.
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connectors.map((c) => (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{c.name}</span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        c.type === 'SOURCE'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200'
                      }`}
                    >
                      {c.type}
                    </span>
                  </CardTitle>
                  <CardDescription>{c.connectorName}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {c.lastTestStatus ? `Last test: ${c.lastTestStatus}` : 'Not tested yet'}
                  </span>
                  <div className="flex space-x-1">
                    <Button variant="ghost" size="icon" title="Test connection" onClick={() => handleTest(c)}>
                      <FlaskConical className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
