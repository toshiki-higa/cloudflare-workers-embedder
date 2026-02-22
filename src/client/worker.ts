// Web Worker
import { doEmbed, DType } from './embed'
import { Result } from '@praha/byethrow'

export interface WorkerRequest {
  type: 'embed'
  text: string
  model: string
  dim: number
  dtype?: DType
  modelFileName?: string
}

export interface WorkerResponse {
  type: 'embed'
  success: boolean
  embedding?: number[]
  length?: number
  error?: string
}

export const createWebWorkerRequest = <T, R>(worker: Worker) =>
  (data: T): Promise<R> => new Promise((resolve) => {
    worker.addEventListener('message', (e) => resolve(e.data), { once: true })
    worker.postMessage(data)
  })

// TODO: Fix issue: https://github.com/huggingface/transformers.js/pull/1510
const baseFetch = self.fetch.bind(self);
self.fetch = (input: RequestInfo | URL, init: RequestInit = {}) =>
  baseFetch(input, { ...init, referrerPolicy: "no-referrer" });

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { type, text, model, dim, dtype, modelFileName } = event.data

  if (type !== 'embed') {
    self.postMessage({ type, success: false, error: 'Unknown request type' })
    return
  }

  const result = await doEmbed(model, dim, text, dtype, modelFileName)

  if (Result.isSuccess(result)) {
    const embeddingArray = Array.from(result.value)
    self.postMessage({
      type: 'embed',
      success: true,
      embedding: embeddingArray,
      length: embeddingArray.length
    })
  } else {
    self.postMessage({
      type: 'embed',
      success: false,
      error: result.error.message
    })
  }
}
