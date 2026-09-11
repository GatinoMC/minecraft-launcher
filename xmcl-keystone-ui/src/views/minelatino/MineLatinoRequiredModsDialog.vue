<template>
  <v-dialog
    v-model="isShown"
    :width="520"
    :persistent="true"
    transition="fade-transition"
  >
    <v-card
      class="relative select-none"
      data-testid="minelatino-required-mods"
    >
      <v-btn
        icon="close"
        variant="text"
        density="comfortable"
        size="small"
        class="absolute right-3 top-3 z-1"
        :aria-label="t('MineLatinoRequiredMods.cancel')"
        @click="onCancel"
      />
      <div class="flex flex-col items-center px-8 pb-4 pt-10 text-center">
        <v-avatar
          color="warning"
          variant="tonal"
          size="72"
          rounded="xl"
          class="mb-6"
        >
          <v-icon size="36" color="warning">
            extension_off
          </v-icon>
        </v-avatar>
        <h3 class="mb-3 text-xl font-bold">
          {{ t('MineLatinoRequiredMods.title') }}
        </h3>
        <p class="max-w-prose text-sm opacity-70 leading-relaxed">
          {{ t('MineLatinoRequiredMods.description', { server: serverName }) }}
        </p>
      </div>

      <v-list
        density="compact"
        class="mx-4 mb-2 bg-transparent"
      >
        <v-list-item
          v-for="mod in missing"
          :key="mod"
          rounded="lg"
          prepend-icon="search"
          :title="mod"
          :subtitle="t('MineLatinoRequiredMods.openInStore')"
          :data-testid="`minelatino-required-mod-${mod}`"
          @click="onOpenStore(mod)"
        />
      </v-list>

      <v-divider class="opacity-50" />

      <v-card-actions class="px-6 pb-6 pt-4">
        <v-spacer />
        <v-btn
          variant="text"
          rounded="pill"
          data-testid="minelatino-required-mods-cancel"
          @click="onCancel"
        >
          {{ t('MineLatinoRequiredMods.cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          rounded="pill"
          data-testid="minelatino-required-mods-play"
          @click="onPlay"
        >
          {{ t('MineLatinoRequiredMods.playAnyway') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
export const MineLatinoRequiredModsDialogKey = 'minelatino-required-mods'

export interface MineLatinoRequiredModsParameter {
  /** The `server.requiredMods` entries the selected instance does not have. */
  missing: string[]
  /** Invoked when the player picks "Play anyway". The launch continues. */
  onPlay?: () => void
  /** Invoked when the player cancels or leaves to install a mod. */
  onCancel?: () => void
}
</script>

<script lang="ts" setup>
import { useDialog } from '@/composables/dialog'
import { kInstance } from '@/composables/instance'
import { kInstanceModsContext } from '@/composables/instanceMods'
import { kLaunchButton } from '@/composables/launchButton'
import { findMissingRequiredMods, useMineLatinoConfig } from '@/composables/minelatino'
import { injection } from '@/util/inject'
import { isBedrockInstance } from '@xmcl/instance'

const { t } = useI18n()
const router = useRouter()
const { isShown, hide, show, parameter } = useDialog<MineLatinoRequiredModsParameter>(
  MineLatinoRequiredModsDialogKey,
)
const { instance } = injection(kInstance)
const { mods, isValidating } = injection(kInstanceModsContext)
const { usePreclickListener } = injection(kLaunchButton)
const config = useMineLatinoConfig()

const missing = computed(() => parameter.value?.missing ?? [])
const serverName = computed(() => config.value?.server.name || 'MineLatino')

/**
 * Whether the mod list can be trusted.
 *
 * `useState` starts with `isValidating === false` and only flips it a tick
 * later, and switching instances clears the list before the next scan, so an
 * unguarded check would report *every* required mod as missing during those
 * windows. Arming on the first emitted list and disarming while a scan runs
 * makes the warning fail open instead — missing a warning is far better than
 * blocking a launch with a false one.
 */
const modsReady = shallowRef(false)
watch(mods, () => { modsReady.value = true })
watch(isValidating, (validating) => { if (validating) modsReady.value = false })

/**
 * Intercepts the launch chain the same way `AppUnauthenticatedWarningDialog`
 * does: rejecting aborts it (the launch button swallows the rejection),
 * resolving lets it through. The check itself is purely in-memory — the
 * subscribed config against the mods XMCL already parsed — so launches that do
 * not need it pay nothing.
 */
usePreclickListener(() => {
  const required = config.value?.server.requiredMods
  if (!required || required.length === 0) return
  if (isBedrockInstance(instance.value)) return
  if (!modsReady.value || isValidating.value) return
  const absent = findMissingRequiredMods(required, mods.value)
  if (absent.length === 0) return
  return new Promise<void>((resolve, reject) => {
    show({
      missing: absent,
      onPlay: resolve,
      onCancel: () => reject(new Error('MineLatinoRequiredModsLaunchCancelled')),
    })
  })
})

function onPlay() {
  parameter.value?.onPlay?.()
  hide()
}

function onCancel() {
  parameter.value?.onCancel?.()
  hide()
}

/**
 * The remedy is XMCL's own Modrinth page for the project, which already knows
 * how to install a compatible version into the selected instance. Nothing here
 * downloads anything, and the launch is cancelled because the player has just
 * asked to go and fix the profile.
 */
function onOpenStore(projectId: string) {
  onCancel()
  router.push(`/store/modrinth/${encodeURIComponent(projectId)}`)
}
</script>
