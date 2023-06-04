<script setup lang="ts">
  import type { EventWithAuthor } from './../types'
  import RawData from './RawData.vue'
  import { nip19 } from 'nostr-tools'
  
  defineProps<{
    events: EventWithAuthor[]
    pubKey: string
    showImages: boolean
  }>()

  const emit = defineEmits(['toggleRawData'])

  const formatedDate = (date: number) => {
    return new Date(date * 1000).toLocaleString('default', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: 'numeric'
    })
  }

  const handleToggleRawData = (eventId: string) => {
    emit('toggleRawData', eventId)
  }

  const displayName = (author: any, pubkey: string) => {
    if (author) {
      if (author.nickname) {
        return author.nickname
      } else if (author.name) {
        return author.name
      } else {
        return author.display_name
      }
    } else {
      return nip19.npubEncode(pubkey).slice(0, 15) + '...'
    }
  }
</script>

<template>
  <div>
    <template v-for="({ id, kind, content, created_at, pubkey, tags, sig, author, showRawData, authorEvent }, i) in events">
      <div :class="['event', { 'event_custom': pubKey === pubkey }]">
        <div class="event__main-content">
          <div v-if="!showRawData" class="event__presentable-date">
            <div v-if="showImages && author" class="event-img">
              <img class="author-pic" :src="author.picture" alt="img" :title="`Avatar for ${ author.name }`">
            </div>
            <div class="event-content">
              <div class="event-header">
                <div>
                  <b>{{ displayName(author, pubkey) }}</b>
                </div>
                <div>
                  {{ formatedDate(created_at) }}
                </div>
              </div>
              <hr>
              <div class="content">
                {{ content?.slice(0, 150) }}
                {{ content?.length > 150 ? '...' : '' }}
              </div>
            </div>
          </div>
          <div :class="[{ 'event-details-first': i === 0 }]" v-if="showRawData">
            <RawData :event="{ id, kind, pubkey, created_at, content, tags, sig }" :authorEvent="authorEvent" :author="author" />
          </div>
          <div class="event-footer">
            <span @click="() => handleToggleRawData(id)" title="See raw data" class="event-footer-code">
              {...}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
  .event {
    border: 1px solid white;
    margin: 1rem 0;
  }

  .event_custom {
    border-color: #0092bf;
  }

  .event__main-content {
    padding: 14px;
  }

  .event__presentable-date {
    display: flex;
  }

  .event-img {
    margin-right: 12px;
  }

  .author-pic {
    width: 50px;
    height: 50px;
    min-width: 50px;
    min-height: 50px;
    border-radius: 50%;
  }

  .event-content {
    flex-grow: 1;
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    flex-direction: column;
  }

  @media (min-width: 768px) {
    .event-header {
      flex-direction: row;
    }
  }

  .content {
    word-break: break-word;
  }

  .highlight {
    overflow-y: hidden;
    font-size: 14px;
  }

  .event-footer {
    text-align: right;
  }

  .event-footer-code {
    cursor: pointer;
  }

  .event-details-first {
    margin-top: 30px;
  }

  @media (min-width: 1024px) {
    .event-details__tab {
      margin-right: 20px;
    }
  }

  .event-details__tab {
    cursor: pointer;
    margin-right: 6px;
    display: inline-block;
    color: #0092bf;
  }

  @media (min-width: 768px) {
    .event-details__tab {
      margin-right: 15px;
    }
  }

  .event-details__tab_active {
    text-decoration: underline;
  }

  .event-details__no-user {
    margin-top: 10px;
  }
</style>