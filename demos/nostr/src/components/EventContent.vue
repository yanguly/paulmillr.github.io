<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import type { EventExtended, EventContentPart } from './../types'
  import { nip19 } from 'nostr-tools'
  import { currentTab, npub } from './../store'
  import { updateUrlUser } from './../utils'

  const props = defineProps<{
    event: EventExtended
    slice?: number
  }>()

  const contentParts = ref<EventContentPart[]>([])

  onMounted(() => {
    const event = props.event
    const rawContent = event.content
    const references = event.references

    const cachedIndexes:number[] = []
    references.forEach((ref: any) => {
      let index = rawContent.indexOf(ref.text)

      // handle multiple mentions of the same profile
      if (cachedIndexes.includes(index)) {
        for (const ci of cachedIndexes) {
          if (!cachedIndexes.includes(index)) break
          index = rawContent.indexOf(ref.text, index + ref.text.length)
        }
      }

      ref.textIndex = index
      cachedIndexes.push(index)
    })

    references.sort((a: any, b: any) => {
      return a.textIndex - b.textIndex
    })

    let parts = []
    let currentTextPart = rawContent
    references.forEach((ref: any) => {
      const currIndex = currentTextPart.indexOf(ref.text)
      const part1 = currentTextPart.slice(0, currIndex)
      const part2 = currentTextPart.slice(currIndex + ref.text.length)

      const name = getReferenceName(ref)

      parts.push({type: 'text', value: part1})
      parts.push({type: 'profile', value: name, npub: getNpub(ref.profile.pubkey)})

      currentTextPart = part2
    })
    parts.push({type: 'text', value: currentTextPart})

    if (props.slice) {
      parts = sliceParts(parts, props.slice)
    }
  
    contentParts.value = parts
  })

  const sliceParts = (parts: EventContentPart[], sliceCount: number) => {
    let slicedParts = []

    let str = ''
    for (const p of parts) {
      const startLength = str.length
      str += p.value
      if (str.length <= sliceCount) {
        slicedParts.push(p)
      } else {
        if (p.type === 'text') {
          const difference = sliceCount - startLength
          p.value = p.value.slice(0, difference)
        }
        slicedParts.push(p)
        slicedParts.push({type: 'text', value: '...'})
        break
      }
    }

    return slicedParts
  }

  const getReferenceName = (reference: any) => {
    const details = reference.profile_details
    const npub = getNpub(reference.profile.pubkey)
    const name = details.name || details.username || details.display_name || `${npub.slice(0, 15)}...`
    return `@${name}`
  }

  const getNpub = (pubkey: string) => {
    return nip19.npubEncode(pubkey)
  }

  const handleClickMention = (mentionNpub: string | undefined) => {
    if (!mentionNpub) return
    updateUrlUser(mentionNpub)
    currentTab.update('user')
    npub.update(mentionNpub)
    window.scrollTo({ top: 0 })
  }
</script>

<template>
  <span v-for="part in contentParts">
    <span v-if="part.type === 'text'">
      {{ part.value }}
    </span>
    <span v-if="part.type === 'profile'">
      <a @click.prevent="() => handleClickMention(part.npub)" :href="`#?user=${part.npub}`">
        {{ part.value }}
      </a>
    </span>
  </span>
</template>