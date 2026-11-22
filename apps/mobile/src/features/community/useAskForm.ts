import { useCallback, useEffect, useRef, useState } from 'react'

import { QUESTION_PHOTOS_MAX } from '@/api/community'
import type { DiagnosisResult } from '@/api/diagnosis'
import type { ChosenDocument } from '@/features/agrochemist/chooseDocument'
import { isCrop, type Crop } from '@/features/diagnosis/crops'
import { communityApi, diagnosisApi, useDiagnosis, useProfile } from '@/services'

import { communityProblemOf, validateQuestion } from './helpers'
import type { CommunityProblem, QuestionErrors } from './helpers'

// loading: the diagnosis is being read; failed: it could not be read; ready: shown on the card
export type AskDiagnosis =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; result: DiagnosisResult }

// The state of the form of a new question. With a diagnosis the crop comes from it and is locked (the backend
// refuses a diagnosis of another crop); the region is the one of the profile, the farmer does not choose it.
export function useAskForm(params: { diagnosisId?: string; crop?: string }): {
  crop: Crop | null
  cropLocked: boolean
  title: string
  text: string
  photos: ChosenDocument[]
  regionId: number | null
  diagnosis: AskDiagnosis
  // errors of the fields the farmer has already touched (the photos are always checked)
  errors: QuestionErrors
  canSubmit: boolean
  submitting: boolean
  problem: CommunityProblem | null
  setCrop: (crop: Crop) => void
  setTitle: (title: string) => void
  setText: (text: string) => void
  addPhoto: (photo: ChosenDocument) => boolean
  removePhoto: (index: number) => void
  submit: () => Promise<string | null>
} {
  const { diagnosisId } = params
  const regionId = useProfile((s) => s.me?.regionId ?? null)
  const [crop, setCropState] = useState<Crop | null>(isCrop(params.crop) ? params.crop : null)
  const [title, setTitleState] = useState('')
  const [text, setTextState] = useState('')
  const [touched, setTouched] = useState({ title: false, text: false })
  const [photos, setPhotos] = useState<ChosenDocument[]>([])
  const [diagnosis, setDiagnosis] = useState<AskDiagnosis>(
    diagnosisId ? { status: 'loading' } : { status: 'none' },
  )
  const [submitting, setSubmitting] = useState(false)
  const [problem, setProblem] = useState<CommunityProblem | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!diagnosisId) return
    let active = true
    const apply = (result: DiagnosisResult) => {
      setDiagnosis({ status: 'ready', result })
      if (isCrop(result.crop)) setCropState(result.crop)
    }
    const stored = useDiagnosis.getState().results[diagnosisId]
    if (stored) {
      apply(stored)
      return
    }
    diagnosisApi.get(diagnosisId).then(
      (result) => {
        if (active) apply(result)
      },
      () => {
        if (active) setDiagnosis({ status: 'failed' })
      },
    )
    return () => {
      active = false
    }
  }, [diagnosisId])

  const cropLocked = Boolean(diagnosisId)
  const all = validateQuestion({ title, text, photos })
  const valid =
    Object.keys(all).length === 0 &&
    crop !== null &&
    regionId !== null &&
    (!diagnosisId || diagnosis.status === 'ready')
  const errors: QuestionErrors = {
    ...(touched.title && all.title ? { title: all.title } : {}),
    ...(touched.text && all.text ? { text: all.text } : {}),
    ...(all.photos ? { photos: all.photos } : {}),
  }

  const setCrop = useCallback(
    (next: Crop) => {
      if (!cropLocked) setCropState(next)
    },
    [cropLocked],
  )
  const setTitle = useCallback((next: string) => {
    setTitleState(next)
    setTouched((current) => ({ ...current, title: true }))
  }, [])
  const setText = useCallback((next: string) => {
    setTextState(next)
    setTouched((current) => ({ ...current, text: true }))
  }, [])
  const addPhoto = useCallback(
    (photo: ChosenDocument): boolean => {
      if (photos.length >= QUESTION_PHOTOS_MAX) return false
      setPhotos([...photos, photo])
      return true
    },
    [photos],
  )
  const removePhoto = useCallback((index: number) => {
    setPhotos((current) => current.filter((_, at) => at !== index))
  }, [])

  const submit = useCallback(async (): Promise<string | null> => {
    if (submittingRef.current || !valid || crop === null) return null
    submittingRef.current = true
    setSubmitting(true)
    setProblem(null)
    try {
      const question = await communityApi.ask({
        title,
        text,
        cropCode: crop,
        diagnosisId,
        photos: photos.map((photo) => photo.file),
      })
      return question.id
    } catch (error) {
      setProblem(communityProblemOf(error))
      return null
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [valid, crop, title, text, diagnosisId, photos])

  return {
    crop,
    cropLocked,
    title,
    text,
    photos,
    regionId,
    diagnosis,
    errors,
    canSubmit: valid && !submitting,
    submitting,
    problem,
    setCrop,
    setTitle,
    setText,
    addPhoto,
    removePhoto,
    submit,
  }
}
