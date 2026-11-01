/**
 * Set on <html> by the layout's head script, before paint, when the browser holds a session: the
 * public home page that the server sends at the app's address then stays hidden while the app
 * loads (`globals.css`).
 */
export const SESSION_CLASS = 'bb-session'

/** The head script: the session key is `remote.ts`'s `brandbase.session`. */
export const SESSION_SCRIPT = `try{if(localStorage.getItem('brandbase.session'))document.documentElement.classList.add('${SESSION_CLASS}')}catch(e){}`
