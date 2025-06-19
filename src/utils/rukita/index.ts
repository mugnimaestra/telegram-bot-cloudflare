import type { KVNamespace } from "@cloudflare/workers-types";
import { escapeMarkdown } from "@/utils/telegram/escapeMarkdown";

interface LoginResponse {
  traceId: string;
  success: boolean;
  errorMsg: string;
  accessToken: string;
  refreshToken: string;
}

interface OrderDetailResponse {
  traceId: string;
  success: boolean;
  errorMsg: string;
  orderDetail: OrderDetail;
}

interface OrderDetail {
  id: number;
  externalId: string;
  type: string;
  status: string;
  inspectionStatus: string;
  depositStatus: string;
  deposit: number;
  depositHolder: string;
  depositRule: string;
  isDepositForfeited: boolean;
  isSplitDepositAndRent: boolean;
  extendAndHoldInvoice: boolean;
  shortStay: boolean;
  assetId: number;
  assetVariantId: number;
  assetVariantRoomId: number;
  checkInDate: string;
  checkOutDate: string;
  checkInTime: string;
  checkOutTime: string;
  roomName: string;
  roomFloorNumber: string;
  isConfirmedCheckout: boolean;
  extendFromExternalOrderId: string;
  tenantId: number;
  transferFromExternalOrderId: string;
  checkoutCategory: string;
  checkoutReason: string;
  checkoutReasonDescription: string;
  reasonOfDone: string;
  subscriptionType: string;
  monthlyCommitment: number;
  depositNotes: string;
  roomPrice: number;
  isExcludeDeposit: boolean;
  tenantCategory: string;
  remarks: string;
  cancellationRemarks: string;
  platformFeeType: string;
  signedDate: string;
  signedByAdminId1: number;
  signedByAdminId2: number;
  signedByAdminId3: number;
  source: string;
  createdAdminId: number;
  createdTimestampMs: number;
  updatedTimestampMs: number;
}

interface AssetVariant {
  id: number;
  name: string;
  gender: string;
}

interface Asset {
  id: number;
  slug: string;
  name: string;
  assetType: string;
  isRuPartner: boolean;
  coordinate: {
    latitude: string;
    longitude: string;
  };
  address: string;
  commercialType: string;
}

interface Admin {
  id: number;
  firstName: string;
  lastName: string;
  userName: string;
  email: string;
  helperRole: string;
}

interface Tenant {
  id: number;
  code: string;
  name: string;
  email: string;
  phoneNumber: {
    countryCode: string;
    number: string;
  };
  isVerified: boolean;
  createdTimestampMs: number;
}

interface Inspection {
  orderId: number;
  checkInInspectionSubmitAdminId: number;
  checkInInspectionSubmitTimestampMs: number;
  checkInInspectionSubmitRemarks: string;
  tenantSignedAgreementTimestampMs: number;
  checkOutInspectionSubmitAdminId: number;
  checkOutInspectionSubmitTimestampMs: number;
  isCheckOutInspectionWithTenant: boolean;
  checkOutInspectionSubmitRemarks: string;
  costInputFinishedAdminId: number;
  costInputFinishedTimestampMs: number;
  costInputFinishedRemarks: string;
}

interface Deposit {
  orderId: number;
  amountPrefilledTimestampMs: number;
  readyToFinalizeDueTimestampMs: number;
  readyToFinalizeForTenantTimestampMs: number;
  readyToFinalizeForTenantBy: string;
  readyToFinalizeForTenantRemarks: string;
  amountFinalizedForTenantTimestampMs: number;
  amountFinalizedForTenantBy: string;
  amountFinalizedForTenantAdminId: number;
  amountFinalizedForTenantRemarks: string;
  amountConfirmedDueTimestampMs: number;
  amountConfirmedTimestampMs: number;
  amountConfirmedBy: string;
  amountConfirmedAdminId: number;
  amountConfirmedRemarks: string;
  disputeReason: string;
  amountDisputedTimestampMs: number;
  amountDisputedBy: string;
  amountDisputedAdminId: number;
  amountDisputedRemarks: string;
  tenantNameOnAmountConfirmed: string;
  bankCode: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  legalDocUrl: string;
  refundAccountMissingLegalTimestampMs: number;
  refundAccountMissingLegalBy: string;
  refundAccountMissingLegalAdminId: number;
  refundAccountMissingLegalRemarks: string;
  readyToPayTimestampMs: number;
  paymentDueTimestampMs: number;
  invoiceCreatedTimestampMs: number;
  paymentProofUrl: string;
  paidToTenantTimestampMs: number;
  paidToTenantBy: string;
  paidToTenantAdminId: number;
  paidToTenantRemarks: string;
  paidByTenantTimestampMs: number;
  writtenOffTimestampMs: number;
  writtenOffBy: string;
  writtenOffAdminId: number;
  writtenOffRemarks: string;
  displayText: string;
  lastUpdateTimestampMs: number;
}

interface DepositLog {
  id: number;
  orderId: number;
  invoiceId: number;
  inspectionItemId: number;
  status: string;
  category: string;
  amount: number;
  approvedBy: string;
  approvedAdminId: number;
  approvedTsMs: number;
  draftedBy: string;
  draftedAdminId: number;
  draftedTsMs: number;
  name: string;
  remarks: string;
  description: string;
}

interface OrderPriceCut {
  id: number;
  orderId: number;
  priceCutId: number;
  priceCutCategory: string;
  applyStartDate: string;
  applyEndDate: string;
  isAfterOrderCreation: boolean;
  oneTime: boolean;
  isDeleted: boolean;
  createdTs: number;
  lastUpdateTs: number;
}

interface PriceCut {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  category: string;
  maxAmount: number;
  percentage: number;
  budgetAllocation: number;
  budgetSpent: number;
  budgetPeriod: string;
  adjustmentOrder: boolean;
  adjustmentRemarks: string;
  voucherCode: string;
  voucherName: string;
  voucherTncUrl: string;
  sortPriority: number;
  visible: boolean;
  voucherDurationDay: number;
  active: boolean;
  isDeleted: boolean;
  createdTsMs: number;
  lastUpdateTsMs: number;
  oneTime: boolean;
  show: boolean;
  showToSales: boolean;
  onlyFirstTransaction: boolean;
  allowedGroupId: string;
  allowedPlatform: string;
  allowedPaymentTerms: string;
  allowedMinimumDurationStayDay: number;
}

interface OrderDetailResponse {
  traceId: string;
  success: boolean;
  errorMsg: string;
  orderDetail: OrderDetail;
  inspection: Inspection;
  deposit: Deposit;
  depositLogs: DepositLog[];
  assetVariant: AssetVariant;
  asset: Asset;
  admins: { [key: string]: Admin };
  tenantName: string;
  orderPriceCuts: OrderPriceCut[];
  priceCuts: { [key: string]: PriceCut };
  orderAddons: any[];
  assetAddons: any;
  addons: any;
  signedByAdminUsername: string;
  referralCode: string;
  tenant: Tenant;
}

const RUKITA_API_URL = "https://api.rukita.co/v2/admin";
const TOKEN_CACHE_KEY = "rukita_auth_token";
const TOKEN_EXPIRY_KEY = "rukita_token_expiry";
const TOKEN_LIFETIME = 3600000; // 1 hour in milliseconds

export async function loginToRukita(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${RUKITA_API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "accept": "*/*",
      "content-type": "application/json",
      "origin": "null",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
    },
    body: JSON.stringify({
      platform: "WEB",
      appVersion: "RETOOL",
      username,
      password
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed with status: ${response.status}`);
  }

  const data = await response.json() as LoginResponse;
  
  if (!data.success) {
    throw new Error(`Login failed: ${data.errorMsg}`);
  }

  return data;
}

export async function getOrderDetail(accessToken: string, externalOrderId: string): Promise<OrderDetailResponse> {
  const response = await fetch(`${RUKITA_API_URL}/order/detail`, {
    method: "POST",
    headers: {
      "accept": "*/*",
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
      "origin": "null",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
    },
    body: JSON.stringify({
      platform: "WEB",
      appVersion: "RETOOL",
      externalOrderId
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to get order details with status: ${response.status}`);
  }

  const data = await response.json() as OrderDetailResponse;
  
  if (!data.success) {
    throw new Error(`Failed to get order details: ${data.errorMsg}`);
  }

  return data;
}

export async function getAuthToken(
  kv: KVNamespace,
  username: string,
  password: string
): Promise<string> {
  // Check if we have a cached token that hasn't expired
  const [cachedToken, tokenExpiry] = await Promise.all([
    kv.get(TOKEN_CACHE_KEY),
    kv.get(TOKEN_EXPIRY_KEY)
  ]);

  if (cachedToken && tokenExpiry) {
    const expiryTime = parseInt(tokenExpiry);
    if (Date.now() < expiryTime) {
      console.log("[Rukita] Using cached auth token");
      return cachedToken;
    }
  }

  // Login to get new token
  console.log("[Rukita] Getting new auth token");
  const loginResponse = await loginToRukita(username, password);
  
  // Cache the token with expiry
  const expiryTime = Date.now() + TOKEN_LIFETIME;
  await Promise.all([
    kv.put(TOKEN_CACHE_KEY, loginResponse.accessToken),
    kv.put(TOKEN_EXPIRY_KEY, expiryTime.toString())
  ]);

  return loginResponse.accessToken;
}

export function formatOrderDetailsMessage(response: OrderDetailResponse): string {
  const orderData = response.orderDetail;
  const inspection = response.inspection;
  const depositLogs = response.depositLogs || [];
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatDateTime = (dateStr: string, timeStr?: string) => {
    if (!dateStr) return 'N/A';
    const formatted = formatDate(dateStr);
    return timeStr ? `${formatted} at ${timeStr}` : formatted;
  };

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp || timestamp === 0) return 'Not yet';
    return formatDate(new Date(timestamp).toISOString());
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const statusEmoji = {
    "3_ONGOING": "✅",
    "2_UPCOMING": "🔜",
    "4_DONE": "✔️",
    "5_CANCELLED": "❌"
  }[orderData.status || ''] || "📋";

  const phoneNumber = response.tenant?.phoneNumber 
    ? `\\+${escapeMarkdown(response.tenant.phoneNumber.countryCode)}${escapeMarkdown(response.tenant.phoneNumber.number)}`
    : "N/A";

  const checkoutEmoji = orderData.isConfirmedCheckout ? "✅" : "❌";
  const roomAvailability = orderData.isConfirmedCheckout 
    ? "Room is available for new bookings" 
    : "Room is NOT yet available \\(checkout not confirmed\\)";

  // Format checkout reason
  const checkoutReason = orderData.checkoutReason 
    ? escapeMarkdown(orderData.checkoutReason.replace(/_/g, ' '))
    : 'N/A';
  const checkoutDescription = orderData.checkoutReasonDescription 
    ? escapeMarkdown(orderData.checkoutReasonDescription)
    : '';

  // Calculate deposit breakdown
  let depositBreakdown = '';
  if (depositLogs.length > 0) {
    const approvedLogs = depositLogs.filter(log => log.status === 'APPROVED');
    if (approvedLogs.length > 0) {
      depositBreakdown = '\n' + approvedLogs
        .map(log => `  \\- ${escapeMarkdown(log.name)}: ${escapeMarkdown(formatCurrency(log.amount))}`)
        .join('\n');
    }
  }

  // Check inspection status
  const checkInInspection = inspection?.checkInInspectionSubmitTimestampMs > 0;
  const agreementSigned = inspection?.tenantSignedAgreementTimestampMs > 0;
  const checkOutInspection = inspection?.checkOutInspectionSubmitTimestampMs > 0;

  return `🏠 *Rukita Daily Order Update*

${checkoutEmoji} *Checkout Confirmed*: ${escapeMarkdown(orderData.isConfirmedCheckout ? 'YES' : 'NO')}
_${roomAvailability}_

📊 *Order Status*: ${escapeMarkdown((orderData.status || 'UNKNOWN').replace(/_/g, ' '))}
${checkoutDescription ? `• *Checkout Reason*: ${checkoutReason}\n• *Details*: ${checkoutDescription}` : ''}

📋 *Order Details*:
• *Order ID*: ${escapeMarkdown(orderData.externalId || 'N/A')}
• *Tenant*: ${escapeMarkdown(response.tenantName || response.tenant?.name || 'N/A')}
• *Category*: ${escapeMarkdown((orderData.tenantCategory || 'N/A').replace(/_/g, ' '))}
• *Monthly Commitment*: ${orderData.monthlyCommitment || 'N/A'} month\\(s\\)
• *Email*: ${escapeMarkdown(response.tenant?.email || 'N/A')}
• *Phone*: ${phoneNumber}

🏢 *Property*:
• *Asset*: ${escapeMarkdown(response.asset?.name || 'N/A')}
• *Room*: ${escapeMarkdown(orderData.roomName || response.assetVariant?.name || 'N/A')}
• *Floor*: ${escapeMarkdown(orderData.roomFloorNumber || 'N/A')}
• *Check\\-in*: ${escapeMarkdown(formatDateTime(orderData.checkInDate, orderData.checkInTime))}
• *Check\\-out*: ${escapeMarkdown(formatDateTime(orderData.checkOutDate, orderData.checkOutTime))}

💰 *Financial*:
• *Room Price*: ${escapeMarkdown(orderData.roomPrice !== undefined ? formatCurrency(orderData.roomPrice) : 'N/A')}
• *Total Deposit*: ${escapeMarkdown(orderData.deposit !== undefined ? formatCurrency(orderData.deposit) : 'N/A')}${depositBreakdown}
• *Deposit Status*: ${escapeMarkdown((orderData.depositStatus || 'N/A').replace(/_/g, ' '))}
• *Forfeited*: ${escapeMarkdown(orderData.isDepositForfeited ? 'Yes' : 'No')}

✅ *Inspection Progress*:
• *Check\\-in Inspection*: ${checkInInspection ? '✅' : '❌'} ${escapeMarkdown(formatTimestamp(inspection?.checkInInspectionSubmitTimestampMs || 0))}
• *Agreement Signed*: ${agreementSigned ? '✅' : '❌'} ${escapeMarkdown(formatTimestamp(inspection?.tenantSignedAgreementTimestampMs || 0))}
• *Check\\-out Inspection*: ${checkOutInspection ? '✅' : '❌'} ${escapeMarkdown(formatTimestamp(inspection?.checkOutInspectionSubmitTimestampMs || 0))}

📝 *Admin Info*:
• *Signed by*: ${escapeMarkdown(response.signedByAdminUsername || 'N/A')}
• *Source*: ${escapeMarkdown((orderData.source || 'N/A').replace(/_/g, ' '))}

⏰ _Last updated: ${escapeMarkdown(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))}_`;
}