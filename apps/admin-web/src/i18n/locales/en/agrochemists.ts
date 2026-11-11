import type ru from '@/i18n/locales/ru/agrochemists'
import type { Translation } from '@/i18n/types'

const agrochemists: Translation<typeof ru> = {
  title: 'Agrochemist verification',
  subtitle: 'Check the documents before the profile goes public',
  search: 'Search by name',
  statusesLabel: 'Application status',
  statuses: {
    pending: { label: 'Awaiting review', badge: 'Action needed' },
    approved: { label: 'Approved', badge: 'Active' },
    rejected: { label: 'Rejected this month', badge: 'Archive' },
  },
  documentKinds: {
    diploma: 'diploma',
    certificate: 'certificate',
  },
  table: {
    specialist: 'Specialist',
    specialization: 'Specialization',
    region: 'Region',
    documents: 'Documents',
    notUploaded: 'Not uploaded',
    submitted: 'Submitted',
    notFound: 'No one found by this name',
    empty: 'No applications',
  },
  decision: {
    approved: 'Approved',
    approvedOn: 'Approved {{date}}',
    rejected: 'Rejected',
    requestedOn: 'Requested {{date}}',
    request: 'Request',
    saveError: 'Could not save the decision',
    requestReason: 'Please upload a diploma or a certificate that confirms your qualification.',
    errors: {
      no_documents: 'Cannot approve: the specialist has sent no documents',
      reason_required: 'Give a reason',
      self_review_forbidden: 'You cannot decide on your own application',
      agrochemist_not_found: 'The application was not found',
      network: 'Cannot reach the server',
    },
  },
  documentsModal: {
    title: 'Specialist documents',
    experience_one: '{{count}} year of experience',
    experience_other: '{{count}} years of experience',
    scansNote: 'Document scans will appear once file storage is connected.',
  },
  rejectModal: {
    title: 'Reject application: {{name}}',
    note: 'The specialist will see the reason and can apply again.',
    reasonLabel: 'Rejection reason',
    reasons: {
      noDiploma: 'No diploma in a relevant field',
      unreadable: 'Documents are unreadable or incomplete',
      mismatch: 'Document details do not match the profile',
      noExperience: 'Not enough work experience',
    },
  },
}

export default agrochemists
