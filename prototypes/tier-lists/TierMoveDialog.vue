<script setup>
import { computed, ref } from 'vue'
import { getMediaKey } from '../../src/domain/mediaIdentity.js'
import TierDialog from './TierDialog.vue'

const props = defineProps({ item: Object, origin: Object, lanes: Array })
const emit = defineEmits(['close', 'move', 'remove'])
const destination = ref(props.origin.id)
const key = getMediaKey(props.item)
const position = ref(props.origin.items.findIndex(item => getMediaKey(item) === key))
const destinationItems = computed(() => props.lanes.find(tier => tier.id === destination.value)
  .items.filter(item => getMediaKey(item) !== key))
</script>

<template>
  <TierDialog title="Move item" @close="emit('close')">
    <p class="tier-move-title">{{ item.title }}</p>
    <form id="tier-move-form" class="tier-form" @submit.prevent="emit('move', destination, position)">
      <label>Destination tier
        <select v-model="destination" @change="position = destinationItems.length">
          <option v-for="tier in lanes" :key="tier.id" :value="tier.id">{{ tier.name }}</option>
        </select>
      </label>
      <label>Placement
        <select v-model.number="position">
          <option :value="0">{{ destinationItems.length ? 'First' : 'Only item' }}</option>
          <option v-for="(media, index) in destinationItems.slice(1)" :key="getMediaKey(media)" :value="index + 1">
            {{ index + 2 }} · Before {{ media.title }}
          </option>
          <option v-if="destinationItems.length" :value="destinationItems.length">Last</option>
        </select>
      </label>
    </form>
    <template #footer>
      <button class="tl-button tl-danger tier-remove-action" type="button" @click="emit('remove')">Remove from board</button>
      <button class="tl-button tl-primary" type="submit" form="tier-move-form">Move item</button>
    </template>
  </TierDialog>
</template>
