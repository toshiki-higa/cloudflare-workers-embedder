import {
  env,
  FeatureExtractionPipeline,
  pipeline,
} from "@huggingface/transformers";
import { Result } from "@praha/byethrow";

env.allowRemoteModels = true;

export type DType =
  | "auto"
  | "fp32"
  | "fp16"
  | "q8"
  | "int8"
  | "uint8"
  | "q4"
  | "bnb4"
  | "q4f16";

export interface ModelConfig {
  readonly name: string;
  readonly dim: number;
  readonly dtype?: DType;
  readonly modelFileName?: string;
}

export interface EmbeddingModel {
  readonly config: ModelConfig;
  readonly pipeline: FeatureExtractionPipeline;
}

export const createModel = Result.fn({
  try: async (config: ModelConfig): Promise<EmbeddingModel> => ({
    config,
    pipeline: await pipeline("feature-extraction", config.name, {
      dtype: config.dtype,
      model_file_name: config.modelFileName,
    }),
  }),
  catch: (error) => new Error("Failed to create model", { cause: error }),
});

export const normalizeToDim =
  (dim: number) =>
  (arr: Float32Array): Float32Array => {
    if (arr.length === dim) return arr;
    const result = new Float32Array(dim);
    result.set(arr.slice(0, Math.min(arr.length, dim)));
    return result;
  };

export const extractEmbedding = (model: EmbeddingModel) =>
  Result.fn({
    try: async (text: string): Promise<Float32Array> => {
      const output = await model.pipeline(text, {
        pooling: "mean",
        normalize: true,
      });

      if (!output.data) {
        throw new Error("Unexpected output format from embedding pipeline");
      }

      return normalizeToDim(model.config.dim)(Float32Array.from(output.data));
    },
    catch: (error) =>
      new Error("Failed to extract embedding", { cause: error }),
  });

export const embed =
  (model: EmbeddingModel) =>
  (text: string): Promise<Result.Result<Float32Array, Error>> =>
    extractEmbedding(model)(text);

export const doEmbed = (
  modelname: string,
  dim: number,
  text: string,
  dtype?: DType,
  modelFileName?: string
): Promise<Result.Result<Float32Array, Error>> =>
  Result.pipe(
    Result.succeed({ name: modelname, dim, dtype, modelFileName }),
    Result.andThen(createModel),
    Result.andThen((model) => embed(model)(text))
  );
