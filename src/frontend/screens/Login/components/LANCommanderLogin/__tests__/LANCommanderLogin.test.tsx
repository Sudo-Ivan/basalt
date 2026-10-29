import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LANCommanderLogin from '../index'
import ContextProvider from 'frontend/state/ContextProvider'

describe('LANCommanderLogin', () => {
  it('renders the form fields', () => {
    const login = jest.fn()
    render(
      <ContextProvider.Provider
        value={
          {
            lancommander: {
              library: [],
              login,
              logout: jest.fn(),
              serverUrl: ''
            }
          } as never
        }
      >
        <LANCommanderLogin />
      </ContextProvider.Provider>
    )
    expect(screen.getByPlaceholderText('Server URL')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(
      screen.getByLabelText(/Allow self-signed certificate/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/only connect to servers you trust/i)
    ).toBeInTheDocument()
  })

  it('submits the login payload through the context login function', async () => {
    const login = jest.fn().mockResolvedValue({ status: 'done' })
    render(
      <ContextProvider.Provider
        value={
          {
            lancommander: {
              library: [],
              login,
              logout: jest.fn(),
              serverUrl: ''
            }
          } as never
        }
      >
        <LANCommanderLogin />
      </ContextProvider.Provider>
    )

    fireEvent.change(screen.getByPlaceholderText('Server URL'), {
      target: { value: 'http://lan.local:1337/' }
    })
    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'alice' }
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret' }
    })
    fireEvent.click(screen.getByLabelText(/Allow self-signed certificate/i))
    fireEvent.click(screen.getByRole('button', { name: /LANCommander Login/i }))

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        serverUrl: 'http://lan.local:1337/',
        username: 'alice',
        password: 'secret',
        allowSelfSigned: true
      })
    )
  })

  it('shows an error message when login fails', async () => {
    const login = jest
      .fn()
      .mockResolvedValue({ status: 'error', error: 'bad credentials' })
    render(
      <ContextProvider.Provider
        value={
          {
            lancommander: {
              library: [],
              login,
              logout: jest.fn(),
              serverUrl: ''
            }
          } as never
        }
      >
        <LANCommanderLogin />
      </ContextProvider.Provider>
    )

    fireEvent.change(screen.getByPlaceholderText('Server URL'), {
      target: { value: 'http://lan.local' }
    })
    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'a' }
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'b' }
    })
    fireEvent.click(screen.getByRole('button', { name: /LANCommander Login/i }))

    await waitFor(() =>
      expect(screen.getByText('bad credentials')).toBeInTheDocument()
    )
  })
})
