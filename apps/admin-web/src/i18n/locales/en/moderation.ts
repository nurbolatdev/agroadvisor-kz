import type ru from '@/i18n/locales/ru/moderation'
import type { Translation } from '@/i18n/types'

const moderation: Translation<typeof ru> = {
  title: 'Moderation',
  subtitle: 'User complaints about posts and answers in the community',
  kpi: {
    today: 'Complaints today',
    avgResolution: 'Average resolution time',
    resolvedWeek: 'Resolved this week',
  },
  reasons: {
    ads: 'Advertising',
    misinformation: 'Misleading advice',
    spam: 'Spam',
    abuse: 'Abuse',
  },
  statuses: {
    new: 'New',
    in_progress: 'In progress',
    resolved: 'Resolved',
  },
  statusFilters: {
    new: 'New',
    in_progress: 'In progress',
    resolved: 'Resolved',
  },
  kinds: {
    post: 'Post',
    answer: 'Answer',
  },
  kindFilters: {
    post: 'Posts',
    answer: 'Answers',
  },
  filters: {
    label: 'Complaint filters',
    reason: 'Complaint reason',
    allReasons: 'All reasons',
  },
  list: {
    label: 'Complaints',
    empty: 'No complaints',
    emptyDescription: 'Nothing matches these filters.',
    back: 'Back to list',
    selectTitle: 'Select a complaint',
    selectDescription: 'Complaint details and actions will appear here.',
  },
  reports_one: '{{count}} complaint',
  reports_other: '{{count}} complaints',
  details: {
    title: {
      post: 'Complaint about a post',
      answer: 'Complaint about an answer',
    },
    hidden: 'Hidden',
    reasons: 'Complaint reasons',
    history: 'Author history',
    onPlatform: 'On the platform {{since}}',
    posts_one: '{{count}} publication',
    posts_other: '{{count}} publications',
    warnings_one: '{{count}} warning',
    warnings_other: '{{count}} warnings',
    noWarnings: 'No warnings',
    blocked: 'Blocked',
  },
  actions: {
    decisionLabel: 'Decision reason',
    decisions: {
      ads: 'Advertising and selling goods are against the rules',
      misinformation: 'Dangerous or misleading advice',
      spam: 'Spam and repeated messages',
      abuse: 'Insults and rudeness',
    },
    keepComment: 'No violations found',
    results: {
      keep: 'Publication kept',
      hide: 'Publication hidden',
      block: 'Publication hidden, author blocked',
    },
    keep: 'Keep',
    saving: 'Saving…',
    hide: {
      post: 'Hide post',
      answer: 'Hide answer',
    },
    hiding: 'Hiding…',
    block: 'Block',
    blocking: 'Blocking…',
    saveError: 'Could not save the decision',
    confirmTitle: 'Block {{name}}?',
    confirmText:
      'The publication will be hidden and the author will no longer be able to post in the community. Reason: {{reason}}.',
  },
}

export default moderation
