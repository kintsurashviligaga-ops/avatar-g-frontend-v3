import { POST as textPost } from '@/app/api/generate/text/route'
import { POST as imagePost } from '@/app/api/generate/image/route'
import { NextRequest } from 'next/server'

describe('API Routes', () => {
  describe('Text Generation', () => {
    it('returns 403 without identity', async () => {
      const req = new NextRequest('http://localhost:3000/api/generate/text', {
        method: 'POST',
        body: JSON.stringify({ content: 'test' })
      })
      
      const res = await textPost(req)
      expect(res.status).toBe(403)
    })

    it('accepts request with identity', async () => {
      const req = new NextRequest('http://localhost:3000/api/generate/text', {
        method: 'POST',
        body: JSON.stringify({
          content: 'test',
          _identity: { avatarId: 'TEST-123', voiceId: 'VOICE-123' }
        })
      })
      
      const res = await textPost(req)
      expect(res.status).toBe(200)
    })
  })

  describe('Image Generation', () => {
    it('requires avatar id', async () => {
      const req = new NextRequest('http://localhost:3000/api/generate/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'test',
          _identity: { voiceId: 'VOICE-123' } // missing avatarId
        })
      })
      
      const res = await imagePost(req)
      expect(res.status).toBe(403)
    })
  })
})
