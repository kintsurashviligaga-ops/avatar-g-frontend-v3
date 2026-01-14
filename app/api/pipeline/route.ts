import { NextRequest, NextResponse } from 'next/server'

const mockJobs: any[] = []

export async function GET() {
  return NextResponse.json({ jobs: mockJobs })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { job } = body

    const newJob = {
      ...job,
      id: `job-${Date.now()}`,
      createdAt: new Date().toISOString(),
    }

    mockJobs.push(newJob)

    return NextResponse.json({ job: newJob })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create pipeline job' },
      { status: 500 }
    )
  }
}
