import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { audioBase64 } = body

    // Mock speech-to-text response
    await new Promise(resolve => setTimeout(resolve, 300))

    return NextResponse.json({
      text: 'This is a transcribed text from the audio input.',
      confidence: 0.95,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process speech-to-text' },
      { status: 500 }
    )
  }
}
