<script setup lang="ts">
  import { onBeforeMount, ref } from 'vue'
  import {
    relayInit,
    getPublicKey,
    getEventHash,
    signEvent,
    nip19,
    generatePrivateKey,
    type Sub,
    type Relay,
    type Event
  } from 'nostr-tools'

  import type { EventWithAuthor } from './types'
  import User from './components/User.vue'
  import RelayFeed from './components/RelayFeed.vue'
  import { initialUrlNpub, cachedUrlNpub } from './store'

  const currentPath = ref(window.location.hash)

  const DEFAULT_RELAYS = [
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://relay.nostr.ai',
    'wss://relayable.org',
    'wss://relay.damus.io'
  ]
  const DEFAULT_EVENTS_COUNT = 20;

  let relaySub: Sub;
  let currentRelay: Relay;
  let curInterval: number;

  // events in feed
  const events = ref<EventWithAuthor[]>([])
  const eventsIds = new Set()
  const sentEventIds = new Set()

  const customRelay = ref('')
  const selectedRelay = ref(DEFAULT_RELAYS[0])
  const connectedRelay = ref('')
  const nsec = ref('')
  const message = ref('')
  const pubKey = ref('')
  const signedJson = ref('')

  let newEvents = ref<{ id: string; pubkey: string; }[]>([]);

  let showNewEvents = ref(false)
  let showNewEventsCount = ref(0)
  let newAuthorImg1 = ref('');
  let newAuthorImg2 = ref('');

  const eventsLog = ref<string[]>([]);

  const showImages = ref(false)
  const showCustomRelayUrl = ref(false)
  const showConnectBtn = ref(true)
  const showConnectingToRelay = ref(false)

  // 1 - feed, 2 - user, 3 - signed message, 4 - log
  const activeTab = ref(1)

  const wsError = ref('')
  const msgErr = ref('')
  const jsonErr = ref('')

  const updateUrlHash = (hash: string) => {
    window.location.hash = hash
  }

  // runs once on app start
  onBeforeMount(() => {
    const hash = currentPath.value
    if (!hash.length) return

    if (hash.indexOf('user') > -1) {
      activeTab.value = 2
      const hash = currentPath.value.slice(2)
      if (hash && !hash.length) return
      const npub = hash.split('=')[1]
      if (npub && !npub.length) return
      initialUrlNpub.update(npub)
    }

    if (hash.indexOf('feed') > -1) {
      activeTab.value = 1
    }

    if (hash.indexOf('message') > -1) {
      activeTab.value = 3
    }
  })

  const handleClickUserTab = () => {
    activeTab.value = 2
    const npub = cachedUrlNpub.value
    if (!npub.length) {
      updateUrlHash(`#user`)
      return
    }
    updateUrlHash(`#?user=${npub}`)
  }

  const log = (msg: string) => {
    eventsLog.value.unshift(`${msg} <br> [${new Date().toLocaleString()}]`)
  }

  const updateNewEventsElement = async () => {
    const eventsToShow = newEvents.value
    if (eventsToShow.length < 2) return;

    const pub1 = eventsToShow[eventsToShow.length - 1].pubkey
    const pub2 = eventsToShow[eventsToShow.length - 2].pubkey

    const eventsListOptions1 = [{ kinds: [0], authors: [pub1], limit: 1 }]
    const eventsListOptions2 = [{ kinds: [0], authors: [pub2], limit: 1 }]

    const author1 = await currentRelay.list(eventsListOptions1)
    const author2 = await currentRelay.list(eventsListOptions2)

    if (!curInterval) return;

    newAuthorImg1.value = JSON.parse(author1[0].content).picture
    newAuthorImg2.value = JSON.parse(author2[0].content).picture

    showNewEventsCount.value = eventsToShow.length
    showNewEvents.value = true
  }

  const injectAuthorsToNotes = (postsEvents: Event[], authorsEvents: Event[]) => {
    const postsWithAuthor: Event[] = [];
    postsEvents.forEach(pe => {
      let isAuthoAddedToPost = false;
      authorsEvents.forEach(ae => {
        if (pe.pubkey === ae.pubkey) {
          const tempEventWithAuthor = pe as EventWithAuthor
          tempEventWithAuthor.author = JSON.parse(ae.content)
          tempEventWithAuthor.authorEvent = ae
          postsWithAuthor.push(pe)
          isAuthoAddedToPost = true
        }
      })
      // keep post in the list of posts even if author is not found
      if (!isAuthoAddedToPost) {
        postsWithAuthor.push(pe)
      }
    })
    return postsWithAuthor;
  }

  async function handleRelayConnect() {
    if (showConnectingToRelay.value) return

    let relayUrl = selectedRelay.value
    let isCustom = false
    if (relayUrl === 'custom') {
      relayUrl = customRelay.value
      isCustom = true
    }

    if (!relayUrl.length) return;

    let relay: Relay;
    try {
      showConnectingToRelay.value = true
      relay = relayInit(relayUrl)
      await relay.connect()
      wsError.value = ''
    } catch (e) {
      let error = `WebSocket connection to "${relayUrl}" failed. `
      if (!navigator.onLine) {
        error += `Seems you are offline. Please check your internet connection and try again.`
      } else {
        error += `Please check address and try again. It should be a correct WebSocket URL for relay. Or check your internet connection.`
      }
      wsError.value = error
      showConnectingToRelay.value = false
      return;
    }

    // unsubscribe from previous list of relays and clear interval
    if (currentRelay) {
      currentRelay.close();
      log(`disconnected from <b>${currentRelay.url}</b>`)
    }
    if (relaySub) relaySub.unsub();
    if (curInterval) {
      clearInterval(curInterval)
      curInterval = 0;
    }

    currentRelay = relay;

    relay.on('connect', async () => {
      log(`connected to <b>${relay.url}</b>`)

      showConnectBtn.value = false
      showConnectingToRelay.value = false

      // hide new events element and clear it's values
      showNewEvents.value = false
      newEvents.value = []

      const limit = DEFAULT_EVENTS_COUNT;
      const postsEvents = await relay.list([{ kinds: [1], limit }])
      const authors = postsEvents.map(e => e.pubkey)
      const authorsEvents = await relay.list([{ kinds: [0], authors }])

      const posts = authorsEvents.length ?
        injectAuthorsToNotes(postsEvents, authorsEvents) :
        postsEvents

      eventsIds.clear()
      posts.forEach(e => eventsIds.add(e.id))
      events.value = posts as EventWithAuthor[]

      connectedRelay.value = isCustom ? 'custom' : relayUrl

      relaySub = relay.sub([{ kinds: [1], limit: 1 }])
      relaySub.on('event', event => {
        if (eventsIds.has(event.id)) return;
        newEvents.value.push({ id: event.id, pubkey: event.pubkey })
      })
      curInterval = setInterval(updateNewEventsElement, 3000)
    })

    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`)
    })
  }

  const loadNewRelayEvents = async () => {
    let eventsToShow = newEvents.value;
    newEvents.value = newEvents.value.filter(item => !eventsToShow.includes(item));

    const ids = eventsToShow.map(e => e.id)
    const postsEvents = await currentRelay.list([{ ids }]);
    const authors = postsEvents.map(e => e.pubkey)
    const authorsEvents = await currentRelay.list([{ kinds: [0], authors }])

    const posts = authorsEvents.length ?
      injectAuthorsToNotes(postsEvents, authorsEvents) :
      postsEvents

    // update view
    posts.forEach(e => eventsIds.add(e.id))
    events.value = posts.concat(events.value) as EventWithAuthor[]
    showNewEvents.value = false

    log(`loaded ${eventsToShow.length} new events from <b>${currentRelay.url}</b>`)
  }

  const handleSendMessage = async () => {
    const nsecValue = nsec.value.trim()
    if (!nsecValue.length) {
      msgErr.value = 'Please provide your private key or generate random key.'
      return;
    }

    const messageValue = message.value.trim()
    if (!messageValue.length) {
      msgErr.value = 'Please provide message to broadcast.'
      return;
    }

    let privKey: string;
    try {
      const { data } = nip19.decode(nsecValue)
      privKey = data as string
      pubKey.value = getPublicKey(privKey)
    } catch (e) {
      msgErr.value = `Invalid private key. Please check it and try again.`
      return;
    }

    if (!currentRelay || currentRelay.status !== 1) {
      msgErr.value = 'Please connect to relay first.'
      return;
    }

    const event = {
      kind: 1,
      pubkey: pubKey.value,
      created_at: Math.floor(Date.now() / 1000),
      content: messageValue,
      tags: [],
      id: '',
      sig: ''
    }
    event.id = getEventHash(event)
    event.sig = signEvent(event, privKey)

    if (sentEventIds.has(event.id)) {
      msgErr.value = 'The same event can\'t be sent twice (same id, signature).'
      return;
    }

    msgErr.value = ''
    message.value = ''

    await broadcastEvent(event)
  }

  const handleSendSignedEvent  = async () => {
    if (!signedJson.value.length) {
      jsonErr.value = 'Provide signed event.'
      return;
    }

    let event;
    try {
      event = JSON.parse(signedJson.value)
    } catch (e) {
      jsonErr.value = 'Invalid JSON. Please check it and try again.'
      return;
    }

    if (sentEventIds.has(event.id)) {
      jsonErr.value = 'The same event can\'t be sent twice (same id, signature).'
      return;
    }

    if (!currentRelay || currentRelay.status !== 1) {
      jsonErr.value = 'Please connect to relay first.'
      return;
    }

    jsonErr.value = ''
    signedJson.value = ''

    await broadcastEvent(event)
  }

  const broadcastEvent = async (event: Event) => {
    clearInterval(curInterval)

    const userNewEventOptions = [{ kinds: [1], authors: [pubKey.value], limit: 1 }]
    const userSub = currentRelay.sub(userNewEventOptions)
    userSub.on('event', event => {
      // update feed only if new event is loaded
      // interval needed because of delay between publishing and loading new event
      const interval = setInterval(async () => {
        if (newEvents.value.some(e => e.id == event.id)) {
          await loadNewRelayEvents()
          curInterval = setInterval(updateNewEventsElement, 3000)
          clearInterval(interval)
          userSub.unsub()
        }
      }, 100)
    })

    const pub = currentRelay.publish(event)
    pub.on('ok', async () => {
      sentEventIds.add(event.id)
      log(`new event broadcasted to <b>${currentRelay.url}</b>`)
    })
    pub.on('failed', (reason: string) => {
      log(`failed to publish to <b>${currentRelay.url}</b>: ${reason}`)
    })
  }

  const handleRelaySelect = (event: any) => {
    const value = event.target.value;
    showCustomRelayUrl.value = value === 'custom'

    if (value === connectedRelay.value) {
      showConnectBtn.value = false;
      return;
    }

    selectedRelay.value = value;
    showConnectBtn.value = true;
  }

  const handleRelayDisconnect = () => {
    clearInterval(curInterval)
    showNewEvents.value = false
    newEvents.value = []

    relaySub.unsub()
    currentRelay.close()

    showConnectBtn.value = true;
    log(`disconnected from <b>${currentRelay.url}</b>`)
  }

  const handleGenerateRandomPrivKey = () => {
    const privKeyHex = generatePrivateKey()
    nsec.value = nip19.nsecEncode(privKeyHex)
  }

  const handleToggleRawData = (eventId: string) => {
    const event = events.value.find(e => e.id === eventId)
    if (event) {
      event.showRawData = !event.showRawData
    }
  }
</script>

<template>
  <div class="connect-desc">

  </div>

  <p class="relay-info">
    <div class="message-fields">
      <div class="message-fields__field">
        <label class="field-label field-label_priv-key" for="relays">
          <strong>Select relay</strong>
        </label>
        <div class="field-elements">
        <select class="select-relay__select" @change="handleRelaySelect" name="relays" id="relays">
          <option v-for="url in DEFAULT_RELAYS" :value="url">
            {{ url }}
          </option>
          <option value="custom">custom url</option>
        </select>


        </div>
      </div>
      <div class="message-fields__field">
        <label class="field-label" for="message">
          <strong>Private key (optional)</strong>
          <button @click="handleGenerateRandomPrivKey" class="random-key-btn">Random</button>
        </label>
        <div class="field-elements">
          <input v-model="nsec" class="priv-key-input" id="priv_key" type="text" placeholder="nsec..." />


      <button v-if="showConnectBtn" @click="handleRelayConnect" class="select-relay__btn">
        {{ showConnectingToRelay ? 'Connecting...' : 'Connect' }}
      </button>
      <button v-if="!showConnectBtn" @click="handleRelayDisconnect" class="select-relay__btn">
        Disconnect
      </button>

        </div>
      </div>
    </div>
    <div class="error">
      {{ wsError }}
    </div>
  </p>

  <div v-if="showCustomRelayUrl" class="field">
    <label class="field-label" for="relay_url">
      <strong>Relay URL</strong>
    </label>
    <div class="field-elements">
      <input v-model="customRelay" class="relay-input" id="relay_url" type="text" placeholder="wss://realay.example.com" />
    </div>
  </div>

  <!--<hr class="delimetr">-->

  <div class="tabs">
    <span
      v-on:click="activeTab = 1; updateUrlHash('feed')"
      :class="['tabs__item', { 'tabs__item_active': activeTab === 1 }]"
    >
      Feed
    </span>
    <span
      v-on:click="handleClickUserTab()"
      :class="['tabs__item', { 'tabs__item_active': activeTab === 2 }]"
    >
      Profile info
    </span>
    <span
      v-on:click="activeTab = 3; updateUrlHash('message')"
      :class="['tabs__item', { 'tabs__item_active': activeTab === 3 }]"
    >
      Broadcast
    </span>
    <span
      v-on:click="activeTab = 5; updateUrlHash('help')"
      :class="['tabs__item', { 'tabs__item_active': activeTab === 5 }]"
    >
      Help
    </span>
    <span
      v-on:click="activeTab = 4; updateUrlHash('feed')"
      :class="['tabs__item tabs_mobile', { 'tabs__item_active': activeTab === 4 }]"
      >
      Events log
    </span>
  </div>

  <!-- notes feed -->
  <div v-if="activeTab === 1" class="message-fields-wrapper">
    <div class="message-fields">
      <div class="message-fields__field">
        <label class="field-label" for="message">
          <strong>Message to broadcast</strong>
        </label>
        <div class="field-elements">
          <input v-model="message" class="message-input" id="message" type="text" placeholder="Test message 👋" />
          <button class="send-btn" @click="handleSendMessage">Broadcast</button>
        </div>
      </div>
    </div>
    <div class="error">
      {{ msgErr }}
    </div>
  </div>

  <!-- Signed event -->
  <div v-if="activeTab === 3" class="message-fields-wrapper">
    <p class="signed-message-desc">
      Event should be signed with your private key in advance. Event will be broadcasted to a selected relay.
      More details about events and signatures are <a target="_blank" href="https://github.com/nostr-protocol/nips/blob/master/01.md#events-and-signatures">here</a>.
    </p>

    <div class="message-fields__field_sig">
      <label class="field-label field-label_priv-key" for="priv_key">
        <strong>JSON of a signed event</strong>
      </label>
      <div class="field-elements">
        <textarea
        class="signed-json-textarea"
        name="signed_json"
        id="signed_json"
        cols="30"
        rows="5"
        v-model="signedJson"
        placeholder='{"kind":1,"pubkey":"5486dbb083512982669fa180aa02d722ce35054233cea724061fbc5f39f81aa3","created_at":1685664152,"content":"Test message 👋","tags":[],"id":"89adae408121ba6d721203365becff4d312292a9dd9b7a35ffa230a1483b09a2","sig":"b2592ae88ba1040c928e458dd6822413f148c8cc4f478d992e024e8c9d9648b96e6ce6dc564ab5815675007f824d9e9f634f8dbde554afeb6e594bcaac4389dd"}'></textarea>
      </div>
    </div>
    <div class="signed-json-btn-wrapper">
      <div class="error">
        {{ jsonErr }}
      </div>
      <button class="send-btn send-btn_signed-json" @click="handleSendSignedEvent">Broadcast</button>
    </div>
  </div>

  <!-- Relay feed -->
  <div v-if="activeTab !== 2 && activeTab !== 5">
    <div class="show-images">
      <span class="show-images__field">
        <input class="show-images__input" type="checkbox" id="show-feed-images" v-model="showImages" />
        <label class="show-images__label" for="show-feed-images"> Show avatars</label>
      </span>
      <small> (Will load images from third-party URLs. This may compromise your IP address)</small>
    </div>

    <div class="columns">
      <div :class="['events', { 'd-md-none': activeTab === 2 || activeTab === 4 }]">
        <div class="connecting-notice" v-if="showConnectingToRelay">
          Loading {{ currentRelay ? 'new' : '' }} relay feed...
        </div>

        <div @click="loadNewRelayEvents" v-if="showNewEvents" class="new-events">
          <div v-if="showImages" class="new-events__imgs">
            <img class="new-events__img" :src="newAuthorImg1" alt="img">
            <img class="new-events__img" :src="newAuthorImg2" alt="img">
          </div>
          <span class="new-events__text">{{ showNewEventsCount }} new notes</span>
          <b class="new-events__arrow">↑</b>
        </div>

        <RelayFeed
          :events="events"
          :pubKey="pubKey"
          :showImages="showImages"
          @toggleRawData="handleToggleRawData"
        />
      </div>

      <div :class="['log', { 'd-md-none': activeTab !== 4 }]">
        <strong>Relay events log</strong>
        <ul class="log__list">
          <li class="log__list-item" v-for="value in eventsLog">
            <span v-html="value"></span>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- User -->
  <div v-if="activeTab === 2">
    <User
      :nsec="nsec"
      :currentRelay="currentRelay"
    />
  </div>

  <div v-if="activeTab === 5" class="">
    <h3>Slightly Private App</h3>

    <p>
      <a href="https://nostr.com">nostr</a> is public, censorship-resistant social network.
      It's simple:

      <ol>
        <li>Select one of relays, or provide a <a href="https://nostr.watch/" target="_blank">custom URL</a></li>
        <li><em>Optionally</em>, enter your private key, to create new messages</li>
      </ol>
    </p>

    <p>
      Traditional social networks can supress certain posts or users.
      No nostr, every message is signed by user's <em>private key</em>
      and broadcasted to <em>relays</em>.
      Messages are tamper-resistant: no one can edit them,
      or the signature will become invalid.
      Users can't be blocked: even if a relay blocks someone, it's always
      possible to switch to a different one, or create up a personal relay.
      With the app, you can:
      <ul>
        <li><em>Connect</em> and see relay's global feed.</li>
        <li><em>Post</em> new messages to the relay.</li>
        <li><em>Broadcast</em> a pre-signed message by using Broadcast tab. No need to enter private key anywhere.</li>
        <li><em>Fetch</em> information about a user or an event.</li>
      </ul>

      The app is available at <a href="https://nostr.spa">nostr.spa</a>.
    </p>

    <p>
      <h3>Privacy policy</h3>

      <ul>
        <li>No tracking from our end</li>
        <li>Private keys are not sent anywhere. They are stored in RAM of your device</li>
        <li>Relay will see your ip+browser after you click <em>Connect</em> button</li>
        <li>GitHub will see ip+browser of anyone who's using the app, because it's hosted on GitHub Pages. They won't see any nostr-specific interactions you will make</li>
        <li><em>Show avatars</em> feature will leak your ip+browser to random people on the internet. Since there are no centralized servers in nostr, every user can specify their own URL for avatar hosting. Meaning, users can control the hosting webservers and see logs</li>
        <li><em>Remember me</em> feature will write private key you've entered to browser's Local Storage, which is usually stored on your device's disk</li>
        <li>VPN or TOR usage is advised, <em>as with any nostr client</em>, to prevent ip leakage</li>
      </ul>
    </p>
  <h3>Open source</h3>
  <p>
    The lightweight nostr client is built to showcase <a href="/noble/">noble</a> cryptography.
    Signing is done using
    <a target="_blank" href="https://github.com/paulmillr/noble-curves">noble-curves</a>, while <a target="_blank" href="https://github.com/paulmillr/scure-base">scure-base</a> is used for bech32,
    <a target="_blank" href="https://github.com/nbd-wtf/nostr-tools">nostr-tools</a> are used
    for general nostr utilities and Vue.js is utilized for UI.
    Check out <a target="_blank" href="https://github.com/paulmillr/paulmillr.github.io">the source code</a>. You are welcome to host the client on your personal website.
  </p>

  </div>
</template>

<style scoped>
  .relay-info {
    margin-bottom: 20px;
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

  .error {
    color:red;
    font-size: 16px;
    margin-top: 5px;
  }

  .select-relay {
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 768px) {
    .select-relay {
      flex-direction: row;
      align-items: center;
    }
  }

  .select-relay__label {
    margin-right: 7px;
  }

  .select-relay__select {
    margin-top: 5px;
    font-size: 16px;
    margin-bottom: 5px;
  }

  @media (min-width: 768px) {
    .select-relay__select {
      margin-top: 0;
      margin-bottom: 0;
      margin-right: 7px;
    }
  }

  .select-relay__btn {
    font-size: 14px;
    cursor: pointer;
  }

  .delimetr {
    margin: 12px 0;
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

  .d-md-none {
    display: none;
  }

  @media (min-width: 768px) {
    .d-md-none {
      display: initial;
    }
  }

  .tabs {
    margin-top: 15px;
    margin-bottom: 15px;
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 576px) {
    .tabs {
      display: block;
    }
  }

  @media (min-width: 768px) {
    .tabs_mobile {
      display: none !important;
    }
  }

  .tabs__item {
    color: white;
    color: #0092bf;
    margin-right: 15px;
    cursor: pointer;
    display: inline-block;
  }

  .tabs__item:hover {
    text-decoration: underline;
  }

  .tabs__item_active {
    text-decoration: underline;
  }

  .columns {
    display: flex;
  }

  .message-fields-wrapper {
    margin-bottom: 20px;
  }

  .message-fields {
    display: flex;
    flex-wrap: wrap;
    flex-direction: column;
  }

  @media (min-width: 768px) {
    .message-fields {
      flex-direction: row;
    }
  }

  .message-fields__field {
    flex-grow: 1;
  }

  .message-fields__field:first-child {
    margin-right: 5px;
    margin-bottom: 10px
  }

  @media (min-width: 768px) {
    .message-fields__field:first-child {
      margin-bottom: 0;
    }
  }

  @media (min-width: 768px) {
    .message-fields__field_sig {
      margin-bottom: 5px;
    }
  }

  .message-fields__field_sig input {
    margin-right: 0;
  }

  .text-right {
    text-align: right;
  }

  .connect-desc {
    margin-bottom: 15px;
  }

  .events {
    width: 100%;
    position: relative;
  }

  @media (min-width: 768px) {
    .events {
      width: 68%;
      min-width: 68%;
      margin-right: 2%;
    }
  }

   @media (min-width: 1024px) {
    .events {
      width: 685px;
      min-width: 685px;
      margin-right: 2%;
    }
  }

  .new-events {
    position: absolute;
    padding: 4px 8px;
    top: 17px;
    left: 50%;
    transform: translate(-50%, 0);
    background: #0092bf;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 200px;
  }


  @media (min-width: 768px) {
    .new-events {
      padding: 4px 14px;
      width: auto;
    }
  }

  .new-events__img {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid white;
  }

  .new-events__text {
    margin-left: 5px;
    margin-right: 5px;
  }

  .new-events__imgs {
    display: flex;
  }
  .new-events__img:first-child {
    margin-right: -10px;
  }

  .log {
    border: 1px solid #bbb;
    padding: 14px;
    margin: 1rem 0;
    flex-grow: 1;
  }

  .log__list {
    padding-left: 18px;
    padding-top: 5px;
    padding-bottom: 5px;
  }

  .log__list-item {
    margin-bottom: 10px
  }

  .field {
    margin-bottom: 15px;
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

  .relay-input {
    font-size: 15px;
    padding: 1px 3px;
    flex-grow: 1;
  }

  .priv-key-input {
    font-size: 15px;
    padding: 1px 3px;
    flex-grow: 1;
  }

  .message-input {
    font-size: 15px;
    padding: 1px 3px;
    flex-grow: 1;
  }

  @media (min-width: 768px) {
    .relay-input,
    .priv-key-input,
    .message-input {
      margin-right: 5px;
    }
  }

  .send-btn {
    font-size: 14px;
    width: 100%;
    margin-top: 5px;
    cursor: pointer;
  }

  .send-btn_signed-json {
    margin-top: 5px;
  }

  @media (min-width: 768px) {
    .send-btn {
      width: 80px;
      margin-top: 0;
    }
  }

  .signed-json-textarea {
    width: 100%;
  }

  .signed-message-desc {
    margin-bottom: 15px;
  }

  .signed-json-btn-wrapper {
    display: flex;
    flex-direction: column-reverse;
    justify-content: space-between;
    align-items: start;
  }

  @media (min-width: 768px) {
    .signed-json-btn-wrapper {
      flex-direction: row;
    }
  }

  .signed-json-btn-wrapper .error {
    line-height: 1;
    margin-top: 0;
    margin-bottom: 5px;
    margin-top: 5px;
  }

  @media (min-width: 768px) {
    .signed-json-btn-wrapper .error {
       margin-top: 0;
    }
  }
  .connecting-notice {
    margin-top: 20px;
  }
</style>
