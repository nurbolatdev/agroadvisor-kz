import type { ApiClient } from './client'
import {
  createCommunityApi,
  feedPath,
  questionFormData,
  QUESTION_UPLOAD_TIMEOUT_MS,
} from './community'

function setup() {
  const request = jest.fn().mockResolvedValue({})
  return { request, api: createCommunityApi({ request } as unknown as ApiClient) }
}

describe('feedPath', () => {
  it('has only the limit without a filter', () => {
    expect(feedPath()).toBe('/api/community/questions?limit=20')
  })

  it('repeats crop and sends the other filters', () => {
    expect(
      feedPath({
        crop: ['wheat', 'tomato'],
        regionId: 7,
        status: 'solved',
        mine: true,
        before: 'q 1',
      }),
    ).toBe(
      '/api/community/questions?crop=wheat&crop=tomato&regionId=7&status=solved&mine=true&before=q%201&limit=20',
    )
  })

  it('cuts the crops to four and drops empty codes', () => {
    const path = feedPath({ crop: ['a', '', 'b', 'c', 'd', 'e'] })

    expect(path.match(/crop=/g)).toHaveLength(4)
    expect(path).not.toContain('crop=e')
  })

  it('keeps the limit between 1 and 50', () => {
    expect(feedPath({ limit: 0 })).toContain('limit=1')
    expect(feedPath({ limit: 500 })).toContain('limit=50')
    expect(feedPath({ limit: Number.NaN })).toContain('limit=20')
  })

  it('skips mine=false', () => {
    expect(feedPath({ mine: false })).not.toContain('mine')
  })
})

describe('createCommunityApi', () => {
  it('encodes ids in the paths', async () => {
    const { api, request } = setup()

    await api.question('a/b')
    await api.answers('a/b')
    await api.unvote('x y')

    expect(request).toHaveBeenNthCalledWith(1, '/api/community/questions/a%2Fb')
    expect(request).toHaveBeenNthCalledWith(2, '/api/community/questions/a%2Fb/answers')
    expect(request).toHaveBeenNthCalledWith(3, '/api/community/answers/x%20y/vote', {
      method: 'DELETE',
    })
  })

  it('votes with a number, not a string', async () => {
    const { api, request } = setup()

    await api.vote('a1')

    const [path, options] = request.mock.calls[0]
    expect(path).toBe('/api/community/answers/a1/vote')
    expect(options.method).toBe('PUT')
    expect(options.body).toEqual({ value: 1 })
    expect(typeof options.body.value).toBe('number')
  })

  it('sends each call with its method and path', async () => {
    const { api, request } = setup()

    await api.answer('q1', 'text')
    await api.accept('q1', 'a1')
    await api.clearAccepted('q1')
    await api.diagnosis('q1')
    await api.subscriptions()
    await api.saveSubscriptions(['wheat'])
    await api.report({ targetType: 'answer', targetId: 'a1', reason: 'spam' })

    expect(request.mock.calls).toEqual([
      ['/api/community/questions/q1/answers', { method: 'POST', body: { text: 'text' } }],
      ['/api/community/questions/q1/accepted-answer', { method: 'PUT', body: { answerId: 'a1' } }],
      ['/api/community/questions/q1/accepted-answer', { method: 'DELETE' }],
      ['/api/community/questions/q1/diagnosis'],
      ['/api/community/subscriptions'],
      ['/api/community/subscriptions', { method: 'PUT', body: { crops: ['wheat'] } }],
      [
        '/api/community/reports',
        { method: 'POST', body: { targetType: 'answer', targetId: 'a1', reason: 'spam' } },
      ],
    ])
  })

  it('uploads a question as a form with the long timeout', async () => {
    const { api, request } = setup()

    await api.ask({ title: 'T', text: 'x', cropCode: 'wheat', photos: [] })

    const [path, options] = request.mock.calls[0]
    expect(path).toBe('/api/community/questions')
    expect(options.method).toBe('POST')
    expect(options.formData).toBeInstanceOf(FormData)
    expect(options.timeoutMs).toBe(QUESTION_UPLOAD_TIMEOUT_MS)
  })
})

describe('questionFormData', () => {
  it('sends neutral photo names and trimmed fields', () => {
    const form = questionFormData({
      title: ' Spots ',
      text: ' on leaves ',
      cropCode: 'tomato',
      diagnosisId: 'd1',
      photos: [
        { uri: 'file:///Users/ivan/IMG_1.jpg', type: 'image/jpeg', name: 'ivan-passport.jpg' },
        { uri: 'file:///b.png', type: 'image/png', name: 'b.png' },
      ],
    })

    expect(form.get('title')).toBe('Spots')
    expect(form.get('text')).toBe('on leaves')
    expect(form.get('cropCode')).toBe('tomato')
    expect(form.get('diagnosisId')).toBe('d1')
    expect(form.getAll('photos')).toHaveLength(2)
  })

  it('names the photo parts neutrally, whatever the picker called them', () => {
    const append = jest.spyOn(FormData.prototype, 'append')
    try {
      questionFormData({
        title: 'abc',
        text: 'x',
        cropCode: 'wheat',
        photos: [
          { uri: 'file:///Users/ivan/IMG_1.jpg', type: 'image/jpeg', name: 'ivan-passport.jpg' },
          { uri: 'file:///b.png', type: 'image/png', name: 'b.png' },
        ],
      })
      const parts = append.mock.calls
        .filter(([key]) => key === 'photos')
        .map(([, value]) => value as unknown as { name: string })
      expect(parts.map((p) => p.name)).toEqual(['photo-1.jpg', 'photo-2.png'])
    } finally {
      append.mockRestore()
    }
  })

  it('leaves out diagnosisId when there is none', () => {
    const form = questionFormData({ title: 'abc', text: 'x', cropCode: 'wheat', photos: [] })

    expect(form.has('diagnosisId')).toBe(false)
  })
})
