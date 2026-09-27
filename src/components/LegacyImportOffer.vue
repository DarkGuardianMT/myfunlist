<script setup>
import { useLegacyImport } from '../composables/useLegacyImport.js'

const { offerVisible, isImporting, importSummary, importError, dismissImport, startImport } = useLegacyImport()
</script>

<template>
  <section v-if="offerVisible || importSummary" class="import-offer" aria-label="Import saved browser items">
    <template v-if="offerVisible">
      <p>We found items saved in this browser. Import them into your account?</p>
      <div class="import-offer__actions">
        <button type="button" :disabled="isImporting" @click="startImport">
          {{ isImporting ? 'Importing…' : 'Import' }}
        </button>
        <button type="button" class="text-button" :disabled="isImporting" @click="dismissImport">
          Not now
        </button>
      </div>
    </template>
    <p v-if="importSummary" role="status">
      {{ importSummary.imported }} imported, {{ importSummary.existing + importSummary.duplicate }}
      already present or repeated, {{ importSummary.failed }} failed.
      <template v-if="importSummary.pending">{{ importSummary.pending }} still pending.</template>
    </p>
    <p v-if="importError" role="alert">{{ importError }}</p>
  </section>
</template>
