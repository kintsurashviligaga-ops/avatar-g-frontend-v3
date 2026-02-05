import { render, screen, fireEvent, waitFor } from '@/__tests__/utils/render'
import { useIdentity } from '@/lib/identity/IdentityContext'

function TestComponent() {
  const { globalAvatarId, setGlobalAvatarId, verifyIdentity, clearIdentity } = useIdentity()
  
  return (
    <div>
      <div data-testid="avatar-id">{globalAvatarId || 'no-id'}</div>
      <div data-testid="verified">{verifyIdentity() ? 'yes' : 'no'}</div>
      <button onClick={() => setGlobalAvatarId('TEST-AVATAR-123')}>
        Set Avatar
      </button>
      <button onClick={clearIdentity}>
        Clear
      </button>
    </div>
  )
}

describe('Identity Flow', () => {
  it('starts with no identity', () => {
    render(<TestComponent />)
    expect(screen.getByTestId('avatar-id')).toHaveTextContent('no-id')
    expect(screen.getByTestId('verified')).toHaveTextContent('no')
  })

  it('sets avatar id and persists to localStorage', () => {
    render(<TestComponent />)
    fireEvent.click(screen.getByText('Set Avatar'))
    expect(screen.getByTestId('avatar-id')).toHaveTextContent('TEST-AVATAR-123')
    expect(localStorage.setItem).toHaveBeenCalledWith('GLOBAL_AVATAR_ID', 'TEST-AVATAR-123')
  })

  it('clears identity', () => {
    render(<TestComponent />)
    fireEvent.click(screen.getByText('Set Avatar'))
    fireEvent.click(screen.getByText('Clear'))
    expect(screen.getByTestId('avatar-id')).toHaveTextContent('no-id')
    expect(localStorage.removeItem).toHaveBeenCalledWith('GLOBAL_AVATAR_ID')
  })
})
