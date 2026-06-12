import { findImageMatch } from "@/lib/image-recognition/actions"
import type { MatchResult } from "@/lib/image-recognition/types"

const initialState: MatchResult = {
  ok: false,
  message: "",
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const result = await findImageMatch(initialState, formData)

  return Response.json(result, { status: result.ok ? 200 : 422 })
}
