import "server-only";

export function redactSensitiveText(value: string) {
  return value
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[手机号已隐藏]")
    .replace(/(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?!\d)/g, "[身份证号已隐藏]")
    .replace(/((?:保单号|合同号|保单编号)\s*[:：]?\s*)[A-Za-z0-9-]{6,}/gi, "$1[保单号已隐藏]");
}

export function safeAiErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return redactSensitiveText(message).slice(0, 500);
}
