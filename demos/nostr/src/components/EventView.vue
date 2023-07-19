<script setup lang="ts">
  import {nextTick, onMounted, onUpdated, ref } from 'vue'
  import type { EventExtended } from './../types'
  import EventContent from './EventContent.vue'
  import ExpandArrow from './../icons/ExpandArrow.vue'

  import {
    nip10,
    SimplePool
  } from 'nostr-tools'
  import { 
    injectLikesToNotes, 
    injectRepostsToNotes, 
    injectReferencesToNotes,
    injectAuthorsToNotes
  } from './../utils'

  const emit = defineEmits(['toggleRawData'])
  const replyErr = ref('')

  const props = defineProps<{
    event: EventExtended
    pubKey?: string
    index?: number
    currentRelays?: string[]
    showReplies?: boolean
  }>()

  const showReplyField = ref(false)
  const showMoreRepliesBtn = ref(false)
  const showAllReplies = ref(false)
  const isLoadingThread = ref(false)
  const isLoadingFirstReply = ref(false)
  const isReplySent = ref(false)
  const isReplySentError = ref(false)
  
  const pool = new SimplePool({ getTimeout: 5600 })
  const replyEvent = ref<EventExtended | null>(null)
  const eventReplies = ref<EventExtended[]>([])

  onMounted(async () => {
    if (props.showReplies) {
      await loadRepliesPreiew()
    }
  })

  const loadRepliesPreiew = async () => {
    const { event, currentRelays } = props
    if (!currentRelays) return
    let replies = await pool.list(currentRelays, [{ kinds: [1], '#e': [event.id] }])

    // filter first level replies
    replies = replies.filter((reply) => {
      const nip10Data = nip10.parse(reply)
      return !nip10Data.reply && nip10Data?.root?.id === event.id
    })

    if (!replies.length) return

    isLoadingFirstReply.value = true
    showMoreRepliesBtn.value = replies.length > 1
    let reply = replies[0] as EventExtended

    let tempReplies = await injectLikesToNotes([reply], currentRelays)
    tempReplies = await injectRepostsToNotes(tempReplies, currentRelays)
    tempReplies = await injectReferencesToNotes(tempReplies, currentRelays, pool)

    reply = tempReplies[0] as EventExtended
    const authorMeta = await pool.get(currentRelays, { kinds: [0], limit: 1, authors: [reply.pubkey] })
    if (authorMeta) {
      reply.author = JSON.parse(authorMeta.content)
    }

    isLoadingFirstReply.value = false
    replyEvent.value = reply
  }

  const handleToggleRawData = (eventId: string, isRootEvent = false) => {
    if (isRootEvent) {
      return emit('toggleRawData', eventId)
    }

    if (showAllReplies.value) {
      const event = eventReplies.value.find(e => e.id === eventId)
      if (event) {
        event.showRawData = !event.showRawData
      }
      return
    }
    
    if (eventId === replyEvent?.value?.id) {
      replyEvent.value.showRawData = !replyEvent.value.showRawData
    }
  }

  const handleToggleReplyField = () => {
    showReplyField.value = !showReplyField.value
  }

  const handleLoadMoreReplies = async () => {
    const { event, currentRelays } = props
    if (!currentRelays) return

    isLoadingThread.value = true
    let replies = await pool.list(currentRelays, [{ kinds: [1], '#e': [event.id] }])

    replies = replies.filter((reply) => {
      const nip10Data = nip10.parse(reply)
      return !nip10Data.reply && nip10Data?.root?.id === event.id
    })

    if (replies.length) {
      const authors = replies.map((e: any) => e.pubkey)
      const uniqueAuthors = [...new Set(authors)]
      const authorsEvents = await pool.list(currentRelays, [{ kinds: [0], authors: uniqueAuthors }])
  
      replies = await injectAuthorsToNotes(replies, authorsEvents)
      replies = await injectLikesToNotes(replies, currentRelays)
      replies = await injectRepostsToNotes(replies, currentRelays)
      replies = await injectReferencesToNotes(replies, currentRelays, pool)
    }

    eventReplies.value = replies as EventExtended[]
    showAllReplies.value = true
    isLoadingThread.value = false
  }

  const handleSendReply = (event: EventExtended) => {
    const { currentRelays } = props
    if (!currentRelays) return
    
    const pub = pool.publish(currentRelays, event)

    pub.on('ok', async () => {
      replyErr.value = ''
      await nextTick()
      isReplySent.value = true
      isReplySentError.value = false
      showReplyField.value = false
      loadRepliesPreiew()
    })
    pub.on('failed', (reason: string) => {
      replyErr.value = 'Failed to broadcast event'
      isReplySent.value = false
      isReplySentError.value = true
      console.log('failed to broadcast event', reason)
    })
  }

  const resetSentStatus = () => {
    isReplySent.value = false
    isReplySentError.value = false
  }
</script>

<template>
  <div class="event">
    <EventContent 
      @sendReply="handleSendReply" 
      @showReplyField="handleToggleReplyField" 
      @toggleRawData="(eventId) => handleToggleRawData(eventId, true)" 
      @resetSentStatus="resetSentStatus"
      :event="(event as EventExtended)" 
      :replyErr="replyErr" 
      :hasReply="showReplies" 
      :pubKey="pubKey"
      :isReplySent="isReplySent"
    />
    <div v-if="isLoadingFirstReply">Loading replies...</div>

    <div v-if="showReplies && replyEvent" class="replies">
      <div @click="handleLoadMoreReplies" v-if="!showAllReplies && showMoreRepliesBtn && !isLoadingThread" class="replies__other">
        <span class="replies__other-link">
          <span class="replies__other-text">
            Show other replies
          </span>
          <ExpandArrow />
        </span>
      </div>
      <div v-if="isLoadingThread" class="replies__other">
        Loading replies...
      </div>

      <div v-if="showAllReplies && showMoreRepliesBtn" class="replies__other">
        <span class="replies__other-text">
          Loaded {{ eventReplies.length }} replies
        </span>
      </div>

      <div :class="[
        'line-vertical', { 
          'line-vertical_long': showMoreRepliesBtn, 
          'line-vertical_reply-field': showReplyField && !showMoreRepliesBtn, 
          'line-vertical_reply-field_long': showReplyField && showMoreRepliesBtn 
        }]">
      </div>
      <div v-if="!showAllReplies" :class="['line-horizontal', { 'line-horizontal_height': showMoreRepliesBtn }]"></div>

      <div v-if="!showAllReplies">
        <EventContent @toggleRawData="handleToggleRawData" :event="(replyEvent as EventExtended)" />
      </div>

      <div v-if="showAllReplies" class="replies__list">
        <div class="replies__list-item" v-for="(reply, i) in eventReplies">
          <div class="replies__list-item-line-horizontal"></div>
          <div :class="['replies__list-item-line-vertical', { 'replies__list-item-line-vertical_short': i === (eventReplies.length - 1) }]"></div>
          <EventContent @toggleRawData="handleToggleRawData" :event="(reply as EventExtended)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .line-vertical {
    position: absolute;
    left: -38px;
    top: -15px;
    width: 1px;
    height: 54px;
    background-color: white;
  }

  .line-vertical_long {
    height: 95px;
  }

  .line-vertical_reply-field {
    top: -50px;
    height: 88px;
  }

  .line-vertical_reply-field_long {
    top: -50px;
    height: 130px;
  }

  .line-horizontal {
    position: absolute;
    left: -38px;
    top: 38px;
    height: 1px;
    width: 38px;
    background-color: white;
  }

  .line-horizontal_height {
    top: 80px;
  }

  .event {
    margin: 1rem 0;
    margin-bottom: 15px;
  }
  .replies {
    position: relative;
    margin-left: 76px;
    margin-top: 15px;
    margin-bottom: 20px;
  }

  .replies__other {
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .replies__other-link {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .replies__other-link:hover {
    text-decoration: underline;
  }

  .replies__other-text {
    margin-right: 5px;
  }

  .replies__list-item {
    position: relative;
    margin-bottom: 15px;
  }

  .replies__list-item-line-horizontal {
    position: absolute;
    left: -38px;
    top: 38px;
    height: 1px;
    width: 38px;
    background-color: white;
  }

  .replies__list-item-line-vertical {
    position: absolute;
    left: -38px;
    top: 0;
    width: 1px;
    height: calc(100% + 15px);
    background-color: white;
  }

  .replies__list-item-line-vertical_short {
    height: 38px;
  }
</style>