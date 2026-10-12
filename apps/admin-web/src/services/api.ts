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
  VerificationStats,
  VerificationStatus,
} from '@/shared/types'

/** Complaint joined with the reported post and its author, as the moderation screen needs it. */
export interface ComplaintDetails extends Complaint {
  post: CommunityPost
  author: User
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
  getOverviewStats(period: StatsPeriod): Promise<OverviewStats>
  getSidebarCounters(): Promise<SidebarCounters>

  getAiQualityStats(period: StatsPeriod): Promise<AiQualityStats>
  /** Labeled photos confirmed by experts, for retraining the model. */
  getTrainingSamples(): Promise<TrainingSample[]>

  getCommunityStats(period: StatsPeriod): Promise<CommunityStats>
  inviteAgrochemist(questionId: string, agrochemistId: string): Promise<UnansweredQuestion>

  getModerationStats(): Promise<ModerationStats>
  getComplaints(filters?: ComplaintFilters): Promise<ComplaintDetails[]>
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

export const api: AdminApi = mockApi
