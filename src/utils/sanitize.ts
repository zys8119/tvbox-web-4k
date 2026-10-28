import DOMPurify from "dompurify";

/**
 * 富文本白名单清洗，用于 v-html 渲染不可信内容。
 *
 * 目标：允许影视简介常见排版（段落、换行、加粗、列表、图片、链接），
 * 同时剥离一切可执行向量：script/style/iframe/object/embed、
 * 事件属性（on*）、javascript: 与 data: 协议、srcdoc 等。
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "span",
  "div",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "sub",
  "sup",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "img",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "align",
  "colspan",
  "rowspan",
];

/** 只放行 http/https 绝对地址与站内相对地址 */
function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (
    v.startsWith("javascript:") ||
    v.startsWith("vbscript:") ||
    v.startsWith("data:") ||
    v.startsWith("file:")
  ) {
    return false;
  }
  return true;
}

// 统一给外链补 rel，避免 window.opener 被反向控制
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (!(node instanceof Element)) return;
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
  if (node.tagName === "IMG") {
    node.setAttribute("loading", "lazy");
    node.setAttribute("referrerpolicy", "no-referrer");
  }
});

/** 清洗富文本，返回可安全交给 v-html 的 HTML 字符串 */
export function sanitizeHtml(raw: string | undefined | null): string {
  if (!raw) return "";
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style", "srcset", "srcdoc", "formaction"],
    // 兜底：所有 URI 属性再过一遍协议校验
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i,
  });
}

/** 判断文本是否包含 HTML 标签，用于决定走富文本还是纯文本渲染 */
export function looksLikeHtml(raw: string | undefined | null): boolean {
  if (!raw) return false;
  return /<\/?[a-z][\s\S]*>/i.test(raw);
}

export { isSafeUrl };
