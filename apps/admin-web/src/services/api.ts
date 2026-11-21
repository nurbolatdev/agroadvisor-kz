import { httpClient } from '@/services/backend'
import { API_MODE } from '@/services/config'
import { createLiveAiQuality } from '@/services/liveAiQuality'
import { createLiveDashboard } from '@/services/liveDashboard'
import { createLiveDiseases } from '@/services/liveDiseases'
import { createLiveModeration } from '@/services/liveModeration'
import { createRegionDirectory } from '@/services/liveRegions'
import { createLiveShops } from '@/services/liveShops'
import { createLiveUsers } from '@/services/liveUsers'
import { createLiveVerification } from '@/services/liveVerification'
import { mockApi } from '@/services/mockApi'
import type {
  Agrochemist,
  AiQualityStats,
  CommunityStats,
  CommunityPost,
  Complaint,
  ComplaintReason,
  ComplaintStatus,
  CropId,
  Disease,
  IsoDateTime,
  ModerationAction,
  ModerationStats,
  Shop,
  ShopInput,
  ShopRequest,
  ShopRequestStatus,
  ShopStats,
  ShopStatus,
  OverviewStats,
  PostKind,
  StatsPeriod,
  TrainingSample,
  UnansweredQuestion,
  User,
  UserRole,
  UserStatus,
  VerificationStats,
  VerificationStatus,
} from '@/shared/types'

/** Complaint joined with the reported post and its author, as the moderation screen needs it. */
export interface ComplaintDetails extends Complaint {
  post: CommunityPost
  author: ComplaintAuthor
}

/** The author of a reported post: what the API gives, not a full user profile. */
export interface ComplaintAuthor {
  id: string
  name: string
  role: UserRole
  status: UserStatus
  expert: boolean
  /** Posts of the author hidden by moderators. */
  hiddenCount: number
  registeredAt?: IsoDateTime
  postsCount?: number
}

export interface ComplaintFilters {
  status?: ComplaintStatus
  kind?: PostKind
  reason?: ComplaintReason
}

export interface SidebarCounters {
  newComplaints: number
  pendingVerifications: number
  newShopRequests: number
}

/**
 * Contract between pages and the data source. Pages import `api` only, so the mock
 * can be replaced by an HTTP client without touching them.
 */
export interface AdminApi {
  /** `confidenceThreshold` (%) defines which diagnoses count as uncertain. */
  getOverviewStats(period: StatsPeriod, confidenceThreshold: number): Promise<OverviewStats>
  getSidebarCounters(): Promise<SidebarCounters>

  getAiQualityStats(period: StatsPeriod): Promise<AiQualityStats>
  /** Labeled photos confirmed by experts, for retraining the model. */
  getTrainingSamples(): Promise<TrainingSample[]>

  getCommunityStats(period: StatsPeriod): Promise<CommunityStats>
  inviteAgrochemist(questionId: string, agrochemistId: string): Promise<UnansweredQuestion>

  getModerationStats(): Promise<ModerationStats>
  getComplaints(filters?: ComplaintFilters): Promise<ComplaintDetails[]>
  /** Takes a new case into work; a case already in work is returned as it is. */
  startComplaint(id: string): Promise<ComplaintDetails>
  resolveComplaint(id: string, action: ModerationAction, comment: string): Promise<ComplaintDetails>

  getVerificationStats(): Promise<VerificationStats>
  getAgrochemists(filters?: {
    status?: VerificationStatus
    search?: string
  }): Promise<Agrochemist[]>
  approveAgrochemist(id: string): Promise<Agrochemist>
  rejectAgrochemist(id: string, reason: string): Promise<Agrochemist>
  requestDocuments(id: string): Promise<Agrochemist>

  getUsers(filters?: { role?: UserRole; search?: string }): Promise<User[]>

  /** Names a shop is tied to and the filter offers: the districts of the mock, the regions of the backend. */
  getShopAreas(): Promise<string[]>
  getShopStats(): Promise<ShopStats>
  getShops(filters?: { search?: string; district?: string; status?: ShopStatus }): Promise<Shop[]>
  /** Creates a shop, or updates it when `id` is given. */
  saveShop(input: ShopInput, id?: string): Promise<Shop>
  setShopStatus(id: string, status: ShopStatus): Promise<Shop>
  /** New requests from farmers. */
  getShopRequests(): Promise<ShopRequest[]>
  resolveShopRequest(id: string, status: Exclude<ShopRequestStatus, 'new'>): Promise<ShopRequest>

  getDiseases(filters?: { crop?: CropId }): Promise<Disease[]>
  getDisease(id: string): Promise<Disease | null>
}

/**
 * In `live` mode the pages that already use the backend (agrochemist verification, diseases, users, AI quality,
 * shops, moderation, the dashboard numbers) go through the HTTP client; everything else is still served by the mock.
 */
function createLiveApi(): AdminApi {
  const verification = createLiveVerification(httpClient, mockApi)
  const shops = createLiveShops(httpClient, verification)
  const moderation = createLiveModeration(httpClient, createRegionDirectory(httpClient), shops)
  return {
    ...mockApi,
    ...verification,
    ...createLiveDiseases(httpClient),
    ...createLiveUsers(httpClient),
    ...createLiveAiQuality(httpClient),
    // complaints, the funnel and the time to first advice stay mock: no backend source yet
    ...createLiveDashboard(httpClient, mockApi),
    // the sidebar counters of the verification, the shops and the moderation are all live: each wraps the previous
    ...shops,
    ...moderation,
  }
}

export const api: AdminApi = API_MODE === 'live' ? createLiveApi() : mockApi
