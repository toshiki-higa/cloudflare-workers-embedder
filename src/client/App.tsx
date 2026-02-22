import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  DEFAULT_MODEL,
  DEFAULT_DIM,
  DEFAULT_MODEL_FILE,
  DEFAULT_DTYPE
} from './config'
import {
  createWebWorkerRequest,
  type WorkerRequest
} from './worker'

interface EmbedResult {
  success: boolean
  mode: 'worker' | 'api'
  embedding?: number[]
  length?: number
  apiResponse?: unknown
  error?: string
}

const resolveApiEmbedding = (value: unknown): number[] | null => {
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
    return value
  }

  if (value && typeof value === 'object') {
    const nested = (value as { embedding?: unknown }).embedding
    if (Array.isArray(nested) && nested.every((n) => typeof n === 'number')) {
      return nested
    }
  }

  return null
}

export default function App() {
  const [text, setText] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<EmbedResult | null>(null)
  const workerRef = useRef<Worker | null>(null)

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} ${message}`])
  }

  const workerMutation = useMutation({
    mutationFn: async (inputText: string): Promise<EmbedResult> => {
      if (!workerRef.current) {
        workerRef.current = new Worker(
          new URL('./worker.ts', import.meta.url),
          { type: 'module' }
        )
      }

      const request = createWebWorkerRequest<WorkerRequest, Omit<EmbedResult, 'mode'>>(workerRef.current)
      const workerResult = await request({
        type: 'embed',
        text: inputText,
        model: DEFAULT_MODEL,
        dim: DEFAULT_DIM,
        dtype: DEFAULT_DTYPE,
        modelFileName: DEFAULT_MODEL_FILE
      })

      return { ...workerResult, mode: 'worker' }
    },
    onMutate: (inputText) => {
      addLog(`🔄 [Web Worker] Generating embedding for: "${inputText.slice(0, 50)}${inputText.length > 50 ? '...' : ''}"`)
    },
    onSuccess: (data) => {
      setResult(data)
      if (data.success) {
        addLog(`✅ [Web Worker] Embedding generated: ${data.length} dimensions`)
      } else {
        addLog(`❌ [Web Worker] Error: ${data.error}`)
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addLog(`❌ [Web Worker] Unexpected error: ${errorMessage}`)
      setResult({ success: false, mode: 'worker', error: errorMessage })
    }
  })

  const apiMutation = useMutation({
    mutationFn: async (inputText: string): Promise<EmbedResult> => {
      const response = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText })
      })

      const data = await response.json() as {
        success?: boolean
        embedding?: unknown
        error?: string
      }

      if (!response.ok || data.success === false) {
        return {
          success: false,
          mode: 'api',
          apiResponse: data,
          error: data.error ?? `API request failed (${response.status})`
        }
      }

      const embedding = resolveApiEmbedding(data.embedding)
      return {
        success: true,
        mode: 'api',
        apiResponse: data,
        embedding: embedding ?? undefined,
        length: embedding?.length
      }
    },
    onMutate: (inputText) => {
      addLog(`🔄 [API] Generating embedding for: "${inputText.slice(0, 50)}${inputText.length > 50 ? '...' : ''}"`)
    },
    onSuccess: (data) => {
      setResult(data)
      if (data.success) {
        addLog('✅ [API] API response received')
      } else {
        addLog(`❌ [API] Error: ${data.error}`)
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addLog(`❌ [API] Unexpected error: ${errorMessage}`)
      setResult({ success: false, mode: 'api', error: errorMessage })
    }
  })

  const isPending = workerMutation.isPending || apiMutation.isPending

  const runWorker = () => {
    if (!text.trim() || isPending) return
    workerMutation.mutate(text)
  }

  const runApi = () => {
    if (!text.trim() || isPending) return
    apiMutation.mutate(text)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">Embedding Generator</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Model Configuration</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Model:</span>
            <span className="ml-2 text-gray-800">{DEFAULT_MODEL}</span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Dimensions:</span>
            <span className="ml-2 text-gray-800">{DEFAULT_DIM}</span>
          </div>
          <div>
            <span className="font-medium text-gray-600">DType:</span>
            <span className="ml-2 text-gray-800">{DEFAULT_DTYPE}</span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Model File:</span>
            <span className="ml-2 text-gray-800">{DEFAULT_MODEL_FILE}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Input Text</h2>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to generate embedding..."
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={4}
          disabled={isPending}
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={runWorker}
            disabled={isPending || !text.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {workerMutation.isPending ? (
              <>
                <span className="animate-spin">⏳</span>
                Processing in Web Worker...
              </>
            ) : (
              'Generate with Web Worker'
            )}
          </button>

          <button
            type="button"
            onClick={runApi}
            disabled={isPending || !text.trim()}
            className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {apiMutation.isPending ? (
              <>
                <span className="animate-spin">⏳</span>
                Processing in API...
              </>
            ) : (
              'Generate with API (/api/embed)'
            )}
          </button>
        </div>
      </div>

      {result && (
        <div className={`rounded-lg shadow p-6 mb-6 ${result.success ? 'bg-white' : 'bg-red-50'}`}>
          <h2 className="text-xl font-semibold mb-4">
            {result.success ? 'Result' : 'Error'}
          </h2>
          {result.success ? (
            <div className="space-y-3">
              {result.mode === 'worker' && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                      Success
                    </span>
                    <span className="text-gray-600">
                      {result.length} dimensions
                    </span>
                  </div>
                  <details className="bg-gray-50 p-4 rounded" open>
                    <summary className="cursor-pointer font-medium text-gray-600">
                      Show full embedding ({result.length} values)
                    </summary>
                    <pre className="mt-2 text-xs text-gray-800 overflow-x-auto max-h-96">
                      {JSON.stringify(result.embedding, null, 2)}
                    </pre>
                  </details>
                </>
              )}

              {result.mode === 'api' && (
                <details className="bg-gray-50 p-4 rounded" open>
                  <summary className="cursor-pointer font-medium text-gray-600">
                    API raw response
                  </summary>
                  <pre className="mt-2 text-xs text-gray-800 overflow-x-auto max-h-96">
                    {JSON.stringify(result.apiResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="text-red-700 space-y-3">
              <p className="font-medium">{result.error}</p>
              {result.mode === 'api' && result.apiResponse && (
                <details className="bg-red-100 p-4 rounded" open>
                  <summary className="cursor-pointer font-medium text-red-700">
                    API raw response
                  </summary>
                  <pre className="mt-2 text-xs text-red-900 overflow-x-auto max-h-96">
                    {JSON.stringify(result.apiResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Logs</h2>
        <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm h-48 overflow-auto">
          {logs.length === 0 ? 'No logs yet...' : logs.map((log, i) => (
            <div key={i} className="mb-1">{log}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
