<script setup lang="ts">
  import EmptyHeartIcon from './../icons/EmptyHeartIcon.vue'
  import ArrowRepeatIcon from './../icons/ArrowRepeatIcon.vue'

  defineProps<{
    likes: number
    reposts: number
  }>()
</script>

<template>
  <div class="actions-bar">
    <span class="actions-bar__action actions-bar__likes">
      <EmptyHeartIcon class="actions-bar__icon" />
      <span class="actions_bar-number">{{ likes }}</span>
    </span>
    <span class="actions-bar__action actions-bar__repost">
      <ArrowRepeatIcon class="actions-bar__icon" />
      <span class="actions_bar-number">{{ reposts }}</span>
    </span>
  </div>
</template>

<style>
  .actions-bar__action {
    display: inline-flex;
    align-items: center;
  }

  .actions-bar__likes {
    margin-right: 12px;
  }

  .actions-bar__icon {
    margin-right: 5px;
  }
</style>