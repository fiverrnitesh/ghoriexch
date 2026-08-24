import type { ApiResponse } from '@games/shared';

export function successResponse<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return { success: true, data, meta };
}

export function errorResponse(code: string, message: string, details?: unknown): ApiResponse {
  return { success: false, error: { code, message, details } };
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
