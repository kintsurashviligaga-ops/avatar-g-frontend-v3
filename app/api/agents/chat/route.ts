import { z } from 'zod'
import { NextResponse } from 'next/server'
import { requireUser, createServiceRoleClient } from '@/lib/supabase/server'
import { agentGRouter } from '@/lib/agents/agentGRouter'

export const dynamic = 'force-dynamic'

const ChatSchema = z.object({
  agent_id: z.string().min(1),
  conversation_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
  attachments: z.array(z.object({
    bucket: z.string(),
    path: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    label: z.string(),
  })).optional().default([]),
})

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = ChatSchema.parse(await req.json())
    const supabase = createServiceRoleClient()

    // Validate agent exists and is active
    const { data: agent } = await supabase
      .from('agent_definitions')
      .select('id, active, qa_threshold')
      .eq('id', body.agent_id)
      .single()

    if (!agent?.active) {
      return NextResponse.json({ error: 'Agent not found or inactive' }, { status: 404 })
    }

    // Get or create conversation
    let conversationId: string = body.conversation_id ?? ''
    if (!conversationId) {
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          agent_id: body.agent_id,
          project_id: body.project_id ?? null,
          title: body.message.slice(0, 60),
        })
        .select('id')
        .single()
      if (error) throw error
      conversationId = conv.id
    }

    // Insert user message
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: body.message,
      attachments: body.attachments,
    })

    // Agent G routes the chat message to appropriate job
    const { jobId } = await agentGRouter.routeChat({
      userId: user.id,
      agentId: body.agent_id,
      conversationId,
      projectId: body.project_id,
      message: body.message,
      attachments: body.attachments ?? [],
    })

    return NextResponse.json({ conversationId, jobId })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Validation error' }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
