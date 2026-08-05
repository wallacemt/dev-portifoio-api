/** OpenRouter chat completion response — OpenAI-compatible shape. */
export interface OpenRouterChatChoice {
  message: {
    role: string;
    content: string;
  };
  finish_reason?: string;
}

export interface OpenRouterChatCompletionResponse {
  choices?: OpenRouterChatChoice[];
  error?: {
    message: string;
    code?: number;
  };
}

/** Entry from GET https://openrouter.ai/api/v1/models */
export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

/** GET/PATCH /owner/private/ai-config response — owner's chosen translation model. */
export interface AiConfigResponse {
  available: boolean;
  model: string | null;
  defaultModel: string;
}
