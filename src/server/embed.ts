import { Result } from "@praha/byethrow";
import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-web";

/*
CONFIGURATION
*/
const MODEL_NAME = "sirasagi62/ruri-v3-30m-ONNX";
const REPO_BASE = `https://huggingface.co/${MODEL_NAME}/resolve/main`;
const MODEL_URL = `${REPO_BASE}/onnx/model_int8.onnx`;
const TOKENIZER_JSON_URL = `${REPO_BASE}/tokenizer.json`;
const TOKENIZER_CONFIG_URL = `${REPO_BASE}/tokenizer_config.json`;

export interface EmbedRequest {
  text: string;
}
type AppError = { status: ContentfulStatusCode; message: string; cause?: unknown };
type CfRequestInit = RequestInit & { cf?: { cacheEverything?: boolean; cacheTtl?: number } };

type InferInput = { ids: number[]; mask: number[] };

const CACHE_INIT: CfRequestInit = { cf: { cacheEverything: true, cacheTtl: 86400 } };
const appError = (status: ContentfulStatusCode, message: string, cause?: unknown): AppError => ({ status, message, cause });
const toTensor = (values: number[]) =>
  new ort.Tensor("int64", new BigInt64Array(values.map((v) => BigInt(Math.trunc(v)))), [1, values.length]);

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let tokenizerPromise: Promise<Tokenizer> | null = null;

const loadTokenizer = async () => {
  if (!tokenizerPromise) {
    tokenizerPromise = Promise.all([
      fetch(TOKENIZER_JSON_URL, CACHE_INIT).then((r) => r.json()),
      fetch(TOKENIZER_CONFIG_URL, CACHE_INIT).then((r) => r.json()),
    ]).then(([tokenizerJson, tokenizerConfig]) => new Tokenizer(tokenizerJson, tokenizerConfig));
  }
  return tokenizerPromise;
};

const loadSession = async () => {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = { wasm: "dummy.wasm" };

      const modelRes = await fetch(MODEL_URL, CACHE_INIT);
      if (!modelRes.ok) throw new Error(`Failed to fetch ONNX model: ${modelRes.status}`);

      return ort.InferenceSession.create(new Uint8Array(await modelRes.arrayBuffer()), {
        executionProviders: ["wasm"],
      });
    })();
  }
  return sessionPromise;
};

const toInferInput = (text: string) =>
  Result.try({
    try: async (): Promise<InferInput> => {
      if (!text.trim()) throw appError(400, "`text` must not be empty.");

      const encoded = (await loadTokenizer()).encode(text, { add_special_tokens: true });
      return {
        ids: encoded.ids.slice(0, 512),
        mask: encoded.attention_mask.slice(0, 512),
      };
    },
    catch: (error) => (typeof error === "object" && error && "status" in error ? (error as AppError) : appError(400, "Invalid text input.", error)),
  });

const runInference = (input: InferInput) =>
  Result.try({
    try: async () => {
      const session = await loadSession();
      return session.run({ input_ids: toTensor(input.ids), attention_mask: toTensor(input.mask) });
    },
    catch: (error) => appError(500, "Inference failed.", error),
  });

const embed = (outputs: Record<string, ort.Tensor>) =>
  Result.try({
    try: () => {
      const sentence = outputs.sentence_embedding;
      if (!sentence || !ArrayBuffer.isView(sentence.data)) throw new Error("`sentence_embedding` output is missing.");
      const embedding = Array.from(sentence.data as ArrayLike<number>).slice(0, 256);
      if (embedding.length !== 256) throw new Error(`Expected 256 dimensions, got ${embedding.length}.`);
      return embedding;
    },
    catch: (error) => appError(500, "Embedding extraction failed.", error),
  });

export const doEmbed = async (text: string) => {
  const result = await Result.pipe(
    Result.succeed(text),
    Result.andThen(toInferInput),
    Result.andThen(runInference),
    Result.andThen(embed),
  );

  if (Result.isFailure(result)) {
    throw new HTTPException(result.error.status, { message: result.error.message, cause: result.error.cause });
  }
  return { model: MODEL_NAME, dimension: 256, embedding: result.value };
};