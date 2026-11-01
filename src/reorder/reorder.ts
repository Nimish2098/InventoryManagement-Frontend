// Types and API call for GET /api/stock/reorder-recommendations

export type ReorderStatus = "CRITICAL" | "REORDER" | "OK" | "NO_DATA";

export interface ReorderRecommendation {
  inventoryItemId: number;
  productId: number;
  productName: string;
  warehouseId: number;
  warehouseName: string;
  currentStock: number;
  daysOfCover: number | null; // null when there is no demand data
  avgDailyDemand: number;
  demandStdDev: number;
  leadTimeDays: number;
  serviceLevel: number;
  safetyStock: number;
  reorderPoint: number;
  suggestedOrderQty: number;
  status: ReorderStatus;
  explanation: string;
}

// Adjust these two lines to match how your app stores the JWT and finds the API.
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN_KEY = "token";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchReorderRecommendations(
  signal?: AbortSignal,
): Promise<ReorderRecommendation[]> {
  const token = localStorage.getItem(TOKEN_KEY);

  const response = await fetch(`${API_BASE}/api/stock/reorder-recommendations`, {
    signal,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(
      response.status,
      "Your session has expired or you don't have access. Sign in again.",
    );
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `The server returned an error (${response.status}). Try again in a moment.`,
    );
  }

  return (await response.json()) as ReorderRecommendation[];
}