import { z } from "zod";

// ─── API Error Shape ──────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code?: string;
    statusCode: number;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

// ─── Standard API Response Builder ───────────────────────────────────────────

export function successResponse<T>(
  data: T,
  meta?: ApiSuccessResponse<T>["meta"]
): ApiSuccessResponse<T> {
  return { data, ...(meta ? { meta } : {}) };
}

export function errorResponse(
  message: string,
  statusCode = 500,
  code?: string
): ApiErrorResponse {
  return {
    error: { message, statusCode, ...(code ? { code } : {}) },
  };
}

// ─── Validation Helper ────────────────────────────────────────────────────────

export function validateBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ApiErrorResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: errorResponse(
        result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
        400,
        "VALIDATION_ERROR"
      ),
    };
  }
  return { success: true, data: result.data };
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

export function getPaginationMeta(
  total: number,
  params: PaginationParams
): { total: number; page: number; pageSize: number; totalPages: number } {
  return {
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}
