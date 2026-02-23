import { render, screen } from '@/__tests__/utils/render'
import Navigation from '@/components/Navigation'

describe('Navigation', () => {
  it('renders logo and brand name', () => {
    render(<Navigation />)
    expect(screen.getByText('Avatar G')).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<Navigation />)
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0)
    expect(document.querySelector('a[href="/dashboard"]')).toBeInTheDocument()
  })

  it('shows create identity button when no identity', () => {
    render(<Navigation />)
    expect(screen.getByText('Create Identity')).toBeInTheDocument()
  })
})
