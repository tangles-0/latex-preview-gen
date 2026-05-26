import { getIncomingApiSecret } from "@/lib/env";

export const isAuthorizedIncomingRequest = (
  authorizationHeader: string | null,
) => {
  const secret = getIncomingApiSecret();

  if (!secret) {
    return false;
  }

  return (
    authorizationHeader === secret || authorizationHeader === `Bearer ${secret}`
  );
};
