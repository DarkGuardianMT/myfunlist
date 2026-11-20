<script setup>
import { nextTick, ref } from 'vue'
import { addTier, MAX_TIERS, PALETTE, removeTier, renameTier, shiftTier } from './board.js'
import TierDialog from './TierDialog.vue'

const props = defineProps({ board: Object })
const emit = defineEmits(['close', 'announce'])
const removal = ref(null)
let sequence = 0

function add() {
  let id
  do { id = `new-tier-${++sequence}` } while (props.board.tiers.some(tier => tier.id === id))
  if (addTier(props.board, id)) nextTick(() => document.getElementById(`name-${id}`)?.focus())
}

function shift(tier, offset) {
  if (!shiftTier(props.board, tier.id, offset)) return
  emit('announce', `${tier.name} moved to tier ${props.board.tiers.indexOf(tier) + 1}.`)
  nextTick(() => document.getElementById(`name-${tier.id}`)?.focus())
}

function remove(tier) {
  if (!removeTier(props.board, tier.id)) return
  emit('announce', tier.items.length ? `${tier.items.length} items moved to Unranked.` : `${tier.name} removed.`)
  removal.value = null
  nextTick(() => document.getElementById('add-tier')?.focus())
}

function requestRemoval(tier) {
  if (tier.items.length) {
    removal.value = tier
    nextTick(() => document.getElementById('cancel-tier-removal')?.focus())
  } else remove(tier)
}

function cancelRemoval() {
  const id = removal.value.id
  removal.value = null
  nextTick(() => document.getElementById(`remove-tier-${id}`)?.focus())
}
</script>

<template>
  <TierDialog title="Configure tiers" wide @close="emit('close')">
    <p class="tier-picker-message">Ranked tiers appear in this order. Unranked always stays at the end.</p>
    <div v-if="removal" class="tier-notice" role="group" aria-labelledby="remove-tier-question">
      <p id="remove-tier-question">
        Remove {{ removal.name }}? Its {{ removal.items.length }} {{ removal.items.length === 1 ? 'item will' : 'items will' }} move to the end of Unranked in the same order.
      </p>
      <div class="tier-actions">
        <button id="cancel-tier-removal" class="tl-button" type="button" @click="cancelRemoval">Keep tier</button>
        <button class="tl-button tl-danger" type="button" @click="remove(removal)">Remove and move items</button>
      </div>
    </div>
    <fieldset class="tier-config-list" :disabled="Boolean(removal)" aria-label="Editable tiers">
      <div v-for="(tier, index) in board.tiers" :key="tier.id" class="tier-config-row" :data-color="tier.color">
        <label>Tier name
          <input :id="`name-${tier.id}`" :value="tier.name" maxlength="32" @input="renameTier(board, tier.id, $event.target.value)" />
        </label>
        <div>
          <label :for="`color-${tier.id}`">Color</label>
          <span class="tier-color-control">
            <span class="tier-swatch" aria-hidden="true"></span>
            <select :id="`color-${tier.id}`" v-model="tier.color">
              <option v-for="color in PALETTE" :key="color" :value="color">{{ color }}</option>
            </select>
          </span>
        </div>
        <div class="tier-actions">
          <button class="tl-button tl-icon-button" type="button" :aria-label="`Move tier ${tier.name} up`"
            :disabled="index === 0" @click="shift(tier, -1)">↑</button>
          <button class="tl-button tl-icon-button" type="button" :aria-label="`Move tier ${tier.name} down`"
            :disabled="index === board.tiers.length - 1" @click="shift(tier, 1)">↓</button>
          <button :id="`remove-tier-${tier.id}`" class="tl-button" type="button" :aria-label="`Remove tier ${tier.name}`"
            :disabled="board.tiers.length === 1" @click="requestRemoval(tier)">Remove</button>
        </div>
      </div>
      <button id="add-tier" class="tl-button" type="button" :disabled="board.tiers.length >= MAX_TIERS" @click="add">Add tier</button>
    </fieldset>
    <p v-if="board.tiers.length === MAX_TIERS" class="tier-picker-message">This preview supports up to {{ MAX_TIERS }} ranked tiers.</p>
    <template #footer>
      <button class="tl-button tl-primary" type="button" @click="emit('close')">Done</button>
    </template>
  </TierDialog>
</template>
