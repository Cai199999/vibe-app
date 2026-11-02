import { useCallback, useState } from 'react'

import { buildPromptRequest } from '../api/promptPayload'
import { generatePrompt, PromptApiError } from '../api/promptApi'
import type {
  CanvasAnnotation,
  LocalProject,
  PromptResponse,
} from '../types/vibe'

export interface PromptErrorState {
  message: string
  code: string
  details?: Record<string, unknown>
}

interface PromptGenerationState {
  loading: boolean
  error: PromptErrorState | null
  response: PromptResponse | null
}

export function usePromptGeneration() {
  const [state, setState] = useState<PromptGenerationState>({
    loading: false,
    error: null,
    response: null,
  })

  const generate = useCallback(
    async (
      annotations: CanvasAnnotation[],
      sessionToken: string,
      project: LocalProject,
    ): Promise<PromptResponse | null> => {
      setState({ loading: true, error: null, response: null })
      try {
        const payload = buildPromptRequest(annotations, project)
        const response = await generatePrompt(payload, sessionToken)
        setState({ loading: false, error: null, response })
        return response
      } catch (error) {
        const normalized =
          error instanceof PromptApiError
            ? {
                message: error.message,
                code: error.code,
                details: error.details,
              }
            : {
                message:
                  error instanceof Error ? error.message : '生成失败，请重试。',
                code: 'UNKNOWN_ERROR',
              }
        setState({ loading: false, error: normalized, response: null })
        return null
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setState({ loading: false, error: null, response: null })
  }, [])

  return { ...state, generate, reset }
}
