// A tiny DOM helper. No framework: the interface is a handful of sheets and a queue, and a
// framework would add more to the first payload than the whole game logic does.

export type Child = Node | string | number | null | undefined | false | Child[]

export function h(tag: string, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = String(v)
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    else if (k === 'html') el.innerHTML = String(v)
    else el.setAttribute(k, String(v))
  }
  append(el, children)
  return el
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    if (Array.isArray(c)) append(el, c)
    else if (c instanceof Node) el.appendChild(c)
    else el.appendChild(document.createTextNode(String(c)))
  }
}

export function clear(el: Element) { while (el.firstChild) el.removeChild(el.firstChild) }

export function button(label: Child, onTap: () => void, cls = ''): HTMLElement {
  return h('button', { class: 'btn ' + cls, onClick: onTap, type: 'button' }, label)
}

export function row(...children: Child[]): HTMLElement { return h('div', { class: 'row' }, ...children) }

export function muted(text: Child): HTMLElement { return h('span', { class: 'muted' }, text) }

export function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function signed(n: number): string { return (n > 0 ? '+' : '') + fmt(n) }

export function plural(n: number, one: string, many = one + 's'): string { return `${n} ${n === 1 ? one : many}` }
