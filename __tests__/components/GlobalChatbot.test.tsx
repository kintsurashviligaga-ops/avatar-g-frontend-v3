import { render, screen, fireEvent } from '@/__tests__/utils/render'
import GlobalChatbot from '@/components/GlobalChatbot'

describe('GlobalChatbot', () => {
  it('renders floating button', () => {
    render(<GlobalChatbot />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('opens chat window when clicked', () => {
    render(<GlobalChatbot />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
  })
})
