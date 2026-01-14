import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { service, userText, selections } = body

    // Mock AI response based on service
    const responses: Record<string, string> = {
      avatar: 'Creating your avatar with the specified parameters. This will take approximately 30 seconds.',
      voice: 'Generating Georgian voice synthesis. Processing audio with selected dialect and emotion.',
      image: 'Rendering image with specified lighting and lens configuration.',
      music: 'Composing music track with selected genre and mood. Estimated completion: 45 seconds.',
      video: 'Processing video with camera motion and VFX. This may take 2-3 minutes.',
      game: 'Building game world specification with selected parameters.',
      production: 'Initializing full production pipeline across all services.',
      business: 'Analyzing business metrics and generating strategic recommendations.',
    }

    const assistantText = responses[service as string] || 'Processing your request...'

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500))

    return NextResponse.json({
      assistantText,
      suggestedActions: [
        'View in Library',
        'Create Pipeline Job',
        'Export Asset',
      ],
      createdAsset: {
        id: `asset-${Date.now()}`,
        type: service === 'music' ? 'music' : service === 'image' ? 'image' : 'project',
        title: `${userText.slice(0, 30)}...`,
        createdAt: new Date().toISOString(),
        sizeLabel: '5 MB',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}
