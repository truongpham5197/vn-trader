/** Link dài hơn thắng — /signals/evidence không được sáng cùng /signals. */
export function navActive(path: string, href: string, hrefs: readonly string[]): boolean {
  if (href === "/") return path === "/";
  if (path !== href && !path.startsWith(`${href}/`)) return false;
  return !hrefs.some((h) => h !== href && h.length > href.length && (path === h || path.startsWith(`${h}/`)));
}

/**
 * Đổi cookie phiên xong phải tải lại document.
 * router.refresh() giữ cây layout cũ — bấm tab sau đó chồng menu và trang.
 */
export function navigationAfterSessionChange(): "reload" {
  return "reload";
}
