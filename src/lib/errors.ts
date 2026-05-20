const getObjectValue = (value: unknown, key: string) =>
  value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;

const stringifyDetail = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
};

export const formatError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return stringifyDetail(error) ?? "Unknown error";
  }

  const details = [error.message];
  const cause = getObjectValue(error, "cause");

  if (cause instanceof Error) {
    details.push(`cause: ${cause.message}`);
    const causeCode = stringifyDetail(getObjectValue(cause, "code"));

    if (causeCode) {
      details.push(`code: ${causeCode}`);
    }
  } else if (cause) {
    const causeMessage =
      stringifyDetail(getObjectValue(cause, "message")) ??
      stringifyDetail(cause);
    const causeCode = stringifyDetail(getObjectValue(cause, "code"));

    if (causeMessage) {
      details.push(`cause: ${causeMessage}`);
    }

    if (causeCode) {
      details.push(`code: ${causeCode}`);
    }
  }

  return details.join(" | ");
};
