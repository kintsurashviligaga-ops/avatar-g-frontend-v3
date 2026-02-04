export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function buildPrompt(
  service: string,
  userText: string,
  selections: Record<string, string>
): string {
  const parts = [`[${service} Service]`]
  
  if (Object.keys(selections).length > 0) {
    parts.push('Parameters:')
    Object.entries(selections).forEach(([key, value]) => {
      parts.push(`- ${key}: ${value}`)
    })
  }
  
  parts.push(`Request: ${userText}`)
  parts.push('Output: Professional-grade result with metadata')
  
  return parts.join('\n')
}

export function getServiceIcon(key: string): string {
  const icons: Record<string, string> = {
    avatar: '👤',
    voice: '🎙️',
    image: '🎨',
    music: '🎵',
    video: '🎬',
    game: '🎮',
    production: '⚡',
    business: '💼',
  }
  return icons[key] || '⚡'
}

export function getCrossServiceSuggestions(
  service: string,
  selections: Record<string, string>
): string[] {
  const suggestions: string[] = []
  
  if (service === 'music' && selections['mood'] === 'energetic') {
    suggestions.push('Video: Try fast cuts with 120 BPM edit rhythm')
    suggestions.push('Game: Perfect for action sequences')
  }
  
  if (service === 'voice' && selections['emotion']) {
    suggestions.push('Avatar: Match facial expression to voice emotion')
    suggestions.push('Video: Sync lip movements with voice')
  }
  
  if (service === 'image' && selections['style']) {
    suggestions.push('Video: Use as scene background or texture')
    suggestions.push('Game: Import as environment asset')
  }
  
  return suggestions
}
