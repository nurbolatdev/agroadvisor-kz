import { createShopsApi, nearbyPath } from './shops'

describe('shops api', () => {
  it('asks for the shops around a point with the four parameters', async () => {
    const client = { request: jest.fn().mockResolvedValue([]) }

    await createShopsApi(client as never).nearby({
      latitude: 43.25,
      longitude: 76.95,
      radiusKm: 10,
      limit: 50,
    })

    expect(client.request).toHaveBeenCalledWith(
      '/api/shops/nearby?latitude=43.25&longitude=76.95&radiusKm=10&limit=50',
    )
  })

  it('keeps the sign of a coordinate in the path', () => {
    expect(nearbyPath({ latitude: -33.5, longitude: -70.6, radiusKm: 1, limit: 1 })).toBe(
      '/api/shops/nearby?latitude=-33.5&longitude=-70.6&radiusKm=1&limit=1',
    )
  })

  it('encodes the id in the path of one shop', async () => {
    const client = { request: jest.fn().mockResolvedValue({}) }

    await createShopsApi(client as never).get('a/b c')

    expect(client.request).toHaveBeenCalledWith('/api/shops/a%2Fb%20c')
  })

  it('posts a report with the body as given', async () => {
    const client = { request: jest.fn().mockResolvedValue({}) }
    const body = { type: 'wrong_info' as const, shopId: 'id-1', comment: 'Wrong address' }

    await createShopsApi(client as never).report(body)

    expect(client.request).toHaveBeenCalledWith('/api/shops/requests', { method: 'POST', body })
    expect(client.request.mock.calls[0][1].body).not.toHaveProperty('latitude')
    expect(client.request.mock.calls[0][1].body).not.toHaveProperty('longitude')
  })
})
