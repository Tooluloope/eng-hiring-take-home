import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { format } from 'date-fns'
import { api, authApi, formatApiErrorMessage, postsApi, seriesApi } from './client'

describe('api', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    localStorage.clear()
  })

  it('sends JSON body and Content-Type header', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
    })
    await api('/test', { method: 'POST', body: JSON.stringify({ foo: 'bar' }) })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: '{"foo":"bar"}',
      })
    )
  })

  it('adds Authorization header when token in localStorage', async () => {
    localStorage.setItem('token', 'secret')
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    await api('/posts')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      })
    )
  })

  it('throws with message from detail when response not ok', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Email already registered' }),
    })
    await expect(api('/auth/register', { method: 'POST', body: '{}' })).rejects.toThrow(
      'Email already registered'
    )
  })

  it('formats UTC timestamps in error details as local time', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        detail:
          "instagram posts must be at least 15 minutes apart. 'Launch teaser' at 2026-05-28T01:45:00Z conflicts with 'Launch teaser' at 2026-05-28T01:43:00Z.",
      }),
    })
    const expected = `${format(new Date('2026-05-28T01:45:00Z'), 'MMM d, yyyy HH:mm')} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`

    await expect(api('/series', { method: 'POST', body: '{}' })).rejects.toThrow(
      expected
    )
    expect(
      formatApiErrorMessage(
        "instagram posts must be at least 15 minutes apart. 'Launch teaser' at 2026-05-28T01:45:00Z conflicts with 'Launch teaser' at 2026-05-28T01:43:00Z."
      )
    ).not.toContain('2026-05-28T01:45:00Z')
  })

  it('on 401 removes token and throws Unauthorized', async () => {
    localStorage.setItem('token', 'x')
    const hrefSetter = vi.fn()
    Object.defineProperty(window, 'location', { value: { get href() { return '' }, set href(v) { hrefSetter(v) } }, writable: true })
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    })
    await expect(api('/posts')).rejects.toThrow('Unauthorized')
    expect(localStorage.getItem('token')).toBeNull()
    expect(hrefSetter).toHaveBeenCalledWith('/login')
  })
})

describe('authApi', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('login sends POST to /auth/login with email and password', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'tok', token_type: 'bearer' }),
    })
    await authApi.login('a@b.com', 'pass')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'pass' }),
      })
    )
  })

  it('register sends POST to /auth/register with data', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, email: 'u@x.com' }),
    })
    await authApi.register({ email: 'u@x.com', password: 'p', full_name: 'U' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'u@x.com', password: 'p', full_name: 'U' }),
      })
    )
  })
})

describe('postsApi', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('list builds query string from params', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    })
    await postsApi.list({ status: 'draft', platform: 'youtube' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\?.*status=draft.*platform=youtube|platform=youtube.*status=draft/),
      expect.any(Object)
    )
  })

  it('create sends POST with body', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'T', platform: 'youtube' }),
    })
    await postsApi.create({ title: 'T', platform: 'youtube', status: 'draft' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/posts'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'T', platform: 'youtube', status: 'draft' }),
      })
    )
  })
})

describe('seriesApi', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('create sends POST to /series with body', async () => {
    const payload = { name: 'Launch', cadence: 'weekly', posts: [] }
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, ...payload }),
    })
    await seriesApi.create(payload)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/series'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    )
  })

  it('delete sends DELETE to /series/:id', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })
    await seriesApi.delete(3)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/series/3'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})
