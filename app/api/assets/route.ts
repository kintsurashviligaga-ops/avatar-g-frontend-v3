import { NextRequest, NextResponse } from 'next/server'

const mockAssets = [
  {
    id: 'asset-1',
    type: 'image',
    title: 'Forest Texture Pack',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    sizeLabel: '24 MB',
    meta: { service: 'image' },
  },
  {
    id: 'asset-2',
    type: 'music',
    title: 'Ambient Soundscape',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    sizeLabel: '12 MB',
    meta: { service: 'music' },
  },
]

export async function GET() {
  return NextResponse.json({ assets: mockAssets })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { asset } = body

    const newAsset = {
      ...asset,
      id: `asset-${Date.now()}`,
      createdAt: new Date().toISOString(),
    }

    return NextResponse.json({ asset: newAsset })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create asset' },
      { status: 500 }
    )
  }
}
