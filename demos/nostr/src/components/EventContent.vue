<script setup lang="ts">
  import { onBeforeUpdate, ref } from 'vue'
  import { nip19, getPublicKey, getEventHash, signEvent, parseReferences } from 'nostr-tools'
  import { showImages } from './../store'
  import type { EventExtended } from './../types'
  import RawData from './RawData.vue'
  import EventActionsBar from './EventActionsBar.vue'
  import EventText from './EventText.vue'
  import { nsec } from './../store'

  const emit = defineEmits(['toggleRawData', 'showReplyField', 'sendReply', 'resetSentStatus'])
  const replyText = ref('')
  const msgErr = ref('')

  const props = defineProps<{
    event: EventExtended
    pubKey?: string
    index?: number
    hasReply?: boolean
    replyErr?: string
    isReplySent?: boolean
    isReplySentError?: boolean
  }>()

  const isShownReplyField = ref(false)
  const isPublishingReply = ref(false)

  const handleToggleRawData = (eventId: string) => {
    emit('toggleRawData', eventId)
  }

  const formatedDate = (date: number) => {
    return new Date(date * 1000).toLocaleString('default', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: 'numeric'
    })
  }

  onBeforeUpdate(() => {
    if (props.replyErr) {
      msgErr.value = props.replyErr
    }
    if (props.isReplySent) {
      isPublishingReply.value = false
      isShownReplyField.value = false
      replyText.value = ''
      emit('resetSentStatus')
    }
    if (props.isReplySentError) {
      isPublishingReply.value = false
      emit('resetSentStatus')
    }
  })

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

  const handleToggleReplyField = () => {
    isShownReplyField.value = !isShownReplyField.value
    emit('showReplyField')
  }

  const handleSendReply = () => {
    if (isPublishingReply.value) return

    const nsecValue = nsec.value ? nsec.value.trim() : ''
    if (!nsecValue.length) {
      msgErr.value = 'Please provide your private key or generate random key.'
      return;
    }

    const messageValue = replyText.value.trim()
    if (!messageValue.length) {
      msgErr.value = 'Please provide message to broadcast.'
      return;
    }

    let privKey: string;
    let pubKey: string
    try {
      const { data } = nip19.decode(nsecValue)
      privKey = data as string
      pubKey = getPublicKey(privKey)
    } catch (e) {
      msgErr.value = `Invalid private key. Please check it and try again.`
      return;
    }

    const event = {
      kind: 1,
      pubkey: pubKey,
      created_at: Math.floor(Date.now() / 1000),
      content: messageValue,
      tags: [],
      id: '',
      sig: ''
    }

    // keep all menitoned people and keep the thread chain from the event we are replying to
    const existedETags: any = []
    const existedPTags: any = []
    props.event.tags.forEach((tag) => {
      const tempTag = [tag[0], tag[1]]
      if (tag[2]) tempTag.push(tag[2])
      if (tag[3]) tempTag.push(tag[3])

      if (tempTag[0] === 'e') {
        existedETags.push(tempTag)
      } else if (tempTag[0] === 'p') {
        existedPTags.push(tempTag)
      }
    })

    // keep chain and add own e tag
    const eTagsForReply: any = []
    if (existedETags.length) {
      const root = existedETags.find((tag: any) => tag[3] === 'root')
      if (root) {
        eTagsForReply.push(root)
      } else {
        eTagsForReply.push(existedETags[0])
      }
      eTagsForReply.push(['e', props.event.id, '', 'reply'])
    } else {
      eTagsForReply.push(['e', props.event.id, '', 'root'])
    }

    // keep all mentioned people and add own from message if presented
    const msgReferences = parseReferences(event)
    const existedPubKeys = existedPTags.map((tag: any) => tag[1])
    const pTagsFromOurMsg: any = []
    msgReferences.forEach((ref) => {
      const refPubkey = ref?.profile?.pubkey
      if (refPubkey && !existedPubKeys.includes(refPubkey)) {
        pTagsFromOurMsg.push(['p', refPubkey])
        existedPubKeys.push(refPubkey)
      }
    })

    // add author pubkey from event we are replying to
    const pTagsForReply = [...pTagsFromOurMsg, ...existedPTags]
    if (!existedPubKeys.includes(props.event.pubkey)) {
      pTagsForReply.push(['p', props.event.pubkey])
    }
    
    // gather all tags together and sign message
    event.tags = [...pTagsForReply, ...eTagsForReply] as never[]
    event.id = getEventHash(event)
    event.sig = signEvent(event, privKey)

    msgErr.value = ''
    isPublishingReply.value = true

    emit('sendReply', event)
  }
</script>

<template>
  <div :class="['event__main-content', { 'event__main-content_custom': pubKey === event.pubkey }]">
    <div v-if="!event.showRawData" class="event__presentable-date">
      <div v-if="showImages.value && event.author" class="event-img">
        <img class="author-pic" :src="event.author.picture" alt="img" :title="`Avatar for ${event.author.name}`">
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
        <EventText :event="event" :slice="150" />
    
        <div class="event-footer">
          <EventActionsBar :hasReply="hasReply" @showReplyField="handleToggleReplyField" :likes="event.likes" :reposts="0" />
          <span @click="() => handleToggleRawData(event.id)" title="See raw data" class="event-footer-code">
            {...}
          </span>
        </div>
      </div>
    </div>
    <div :class="[{ 'event-details-first': index === 0 }]" v-if="event.showRawData">
      <RawData :event="event" :authorEvent="event.authorEvent" :author="event.author" />
      <div class="event-footer-code-wrapper">
        <span @click="() => handleToggleRawData(event.id)" title="See raw data" class="event-footer-code">
          {...}
        </span>
      </div>
    </div>
  </div>
  <div v-if="isShownReplyField" class="reply-field">
    <textarea v-model="replyText" rows="4" class="reply-field__textarea" placeholder="Write a reply..."></textarea>
    <div class="reply-field__actions">
      <div class="reply-field__error">{{ msgErr }}</div>
      <button @click="handleSendReply" class="reply-field__btn">
        {{ isPublishingReply ? 'Sending reply...' : 'Reply' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
  .event__main-content {
    border: 1px solid white;
    padding: 14px;
  }

  .event__main-content_custom {
    border-color: #0092bf;
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

  .reply-field__textarea {
    width: 100%;
    box-sizing: border-box;
    margin-top: 10px;
  }

  .reply-field__actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .reply-field__btn {
    cursor: pointer;
  }

  .reply-field__error {
    color: red;
    font-size: 16px;
    flex-grow: 1;
    text-align: right;
    margin-right: 10px;
  }
</style>