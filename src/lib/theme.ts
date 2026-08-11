'use client'

/**
 * Two states of the same document: NEGATIVE (bone on ink, the default) and
 * PRINT (ink on bone, the reference sheets). The palette lives entirely in
 * CSS custom properties, so the swap is one attribute on <html>; this module
 * exists for the pieces CSS cannot reach — the WebGL scenes — and for
 * persistence.
 */

import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'oo-theme'
const EVENT = 'oo-theme'

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private mode — the toggle still works for the session */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** The current theme, live — canvases re-render their colours through this. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const read = () => setTheme(readTheme())
    read()
    window.addEventListener(EVENT, read)
    return () => window.removeEventListener(EVENT, read)
  }, [])

  return theme
}

/**
 * Inlined before paint so a saved light theme never flashes dark.
 *
 * `?theme=light` (or `dark`) overrides the saved value for that load without
 * writing to it — same family as `?only=` and `?hold=`. It exists because a
 * command-line browser cannot reach localStorage, which makes it the only way
 * to capture the print theme for a screenshot or a shared PDF.
 */
export const THEME_BOOT =
  `try{var q=new URLSearchParams(location.search).get('theme');` +
  `var t=q==='light'||q==='dark'?q:localStorage.getItem('${KEY}');` +
  `if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`
