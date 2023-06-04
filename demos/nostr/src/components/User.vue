<script setup lang="ts">
  import { onMounted, ref, onUnmounted } from 'vue'
  import {
    nip19,
    getPublicKey,
    generatePrivateKey,
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
    cachedNsec,
    showImageAtUserInfo,
    isUserHasValidNip05
  } from './../store'
  import UserEvent from './UserEvent.vue'
  import type { Author } from './../types'

  const BECH32_REGEX = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/

  const fallbackRelays = [
    'wss://relay.damus.io',
    'wss://nostr-pub.wellorder.net',
    'wss://offchain.pub',
    'wss://nostr.fmt.wiz.biz',
    'wss://eden.nostr.land',
    'wss://atlas.nostr.land',
    'wss://relay.snort.social',
    'wss://nostr.fly.dev',
    'wss://nostr.nostr.band',
    'wss://relay.nostrgraph.net',
    'wss://relay.nostr.bg',
    'wss://nostr.wine',
    'wss://nos.lol',
    'wss://relay.mostr.pub',
    'wss://no.str.cr',
    'wss://brb.io',
    'wss://nostr.zebedee.cloud'
  ]

  const props = defineProps<{
    currentRelay: Relay
    nsec: string
  }>()

  const pubKeyError = ref('')
  const showNotFoundError = ref(false)
  const nsec = ref('')
  const npub = ref('')
  const showImages = ref(showImageAtUserInfo.value)
  const showLoadingUser = ref(false)
  const notFoundFallbackError = ref('')
  const isLoadingFallback = ref(false)
  const showLoadingTextNotes = ref(false)

  const updateUrlUser = (npub: string) => {
    window.location.hash = `#?user=${npub}`
  }

  const nip05toURL = (identifier: string) => {
    const [name, domain] = identifier.split('@')
    return `https://${domain}/.well-known/nostr.json?name=${name}`
  }

  onMounted(() => {
    if (initialUrlNpub.value.length && !cachedNpub.value.length) {
      npub.value = initialUrlNpub.value
      cachedUrlNpub.update(npub.value)
      initialUrlNpub.update('') // prevent re-run of this condition again
      return
    }

    if (cachedNsec.value.length || cachedNpub.value.length) {
      npub.value = cachedNpub.value
      nsec.value = cachedNsec.value
      return
    }

    const propsNsec = props.nsec.trim()
    if (!propsNsec.length) {
      return
    }

    const { data } = nip19.decode(propsNsec)
    const pubKey = getPublicKey(data as string)
    npub.value = nip19.npubEncode(pubKey)
    nsec.value = propsNsec

    cachedNpub.update(npub.value)
    cachedNsec.update(nsec.value)
  })

  onUnmounted(() => {
    cachedNpub.update(npub.value)
    cachedNsec.update(nsec.value)
  })

  const handleInputNsec = () => {
    const nsecVal = nsec.value.trim()
    if (nsecVal.match(BECH32_REGEX)) {
      try {
        const { data } = nip19.decode(nsecVal)
        const pubKey = getPublicKey(data as string)
        npub.value = nip19.npubEncode(pubKey)
        pubKeyError.value = ''
      } catch (e) {
        return
      }
    }
  }

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

    let pubHex
    try {
      let { data } = nip19.decode(npubVal)
      pubHex = data.toString()
    } catch (e) {
      pubKeyError.value = 'Public key is invalid. Please check it and try again.'
      return
    }

    const relay = props.currentRelay
    if (!relay || relay.status !== 1) {
      pubKeyError.value = 'Please connect to relay first.'
      return;
    }

    userEvent.update({} as Event)
    userDetails.update({} as Author)
    userNotesEvents.update([])

    pubKeyError.value = ''
    showLoadingUser.value = true

    const authorMeta = await relay.get({ kinds: [0], limit: 1, authors: [pubHex] })
    if (!authorMeta) {
      showLoadingUser.value = false
      showNotFoundError.value = true
      return
    }

    showLoadingUser.value = false
    showNotFoundError.value = false

    isUserHasValidNip05.update(false)
    userEvent.update(authorMeta)
    userDetails.update(JSON.parse(authorMeta.content))

    updateUrlUser(npubVal)
    cachedUrlNpub.update(npubVal)

    // check if user has valid nip05
    if (userDetails.value.nip05) {
      try {
        const validNip = await isValidNip05(userDetails.value.nip05, authorMeta.pubkey)
        isUserHasValidNip05.update(validNip)
      } catch (e) {
        console.log('Failed to check nip05')
      }
    }

    showLoadingTextNotes.value = true
    const notesEvents = await relay.list([{ kinds: [1], authors: [pubHex] }])
    userNotesEvents.update(notesEvents)
    showLoadingTextNotes.value = false
  }

  const isValidNip05 = async (identifier: string, eventPubkey: string) => {
    const profile = await nip05.queryProfile(identifier)
    return eventPubkey === profile?.pubkey
  }

  const handleGenerateRandomPrivKey = () => {
    const privKeyHex = generatePrivateKey()
    nsec.value = nip19.nsecEncode(privKeyHex)
    handleInputNsec()
  }

  const handleSearchFallback = async () => {
    const npubVal = npub.value.trim()
    let pubHex
    try {
      let { data } = nip19.decode(npubVal)
      pubHex = data.toString()
    } catch (e) {
      notFoundFallbackError.value = 'Something went wrong. Please check public key and try again.'
      return
    }

    isLoadingFallback.value = true
    const pool = new SimplePool({ getTimeout: 5600 })
    const authorMeta = await pool.get(fallbackRelays, { kinds: [0], limit: 1, authors: [pubHex] })

    if (!authorMeta) {
      isLoadingFallback.value = false
      notFoundFallbackError.value = 'User was not found on listed relays.'
      return
    }

    isLoadingFallback.value = false
    showNotFoundError.value = false
    notFoundFallbackError.value = ''

    isUserHasValidNip05.update(false)
    userEvent.update(authorMeta)
    userDetails.update(JSON.parse(authorMeta.content))

    updateUrlUser(npubVal)
    cachedUrlNpub.update(npubVal)

    // check if user has valid nip05
    if (userDetails.value.nip05) {
      try {
        const validNip = await isValidNip05(userDetails.value.nip05, authorMeta.pubkey)
        isUserHasValidNip05.update(validNip)
      } catch (e) {
        console.log('Failed to check nip05')
      }
    }

    showLoadingTextNotes.value = true
    const notesEvents = await pool.list(fallbackRelays, [{ kinds: [1], authors: [pubHex] }])
    userNotesEvents.update(notesEvents)
    showLoadingTextNotes.value = false
  }
</script>

<template>
  <div class="field">
    <label class="field-label" for="user_public_key">
      <strong>Profile's public key</strong>
      <button @click="handleGenerateRandomPrivKey" class="random-key-btn">Use mine</button>
    </label>
    <div class="field-elements">
      <input @input="handleInputNpub" v-model="npub" class="pubkey-input" id="user_public_key" type="text" placeholder="npub..." />
      <button @click="handleGetUserInfo" class="get-user-btn">Fetch</button>
    </div>
    <div class="error">
      {{ pubKeyError }}
    </div>
  </div>

  <div class="show-images">
    <span class="show-images__field">
      <input
        class="show-images__input"
        v-model="showImages"
        @change="showImageAtUserInfo.update(showImages)"
        type="checkbox"
        id="show-feed-images"
      />
      <label class="show-images__label" for="show-feed-images"> Show avatars</label>
    </span>
    <small> (Will load image from third-party URL. This may compromise your IP address)</small>
  </div>

  <div class="loading-notice" v-if="showLoadingUser">
    Loading user info...
  </div>

  <UserEvent
    v-if="userEvent.value.id"
    :authorEvent="userEvent.value"
    :author="userDetails.value"
    :event="userEvent.value"
  >
    <div class="user">
      <div v-if="showImages" class="user__avatar-wrapper">
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
        </div>
      </div>
    </div>
  </UserEvent>

  <div v-if="showLoadingTextNotes">Loading user notes...</div>
  <h3 v-if="userNotesEvents.value.length > 0 && !showLoadingTextNotes">User notes</h3>

  <template v-for="event in userNotesEvents.value">
    <UserEvent :event="event" :authorEvent="userEvent.value" :author="userDetails.value">
      <div class="event-text-note">{{ event.content }}</div>
    </UserEvent>
  </template>

  <div class="not-found" v-if="showNotFoundError">
    <div class="not-found__desc">
      User was not found on selected relay. Please try to connect to another one or you can try to load info about this user from the list of popular relays:
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

  .get-user-btn {
    font-size: 14px;
    cursor: pointer;
    width: 100%;
    margin-top: 5px;
  }

  @media (min-width: 768px) {
    .get-user-btn {
      margin-top: 0px;
      width: 60px;
    }
  }

  .pubkey-input {
    font-size: 15px;
    padding: 1px 3px;
    flex-grow: 1;
  }

  @media (min-width: 768px) {
    .pubkey-input {
      margin-right: 7px;
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

  .field-label_priv-key {
    display: flex;
    align-items: center;
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

  .show-images {
    margin-bottom: -5px
  }

  .show-images__input {
    cursor: pointer;
  }

  .show-images__label {
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