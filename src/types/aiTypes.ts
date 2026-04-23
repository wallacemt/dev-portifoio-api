interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
  avgLogprobs: number;
}
interface GeminiContent {
  parts: GeminiPart[];
  role: string;
}
interface GeminiPart {
  text: string;
}
export interface GeminiResponse {
  response: {
    candidates?: GeminiCandidate[];
  };
}

export interface GeminiModel {
  name: string;
  version: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature?: number;
  topP?: number;
  topK?: number;
}
