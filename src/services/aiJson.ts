export function extractJsonObject(raw: string): unknown {
  const trimmed = (raw || "").trim();
  if (!trimmed) throw new Error("AI không trả về nội dung");

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] || trimmed).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI không trả về JSON hợp lệ");

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("AI không trả về JSON hợp lệ");
  }
}
