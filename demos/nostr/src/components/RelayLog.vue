<script setup lang="ts">
  const props = defineProps<{
    eventsLog: string[]
  }>()
</script>

<template>
  <div class="log">
    <strong>Relay events log</strong>
    <ul class="log__list">
      <li class="log__list-item" v-for="value in props.eventsLog">
        <span v-html="value"></span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
  .log {
    border: 1px solid #bbb;
    padding: 14px;
    margin: 1rem 0;
  }

  .log__list {
    padding-left: 18px;
    padding-top: 5px;
    padding-bottom: 5px;
  }

  .log__list-item {
    margin-bottom: 10px
  }
</style>