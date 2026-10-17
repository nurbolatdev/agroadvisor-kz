import type ru from '@/i18n/locales/ru/diseases'
import type { Translation } from '@/i18n/types'

const diseases: Translation<typeof ru> = {
  title: 'Diseases and products',
  subtitle: 'Catalog for the MVP crops',
  summary: 'Catalog for the MVP crops · {{entries}}',
  entries_one: '{{count}} entry',
  entries_other: '{{count}} entries',
  searchLabel: 'Search for a disease',
  searchPlaceholder: 'Name or Latin name',
  cropFilter: 'Crop',
  allCrops: 'All crops',
  notFound: 'Nothing found',
  notFoundDescription: 'Try another name or select all crops.',
  more: 'Details',
  kinds: {
    fungal: 'Fungal',
    bacterial: 'Bacterial',
    viral: 'Viral',
    pest: 'Pest',
  },
  severities: {
    high: 'High risk',
    medium: 'Medium risk',
    low: 'Low risk',
  },
  detail: {
    back: 'All diseases',
    missing: 'Disease not found',
    missingDescription: 'The entry may have been removed, or the address has a typo.',
    symptoms: 'Symptoms',
    conditions: 'Conditions for development',
    chemical: 'Chemical control',
    chemicalNote: 'Rates are for demonstration — check the product label',
    biological: 'Biological control',
    prevention: 'Prevention',
  },
  treatments: {
    product: 'Product',
    ingredient: 'Active ingredient',
    dosage: 'Rate',
  },
}

export default diseases
