export function normalizeChatMessage(value, maximumLength = 500) {
  const message = String(value ?? "").trim();
  if (!message) throw new Error("Enter a message");
  if (message.length > maximumLength) {
    throw new Error(`Messages can be up to ${maximumLength} characters`);
  }
  return message;
}
