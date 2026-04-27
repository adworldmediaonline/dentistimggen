interface PuterImageGenerationOptions {
  model?: string
  provider?: string
  quality?: string
  ratio?: {
    w: number
    h: number
  }
  input_image?: string
  input_images?: string[]
  input_image_mime_type?: string
  test_mode?: boolean
}

interface PuterAuthApi {
  isSignedIn?: () => boolean
  signIn?: (options?: { attempt_temp_user_creation?: boolean }) => Promise<unknown>
}

interface PuterAiApi {
  txt2img: (
    prompt: string,
    options?: PuterImageGenerationOptions | boolean
  ) => Promise<HTMLImageElement>
}

interface PuterApi {
  ai?: PuterAiApi
  auth?: PuterAuthApi
}

interface Window {
  puter?: PuterApi
}
