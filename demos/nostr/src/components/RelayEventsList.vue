<script setup lang="ts">
  import type { EventExtended } from './../types'
  import RawData from './RawData.vue'
  import { nip19 } from 'nostr-tools'
  import EventActionsBar from './EventActionsBar.vue'
  import EventContent from './EventContent.vue'
  
  defineProps<{
    events: EventExtended[]
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
    <template v-for="(event, i) in events">
      <div :class="['event', { 'event_custom': pubKey === event.pubkey }]">
        <div class="event__main-content">
          <div v-if="!event.showRawData" class="event__presentable-date">
            <div v-if="showImages && event.author" class="event-img">
              <img class="author-pic" :src="event.author.picture" alt="img" :title="`Avatar for ${ event.author.name }`">
            </div>
            <div class="event-content">
              <div class="event-header">
                <div>
                  <b>{{ displayName(event.author, event.pubkey) }}</b>
                </div>
                <div>
                  {{ formatedDate(event.created_at) }}
                </div>
              </div>
              <hr>
              <div class="content">
                <EventContent :event="event" :slice="150" />
              </div>
              <div class="event-footer">
                <EventActionsBar :likes="event.likes" :reposts="0" />
                <span @click="() => handleToggleRawData(event.id)" title="See raw data" class="event-footer-code">
                  {...}
                </span>
              </div>
            </div>
          </div>
          <div :class="[{ 'event-details-first': i === 0 }]" v-if="event.showRawData">
            <RawData :event="event" :authorEvent="event.authorEvent" :author="event.author" />
            <div class="event-footer-code-wrapper">
              <span @click="() => handleToggleRawData(event.id)" title="See raw data" class="event-footer-code">
                {...}
              </span>
            </div>
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
    margin-top: 10px;
    display: flex;
    justify-content: space-between;
  }

  .event-footer-code {
    cursor: pointer;
  }

  .event-footer-code-wrapper {
    text-align: right;
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