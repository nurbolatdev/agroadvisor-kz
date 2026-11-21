import type ru from '@/i18n/locales/ru/community'
import type { Translation } from '@/i18n/types'

const community: Translation<typeof ru> = {
  title: 'Community',
  subtitle: 'Activity of the farmer community and agrochemist consultations',
  outOf5: 'out of 5',
  kpi: {
    questions: 'Questions {{period}}',
    firstAnswer: 'Time to first answer',
    resolved: 'Resolved questions',
    points: '{{change}} pp',
    unanswered: 'No answer > 24 h',
  },
  activity: {
    title: 'Questions and answers',
    buckets: {
      '7d': 'by day',
      '30d': 'by week',
      season: 'by month',
    },
    questions: 'questions',
    answers: 'answers',
  },
  topMembers: {
    title: 'Most active',
    subtitle: 'answers {{period}}',
    roles: {
      agrochemist: 'Agrochemist',
      farmer: 'Farmer',
    },
  },
  unanswered: {
    title: 'No answer for over 24 hours',
    subtitle: 'worth bringing in an agrochemist',
    count_one: '{{count}} question',
    count_other: '{{count}} questions',
    allAnswered: 'All questions have answers',
    hours: '{{hours}} h',
    invited: 'Agrochemist invited · {{name}}',
    invite: 'Invite an agrochemist',
  },
  inviteModal: {
    title: 'Invite an agrochemist',
    prompt: 'Question “{{title}}” — choose a verified specialist:',
    legend: 'Agrochemist',
    submit: 'Invite',
    sending: 'Sending…',
    error: 'Could not send the invitation',
  },
  consultations: {
    title: 'Consultations',
    subtitle: 'farmer — agrochemist chat',
    requests: 'Requests',
    closed: 'Closed',
    avgResponse: 'Average response time',
    avgRating: 'Average rating',
  },
}

export default community
