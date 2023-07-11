<script setup lang="ts">
  import { onMounted, ref, onUnmounted, computed, type Events } from 'vue'
  import {
    nip19,
    getPublicKey,
    SimplePool,
    nip05,
    type Relay,
    type Event
  } from 'nostr-tools'

  import {
    userNotesEvents,
    userEvent,
    userDetails,
    cachedNpub,
    initialUrlNpub,
    cachedUrlNpub,
    nsec,
    isUserHasValidNip05,
    isUsingFallbackSearch,
    npub
  } from './../store'
  import UserEvent from './UserEvent.vue'
  import DownloadIcon from './../icons/DownloadIcon.vue'
  import type { Author, EventExtended } from './../types'
  import { fallbackRelays } from './../app'
  import EventContent from './EventContent.vue'
  import { updateUrlUser } from './../utils'

  const props = defineProps<{
    currentRelay: Relay
    showImages: boolean
    handleRelayConnect: Function
    injectLikesToNotes: Function
    injectRepostsToNotes: Function
    injectReferencesToNotes: Function
  }>()

  const pubKeyError = ref('')
  const showNotFoundError = ref(false)
  const pubHex = ref('')
  const showLoadingUser = ref(false)
  const notFoundFallbackError = ref('')
  const isLoadingFallback = ref(false)
  const showLoadingTextNotes = ref(false)
  const isAutoConnectOnSearch = ref(false)
  
  const nip05toURL = (identifier: string) => {
    const [name, domain] = identifier.split('@')
    return `https://${domain}/.well-known/nostr.json?name=${name}`
  }

  onMounted(() => {
    // first mount when npub presented in url, run only once 
    if (initialUrlNpub.value?.length && !cachedNpub.value.length) {
      npub.update(initialUrlNpub.value)
      cachedUrlNpub.update(npub.value)
      initialUrlNpub.update('') // prevent re-run of this condition again
      isAutoConnectOnSearch.value = true
      return
    }

    if (cachedNpub.value.length) {
      npub.update(cachedNpub.value)
      return
    }
  })

  onUnmounted(() => {
    cachedNpub.update(npub.value)
  })

  const handleInputNpub = () => {
    notFoundFallbackError.value = ''
    showNotFoundError.value = false
  }

  const handleGetUserInfo = async () => {
    const npubVal = npub.value.trim()
    const nsecVal = nsec.value.trim()

    if (!npubVal.length) {
      pubKeyError.value = 'Public key is required.'
      if (nsecVal.length) {
        pubKeyError.value += ' Please check your private key, it seems to be invalid if you want to generate public key from private.'
      }
      return
    }

    try {
      let { data } = nip19.decode(npubVal)
      pubHex.value = data.toString()
    } catch (e) {
      pubKeyError.value = 'Public key is invalid. Please check it and try again.'
      return
    }

    let relay: Relay
    if (isAutoConnectOnSearch.value) {
      relay = await props.handleRelayConnect()
    } else {
      relay = props.currentRelay
    }
    
    if (!relay || relay.status !== 1) {
      pubKeyError.value = isAutoConnectOnSearch.value
        ? 'Connection error, try to connect again or try to choose other relay.' 
        : 'Please connect to relay first.'
      return;
    }
    isAutoConnectOnSearch.value = false

    userEvent.update({} as Event)
    userDetails.update({} as Author)
    userNotesEvents.update([] as EventExtended[])
    isUsingFallbackSearch.update(false)

    pubKeyError.value = ''
    showLoadingUser.value = true

    const authorMeta = await relay.get({ kinds: [0], limit: 1, authors: [pubHex.value] })
    if (!authorMeta) {
      showLoadingUser.value = false
      showNotFoundError.value = true
      return
    }
    
    const authorContacts = await relay.get({ kinds: [3], limit: 1, authors: [pubHex.value] })
    
    userEvent.update(authorMeta)
    userDetails.update(JSON.parse(authorMeta.content))
    userDetails.updateFollowingCount(authorContacts?.tags.length || 0)

    isUserHasValidNip05.update(false)
    showLoadingUser.value = false
    showNotFoundError.value = false

    // routing
    updateUrlUser(npubVal)
    cachedUrlNpub.update(npubVal)

    showLoadingTextNotes.value = true

    checkAndShowNip05()

    let notesEvents = await relay.list([{ kinds: [1], authors: [pubHex.value] }]) as EventExtended[]
    notesEvents = await props.injectLikesToNotes(notesEvents)
    notesEvents = await props.injectRepostsToNotes(notesEvents)
    notesEvents = await props.injectReferencesToNotes(notesEvents)
    
    userNotesEvents.update(notesEvents as EventExtended[])
    showLoadingTextNotes.value = false
  }

  const checkAndShowNip05 = async () => {
    const nip05Identifier = userDetails.value.nip05
    const userPubkey = userEvent.value.pubkey
    if (!nip05Identifier || !userPubkey) return
    try {
      const validNip = await isValidNip05(nip05Identifier, userPubkey)
      isUserHasValidNip05.update(validNip)
    } catch (e) {
      console.log('Failed to check nip05')
    }
  }

  const isValidNip05 = async (identifier: string, metaEventPubkey: string) => {
    const profile = await nip05.queryProfile(identifier)
    return metaEventPubkey === profile?.pubkey
  }

  // not used yet
  const getNip05Relays = async (identifier: string, metaEventPubkey: string) => {
    const profile = await nip05.queryProfile(identifier)
    if (metaEventPubkey !== profile?.pubkey) return []
    return profile.relays
  }

  // WIP (not used yet)
  const getNip65Relays = async () => {
    const relay = props.currentRelay
    const events = await relay.list([{ kinds: [10002], authors: [pubHex.value], limit: 1 }])
    if (!events.length) return []
    const event = events[0]
    // TDOD: extract relays from event
  }

  const handleGeneratePublicFromPrivate = () => {
    const nsecVal = nsec.value.trim()
    if (!nsecVal.length) {
      pubKeyError.value = 'Please provide private key first.'
      return
    }

    const isHex = nsecVal.indexOf('nsec') === -1

    try {
      const privKeyHex = isHex ? nsecVal : nip19.decode(nsecVal).data.toString()
      const pubKey = getPublicKey(privKeyHex)
      npub.update(nip19.npubEncode(pubKey))
      pubKeyError.value = ''
    } catch (e) {
      pubKeyError.value = 'Private key is invalid. Please check it and try again.'
      return
    }
  }

  const handleSearchFallback = async () => {
    const npubVal = npub.value.trim()
    try {
      let { data } = nip19.decode(npubVal)
      pubHex.value = data.toString()
    } catch (e) {
      notFoundFallbackError.value = 'Something went wrong. Please check public key and try again.'
      return
    }

    isLoadingFallback.value = true
    const pool = new SimplePool({ getTimeout: 5600 })
    const authorMeta = await pool.get(fallbackRelays, { kinds: [0], limit: 1, authors: [pubHex.value] })
    
    if (!authorMeta) {
      isLoadingFallback.value = false
      notFoundFallbackError.value = 'User was not found on listed relays.'
      return
    }

    const authorContacts = await pool.get(fallbackRelays, { kinds: [3], limit: 1, authors: [pubHex.value] })
    
    userEvent.update(authorMeta)
    userDetails.update(JSON.parse(authorMeta.content))
    userDetails.updateFollowingCount(authorContacts?.tags.length || 0)
    
    notFoundFallbackError.value = ''
    isLoadingFallback.value = false
    showNotFoundError.value = false

    isUsingFallbackSearch.update(true)
    isUserHasValidNip05.update(false)

    // routing
    updateUrlUser(npubVal)
    cachedUrlNpub.update(npubVal)

    showLoadingTextNotes.value = true

    checkAndShowNip05()

    let notesEvents = await pool.list(fallbackRelays, [{ kinds: [1], authors: [pubHex.value] }])
    notesEvents = await props.injectLikesToNotes(notesEvents, fallbackRelays)
    notesEvents = await props.injectRepostsToNotes(notesEvents, fallbackRelays)
    notesEvents = await props.injectReferencesToNotes(notesEvents, fallbackRelays)

    userNotesEvents.update(notesEvents as EventExtended[])
    showLoadingTextNotes.value = false
  }

  const handleLoadUserFollowers = async () => {   
    const isFallback = isUsingFallbackSearch.value
    const pool = new SimplePool({ getTimeout: 5600 })
    const relays = isFallback ? fallbackRelays : [props.currentRelay.url]

    const sub = await pool.sub(relays, [{ 
      "#p": [pubHex.value],
      kinds: [3], 
    }])

    userDetails.updateFollowersCount(0)
    sub.on('event', () => {
      userDetails.updateFollowersCount(userDetails.value.followersCount + 1)
    })
  }
</script>

<template>
  <div class="field">
    <label class="field-label" for="user_public_key">
      <strong>Profile's public key</strong>
      <button @click="handleGeneratePublicFromPrivate" class="random-key-btn">Use mine</button>
    </label>
    <div class="field-elements">
      <input @input="handleInputNpub" v-model="npub.value" class="pubkey-input" id="user_public_key" type="text" placeholder="npub..." />
      <button @click="handleGetUserInfo" class="get-user-btn">
        {{ isAutoConnectOnSearch ? 'Connect & Search' : 'Search' }}
      </button>
    </div>
    <div class="error">
      {{ pubKeyError }}
    </div>
  </div>

  <div class="loading-notice" v-if="showLoadingUser">
    Loading user info...
  </div>

  <UserEvent
    v-if="userEvent.value.id"
    :authorEvent="userEvent.value"
    :author="userDetails.value"
    :isUserProfile="true"
    :event="(userEvent.value as EventExtended)"
  >
    <div class="user">
      <div v-if="props.showImages" class="user__avatar-wrapper">
        <img class="user__avatar" :src="userDetails.value.picture">
      </div>
      <div class="user__info">
        <div>
          <div class="user__nickname">
            {{ userDetails.value.nickname || userDetails.value.name }}
          </div>
          <div class="user__name">
            {{ userDetails.value.display_name || '' }}
          </div>
          <div class="user__desc">
            {{ userDetails.value.about || '' }}
          </div>
          <div v-if="isUserHasValidNip05.value" class="user__nip05">
            <a target="_blank" :href="nip05toURL(userDetails.value.nip05)">
              <strong>nip05</strong>: {{ userDetails.value.nip05 }}
            </a>
          </div>
          <div v-if="userDetails.value.followingCount >= 0" class="user__contacts">
            <span class="user__contacts-col user__following-cnt">
              <b>{{ userDetails.value.followingCount }}</b> Following
            </span>
            <span class="user__contacts-col user__followers-cnt">
              <b v-if="userDetails.value.followersCount">
                {{ userDetails.value.followersCount }}
              </b>
              <span v-else class="user__contacts-download-icon">
                <DownloadIcon @click="handleLoadUserFollowers" />
              </span>
              <span class="user__contacts-followers-word">
                Followers
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </UserEvent>

  <div v-if="showLoadingTextNotes">Loading user notes...</div>
  <h3 v-if="userNotesEvents.value.length > 0 && !showLoadingTextNotes">User notes</h3>

  <template v-for="event in userNotesEvents.value">
    <UserEvent :event="event" :authorEvent="userEvent.value" :author="userDetails.value" :isUserProfile="false">
      <div class="event-text-note">
        <EventContent :event="event" />
      </div>
    </UserEvent>
  </template>

  <div class="not-found" v-if="showNotFoundError">
    <div class="not-found__desc">
      User was not found on selected relay. 
      Please try to connect to another one or you can try to load info about this user from the list of popular relays:
    </div>
    <div>
      <button @click="handleSearchFallback" class="fallback-search-btn">
        Search in all listed relays
      </button>
      <div :class="['not-found__status', {'error': notFoundFallbackError.length}]">
        {{ notFoundFallbackError }}
        {{ isLoadingFallback ? 'Searching...' : '' }}
      </div>
      <ul>
        <li v-for="relay in fallbackRelays">
          {{ relay }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
  .pubkey-desc {
    margin-bottom: 10px;
  }

  .event__header {
    margin-bottom: 15px;
  }

  .header-title {
    margin-right: 10px;
  }
  .code-wrapper {
    display: inline-flex;
    align-items: center;
  }
  .code-wrapper button {
    margin-left: 10px;
    font-size: 14px;
  }
  .col {
    padding: 4px 0;
  }

  .header-col {
    text-align: right;
    width: 81px;
  }

  .content-col {
    padding-left: 10px;
  }

  .text-right {
    text-align: right;
  }

  .btn-field {
    display: flex;
    align-items: center;
    position: relative;
  }

  .btn-field__label {
    margin-right: 10px;
  }

  .btn-field__input {
    flex-grow: 1;
    background: transparent;
    padding: 10px 12px;
    border: 1px solid white;
    font-size: 1.125rem;
    color: #ddd;
    font-weight: normal;
    font-family: 'PT Mono', 'Menlo', monospace;
    padding-right: 80px;
  }

  .btn-field__input_small {
    padding-right: 59px;
  }

  .btn-field__btn {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
  }

  .check-btn {
    width: 60px;
  }

  .event {
    border: 1px solid;
    padding: 14px;
    margin-top: 25px;
  }

  .user {
    display: flex;
    margin: 18px 0;
    flex-direction: column;
  }

  @media (min-width: 576px) {
    .user {
      flex-direction: row;
    }
  }

  .user__avatar-wrapper {
    display: flex;
    align-items: center;
    margin-bottom: 5px;
    justify-content: center;
  }

  @media (min-width: 576px) {
    .user__avatar-wrapper {
      margin-right: 15px;
      margin-bottom: 0;
      justify-content: left;
    }
  }

  .user__avatar {
    width: 120px;
    height: 120px;
  }

  @media (min-width: 576px) {
    .user__avatar {
      width: 150px;
      height: 150px;
    }
  }

  .user__info {
    display: flex;
    align-items: center;
    text-align: center;
    justify-content: center;
    word-break: break-all;
  }

  @media (min-width: 576px) {
    .user__info {
      text-align: left;
      justify-content: left;
    }
  }
  .user__nickname {
    font-weight: bold;
    font-size: 1.3rem;
  }
  .user__name {
    font-size: 1.05rem;
  }

  .user__desc {
    margin-top: 7px;
    font-style: italic;
  }

  .user__nip05 {
    display: inline-block;
    border: 1px solid #bbb;
    padding: 1px 5px;
    margin: 5px 0;
  }

  .user__contacts {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-top: 10px;
  }

  @media (min-width: 576px) {
    .user__contacts {
      justify-content: left;
    }
  }

  .user__contacts-col {
    word-break: break-word;
  }

  .user__followers-cnt {
    display: flex;
  }

  .user__contacts-download-icon {
    cursor: pointer;
    margin-top: 1px;
  }

  .user__contacts-followers-word {
    margin-left: 6px;
  }

  .get-user-btn {
    font-size: 14px;
    cursor: pointer;
    width: 100%;
    margin-top: 5px;
  }

  @media (min-width: 768px) {
    .get-user-btn {
      margin-top: 0px;
      width: auto;
    }
  }

  .pubkey-input {
    font-size: 15px;
    padding: 1px 3px;
    flex-grow: 1;
  }

  @media (min-width: 768px) {
    .pubkey-input {
      margin-right: 5px;
    }
  }

  .not-found {
    margin-top: 25px;
    margin-bottom: 5px;
  }

  .loading-notice {
    margin-top: 20px;
  }

  /* common styles, to refactor */

  .event-footer {
    text-align: right;
  }

  .event-footer-code {
    cursor: pointer;
  }

  .field {
    margin-bottom: 15px;
  }
  
  .random-key-btn {
    margin-left: 7px;
    font-size: 14px;
    cursor: pointer;
  }

  .priv-key-input {
    font-size: 15px;
    padding: 1px 3px;
    flex-grow: 1;
  }

  .field-elements {
    margin-top: 5px;
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 768px) {
    .field-elements {
      flex-direction: row;
      justify-content: space-between;
    }
  }

  button {
    cursor: pointer;
  }

  .event-text-note {
    white-space: pre-line;
    word-break: break-word;
  }

  .error {
    color:red;
    font-size: 16px;
    margin-top: 5px;
  }

  .not-found__desc {
    margin-bottom: 10px;
  }
  .not-found__status {
    margin-top: 5px;
  }

  .fallback-search-btn {
    font-size: 14px;
  }
</style>