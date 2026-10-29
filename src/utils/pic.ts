/** 剥离 TVBox 源在图片地址后附加的 @Referer=xx@User-Agent=xx 参数段 */
export function cleanPicUrl(raw: string | undefined | null): string {
  if (!raw) return "";
  const s = raw.trim();
  const at = s.indexOf("@");
  if (at <= 0) return s;
  // 仅当 @ 后是键值参数（如 Referer=/User-Agent=）时剥离，避免误伤普通 URL
  if (/^@[A-Za-z-]+\s*=/.test(s.slice(at))) return s.slice(0, at);
  return s;
}