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
  embedding?: number[]
  length?: number
  preview?: string
  error?: string
}

export default function App() {
  const [text, setText] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const workerRef = useRef<Worker | null>(null)

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} ${message}`])
  }

  const embedMutation = useMutation({
    mutationFn: async (inputText: string): Promise<EmbedResult> => {
      if (!workerRef.current) {
        workerRef.current = new Worker(
          new URL('./worker.ts', import.meta.url),
          { type: 'module' }
        )
      }

      const request = createWebWorkerRequest<WorkerRequest, EmbedResult>(workerRef.current)
      return request({
        type: 'embed',
        text: inputText,
        model: DEFAULT_MODEL,
        dim: DEFAULT_DIM,
        dtype: DEFAULT_DTYPE,
        modelFileName: DEFAULT_MODEL_FILE
      })
    },
    onMutate: (inputText) => {
      addLog(`🔄 [Web Worker] Generating embedding for: "${inputText.slice(0, 50)}${inputText.length > 50 ? '...' : ''}"`)
    },
    onSuccess: (data) => {
      if (data.success) {
        addLog(`✅ Embedding generated: ${data.length} dimensions`)
      } else {
        addLog(`❌ Error: ${data.error}`)
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addLog(`❌ Unexpected error: ${errorMessage}`)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    embedMutation.mutate(text)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">Embedding Generator (Web Worker)</h1>
      
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

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Input Text</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to generate embedding..."
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={4}
          disabled={embedMutation.isPending}
        />
        <button 
          type="submit"
          disabled={embedMutation.isPending || !text.trim()}
          className="mt-4 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {embedMutation.isPending ? (
            <>
              <span className="animate-spin">⏳</span>
              Processing in Web Worker...
            </>
          ) : (
            'Generate Embedding'
          )}
        </button>
      </form>

      {embedMutation.data && (
        <div className={`rounded-lg shadow p-6 mb-6 ${embedMutation.data.success ? 'bg-white' : 'bg-red-50'}`}>
          <h2 className="text-xl font-semibold mb-4">
            {embedMutation.data.success ? 'Result' : 'Error'}
          </h2>
          {embedMutation.data.success ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  Success
                </span>
                <span className="text-gray-600">
                  {embedMutation.data.length} dimensions
                </span>
              </div>
              <details className="bg-gray-50 p-4 rounded" open>
                <summary className="cursor-pointer font-medium text-gray-600">
                  Show full embedding ({embedMutation.data.length} values)
                </summary>
                <pre className="mt-2 text-xs text-gray-800 overflow-x-auto max-h-96">
                  {JSON.stringify(embedMutation.data.embedding, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="text-red-700">
              <p className="font-medium">{embedMutation.data.error}</p>
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
