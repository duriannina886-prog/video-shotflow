/** 按鼠标落在哪个字上，精确得到插入下标（字的左半边=该字前，右半边=该字后） */
export function caretIndexFromPointInEditable(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let fallback = 0;

  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.data;
    for (let i = 0; i < text.length; i++) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const onLine = clientY >= rect.top - 6 && clientY <= rect.bottom + 6;
      if (onLine) fallback = offset + i + (clientX >= rect.left ? 1 : 0);

      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        const after = clientX >= (rect.left + rect.right) / 2;
        return offset + i + (after ? 1 : 0);
      }
    }
    offset += text.length;
    node = walker.nextNode() as Text | null;
  }

  return fallback;
}

/** 提示词第 index 个字符处的插入线（相对 root 的坐标） */
export function caretRectRelativeToRoot(
  root: HTMLElement,
  index: number,
): { left: number; top: number; height: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node = walker.nextNode() as Text | null;
  const rootRect = root.getBoundingClientRect();

  while (node) {
    const len = node.data.length;
    if (index <= offset + len) {
      const local = Math.max(0, Math.min(index - offset, len));
      const range = document.createRange();
      if (local < len) {
        range.setStart(node, local);
        range.setEnd(node, local + 1);
        const rect = range.getBoundingClientRect();
        if (rect.height === 0) break;
        return {
          left: rect.left - rootRect.left + root.scrollLeft,
          top: rect.top - rootRect.top + root.scrollTop,
          height: rect.height,
        };
      }
      if (local > 0) {
        range.setStart(node, local - 1);
        range.setEnd(node, local);
        const rect = range.getBoundingClientRect();
        if (rect.height === 0) break;
        return {
          left: rect.right - rootRect.left + root.scrollLeft,
          top: rect.top - rootRect.top + root.scrollTop,
          height: rect.height,
        };
      }
    }
    offset += len;
    node = walker.nextNode() as Text | null;
  }
  return null;
}
