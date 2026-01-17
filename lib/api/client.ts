const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.avatar-g.ge'

export class APIClient {
  private baseURL: string
  private token: string | null = null

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  setToken(token: string) {
    this.token = token
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseURL}${endpoint}`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (options.headers) {
      Object.assign(headers, options.headers)
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`)
    }

    return response.json()
  }

  // Health check
  async health() {
    return this.request('/api/health')
  }

  // AI Generation
  async generateAI(prompt: string) {
    return this.request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    })
  }

  // Voice Generation
  async generateVoice(params: {
    text: string
    language?: string
    emotion?: number
  }) {
    return this.request('/api/voice/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  // Music Generation
  async generateMusic(params: {
    prompt: string
    duration?: number
    style?: string
  }) {
    return this.request('/api/music/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  // Music Status
  async getMusicStatus(jobId: string) {
    return this.request(`/api/music/status?jobId=${jobId}`)
  }

  // Chat
  async chat(messages: Array<{ role: string; content: string }>) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    })
  }
}

export const apiClient = new APIClient()
