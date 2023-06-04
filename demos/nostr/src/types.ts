import type { Event } from 'nostr-tools';

export type Author = {
  name: string
  display_name: string
  picture: string
  about: string
  nickname: string
  nip05: string
}

export type EventWithAuthor = Event & {
  author: Author,
  authorEvent: Event,
  showRawData: boolean,
  rawDataActiveTab: number
}