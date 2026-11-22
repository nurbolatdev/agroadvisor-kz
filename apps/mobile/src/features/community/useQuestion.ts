import { useCallback, useRef, useState } from 'react'

import type { Answer, Question } from '@/api/community'
import type { DiagnosisResult } from '@/api/diagnosis'
import { ApiError, NetworkError } from '@/api/errors'
import { communityApi } from '@/services'

import { communityProblemOf } from './helpers'
import type { CommunityProblem } from './helpers'

export type QuestionState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error'; reason: 'offline' | 'server' }
  // `diagnosis`: the result the author attached, null when there is none
  | { status: 'ready'; question: Question; answers: Answer[]; diagnosis: DiagnosisResult | null }

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404

// One question with its answers, the diagnosis the author attached and the actions of the screen: answer,
// vote and mark the best answer. `problem` is the outcome of the last action that did not work.
export function useQuestion(id: string): {
  state: QuestionState
  problem: CommunityProblem | null
  sending: boolean
  accepting: boolean
  votingIds: string[]
  reload: () => void
  sendAnswer: (text: string) => Promise<boolean>
  toggleVote: (answer: Answer) => Promise<void>
  accept: (answerId: string) => Promise<void>
  clearAccepted: () => Promise<void>
} {
  const [state, setState] = useState<QuestionState>({ status: 'loading' })
  const [problem, setProblem] = useState<CommunityProblem | null>(null)
  const [sending, setSending] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [votingIds, setVotingIds] = useState<string[]>([])
  const latest = useRef(0)
  const sendingRef = useRef(false)
  const acceptingRef = useRef(false)
  const voting = useRef(new Set<string>())

  const readDiagnosis = useCallback(
    async (question: Question): Promise<DiagnosisResult | null> => {
      if (!question.diagnosisUrl) return null
      try {
        return await communityApi.diagnosis(id)
      } catch {
        // the result of the model is an extra: the question reads without it
        return null
      }
    },
    [id],
  )

  const reload = useCallback(() => {
    const request = (latest.current += 1)
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }))
    Promise.all([communityApi.question(id), communityApi.answers(id)]).then(
      async ([question, answers]) => {
        const diagnosis = await readDiagnosis(question)
        if (latest.current === request) setState({ status: 'ready', question, answers, diagnosis })
      },
      (error: unknown) => {
        if (latest.current !== request) return
        if (isNotFound(error)) setState({ status: 'notFound' })
        else {
          const reason = error instanceof NetworkError ? 'offline' : 'server'
          // a failed refresh keeps what is already on screen
          setState((current) =>
            current.status === 'ready' ? current : { status: 'error', reason },
          )
        }
      },
    )
  }, [id, readDiagnosis])

  const patchAnswer = useCallback((answerId: string, change: (answer: Answer) => Answer) => {
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            answers: current.answers.map((a) => (a.id === answerId ? change(a) : a)),
          }
        : current,
    )
  }, [])

  const sendAnswer = useCallback(
    async (text: string) => {
      if (sendingRef.current) return false
      sendingRef.current = true
      setSending(true)
      setProblem(null)
      try {
        const answer = await communityApi.answer(id, text)
        // a read that started earlier does not hold this answer: it must not replace the list
        latest.current += 1
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                question: { ...current.question, answerCount: current.question.answerCount + 1 },
                answers: [...current.answers, answer],
              }
            : current,
        )
        return true
      } catch (error) {
        setProblem(communityProblemOf(error))
        return false
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [id],
  )

  const toggleVote = useCallback(
    async (answer: Answer) => {
      if (voting.current.has(answer.id)) return
      voting.current.add(answer.id)
      setVotingIds([...voting.current])
      setProblem(null)
      const removing = answer.myVote === 1
      const myVote = removing ? 0 : 1
      // shown at once; the server's count replaces it, a refusal puts the old one back
      patchAnswer(answer.id, (a) => ({ ...a, myVote, score: a.score + myVote - a.myVote }))
      try {
        const vote = removing
          ? await communityApi.unvote(answer.id)
          : await communityApi.vote(answer.id)
        patchAnswer(answer.id, (a) => ({ ...a, myVote: vote.myVote, score: vote.score }))
      } catch (error) {
        patchAnswer(answer.id, (a) => ({ ...a, myVote: answer.myVote, score: answer.score }))
        setProblem(communityProblemOf(error))
      } finally {
        voting.current.delete(answer.id)
        setVotingIds([...voting.current])
      }
    },
    [patchAnswer],
  )

  // the server orders the answers and settles the status, so both are read again
  const change = useCallback(
    async (action: () => Promise<void>) => {
      if (acceptingRef.current) return
      acceptingRef.current = true
      setAccepting(true)
      setProblem(null)
      try {
        try {
          await action()
        } catch (error) {
          setProblem(communityProblemOf(error))
          return
        }
        // the action worked: a refresh that fails keeps the screen as it is and is not a problem
        const request = (latest.current += 1)
        try {
          const [question, answers] = await Promise.all([
            communityApi.question(id),
            communityApi.answers(id),
          ])
          if (latest.current === request) {
            setState((current) =>
              current.status === 'ready' ? { ...current, question, answers } : current,
            )
          }
        } catch {
          // the next reload brings the server's order
        }
      } finally {
        acceptingRef.current = false
        setAccepting(false)
      }
    },
    [id],
  )

  const accept = useCallback(
    (answerId: string) => change(() => communityApi.accept(id, answerId)),
    [change, id],
  )
  const clearAccepted = useCallback(
    () => change(() => communityApi.clearAccepted(id)),
    [change, id],
  )

  return {
    state,
    problem,
    sending,
    accepting,
    votingIds,
    reload,
    sendAnswer,
    toggleVote,
    accept,
    clearAccepted,
  }
}
