import { authErrorToResponse } from '@/lib/auth';
import { InvitationServiceError } from '@/lib/services/invitation';

export function invitationErrorToResponse(error: unknown): Response {
  if (error instanceof InvitationServiceError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return authErrorToResponse(error);
}
