export const updateUrlHash = (hash: string) => {
  window.location.hash = hash
}

export const updateUrlUser = (npub: string) => {
  window.location.hash = `#?user=${npub}`
}