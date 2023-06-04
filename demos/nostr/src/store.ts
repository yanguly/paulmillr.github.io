import { reactive } from 'vue'
import type { Event } from 'nostr-tools'
import type { Author } from './types'

export const userNotesEvents = reactive({
  value: <Event[]>([]),
  update(events: Event[]) {
    this.value = events
  }
})

export const userEvent = reactive({
  value: <Event>{},
  update(event: Event) {
    this.value = event
  }
})

export const userDetails = reactive({
  value: <Author>{},
  update(details: Author) {
    this.value = details
  }
})

export const showImageAtUserInfo = reactive({
  value: false,
  update(show: boolean) {
    this.value = show
  }
})

export const initialUrlNpub = reactive({
  value: '',
  update(npub: string) {
    this.value = npub
  }
})

export const cachedUrlNpub = reactive({
  value: '',
  update(npub: string) {
    this.value = npub
  }
})

export const cachedNpub = reactive({
  value: '',
  update(npub: string) {
    this.value = npub
  }
})

export const cachedNsec = reactive({
  value: '',
  update(nsec: string) {
    this.value = nsec
  }
})

export const isUserHasValidNip05 = reactive({
  value: false,
  update(isValid: boolean) {
    this.value = isValid
  }
})