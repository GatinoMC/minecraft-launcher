<template>
  <div>
    <v-btn variant="tonal" prepend-icon="person" :loading="loading" @click="open">
      {{ account ? account.nick : 'Cuenta MineLatino' }}
    </v-btn>
    <v-dialog v-model="dialog" max-width="560">
      <v-card class="account-card">
        <v-card-title class="account-title">
          <span>{{ title }}</span>
          <v-btn icon="close" variant="text" aria-label="Cerrar" @click="dialog = false" />
        </v-card-title>
        <v-card-text>
          <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
          <v-alert v-if="success" type="success" variant="tonal" class="mb-4">{{ success }}</v-alert>
          <template v-if="account">
            <div class="identity-box">
              <div><small>IDENTIDAD INTERNA</small><strong>{{ account.nick }}</strong><span>{{ account.accountId }}</span></div>
              <v-chip color="success" size="small" variant="tonal">Activa</v-chip>
            </div>
            <v-text-field v-model="email" label="Correo" type="email" autocomplete="email" readonly hint="Para cambiarlo, solicita verificación al soporte." persistent-hint />
            <v-text-field v-model="nick" label="Nick de Minecraft" maxlength="16" counter="16" />
            <p class="hint">Tus compras pertenecen al ID interno. Para mostrar cosméticos en servidores offline, el nick debe identificar una sola cuenta.</p>
            <v-text-field v-model="reauthPassword" label="Contraseña actual para guardar o eliminar" type="password" autocomplete="current-password" />
            <button class="password-toggle" type="button" @click="changingPassword = !changingPassword">
              <v-icon size="18">key</v-icon>{{ changingPassword ? 'Cancelar cambio de contraseña' : 'Cambiar contraseña' }}
            </button>
            <div v-if="changingPassword" class="password-panel">
              <v-text-field v-model="currentPassword" label="Contraseña actual" type="password" autocomplete="current-password" />
              <v-text-field v-model="newPassword" label="Contraseña nueva" type="password" autocomplete="new-password" hint="Entre 10 y 128 caracteres" />
              <v-text-field v-model="confirmPassword" label="Repite la contraseña nueva" type="password" autocomplete="new-password" />
              <v-btn color="primary" :loading="loading" @click="changePassword">Actualizar contraseña</v-btn>
            </div>
          </template>
          <template v-else>
            <div v-if="mode === 'register' || mode === 'login'" class="mode-tabs">
              <button :class="{ active: mode === 'register' }" @click="mode = 'register'">Crear cuenta</button>
              <button :class="{ active: mode === 'login' }" @click="mode = 'login'">Ya tengo cuenta</button>
            </div>
            <v-text-field v-model="email" label="Correo" type="email" autocomplete="email" />
            <v-text-field v-if="mode === 'register'" v-model="nick" label="Nick que usarás" maxlength="16" counter="16" />
            <v-text-field v-if="mode === 'register' || mode === 'login'" v-model="password" label="Contraseña" type="password" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" />
            <template v-if="mode === 'reset'">
              <v-text-field v-model="recoveryCode" label="Código de recuperación" autocomplete="one-time-code" placeholder="XXXX-XXXX-XXXX" />
              <v-text-field v-model="newPassword" label="Contraseña nueva" type="password" autocomplete="new-password" hint="Entre 10 y 128 caracteres" />
              <v-text-field v-model="confirmPassword" label="Repite la contraseña nueva" type="password" autocomplete="new-password" />
            </template>
            <p v-if="mode === 'forgot'" class="hint">Si existe una cuenta con este correo, enviaremos un código temporal. Si el correo automático no está configurado, el soporte de MineLatino podrá generarlo desde el panel.</p>
            <p v-else-if="mode === 'reset'" class="hint">El código funciona una sola vez y caduca después de 15 minutos.</p>
            <p v-else class="hint">Esta cuenta funciona con Minecraft premium y no premium. La contraseña nunca se entrega al mod.</p>
            <button v-if="mode === 'login'" class="forgot-link" type="button" @click="beginRecovery">Olvidé mi contraseña</button>
            <button v-if="mode === 'forgot' || mode === 'reset'" class="forgot-link" type="button" @click="mode = 'login'; clearMessages()">Volver al inicio de sesión</button>
          </template>
        </v-card-text>
        <v-card-actions class="account-actions">
          <template v-if="account">
            <v-btn color="error" variant="text" :disabled="loading" @click="removeAccount">Eliminar cuenta</v-btn>
            <v-btn variant="text" :disabled="loading" @click="logout">Cerrar sesión</v-btn>
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="save">Guardar cambios</v-btn>
          </template>
          <template v-else>
            <v-spacer />
            <v-btn color="primary" :loading="loading" @click="submitCurrentMode">
              {{ actionLabel }}
            </v-btn>
          </template>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { useService } from '@/composables/service'
import { MineLatinoServiceKey, type MineLatinoCosmeticsAccount } from '@xmcl/runtime-api'

const props = defineProps<{ suggestedNick?: string }>()
const emit = defineEmits<{ changed: [account: MineLatinoCosmeticsAccount | undefined] }>()
const service = useService(MineLatinoServiceKey)
const account = ref<MineLatinoCosmeticsAccount>()
const dialog = ref(false), loading = ref(false), error = ref(''), success = ref(''), mode = ref<'register' | 'login' | 'forgot' | 'reset'>('register')
const email = ref(''), nick = ref(''), password = ref('')
const recoveryCode = ref(''), currentPassword = ref(''), newPassword = ref(''), confirmPassword = ref('')
const reauthPassword = ref('')
const changingPassword = ref(false)
const title = computed(() => account.value ? 'Tu cuenta de cosméticos' : ({ register: 'Crear cuenta MineLatino', login: 'Iniciar sesión', forgot: 'Recuperar contraseña', reset: 'Crear contraseña nueva' })[mode.value])
const actionLabel = computed(() => ({ register: 'Crear cuenta', login: 'Entrar', forgot: 'Enviar código', reset: 'Cambiar contraseña' })[mode.value])

function clearMessages() { error.value = ''; success.value = '' }

async function refresh() {
  loading.value = true
  try {
    account.value = await service.getCosmeticsAccount()
    emit('changed', account.value)
    email.value = account.value?.email || ''
    nick.value = account.value?.nick || props.suggestedNick || ''
  } finally { loading.value = false }
}
async function open() { dialog.value = true; clearMessages(); await refresh() }
async function submit() {
  error.value = ''; loading.value = true
  try {
    account.value = mode.value === 'register'
      ? await service.registerCosmeticsAccount({ email: email.value.trim(), password: password.value, nick: nick.value.trim() })
      : await service.loginCosmeticsAccount({ email: email.value.trim(), password: password.value })
    password.value = ''; email.value = account.value.email; nick.value = account.value.nick
    emit('changed', account.value)
  } catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo iniciar la sesión' }
  finally { loading.value = false }
}
function beginRecovery() { clearMessages(); mode.value = 'forgot'; password.value = '' }
async function requestReset() {
  clearMessages(); loading.value = true
  try {
    const result = await service.requestCosmeticsPasswordReset(email.value.trim())
    success.value = result.delivery === 'email'
      ? 'Si el correo pertenece a una cuenta, recibirás un código de recuperación.'
      : 'Solicitud registrada. Pide al soporte de MineLatino que genere tu código de recuperación.'
    mode.value = 'reset'
  } catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo solicitar la recuperación' }
  finally { loading.value = false }
}
async function resetPassword() {
  clearMessages()
  if (newPassword.value !== confirmPassword.value) { error.value = 'Las contraseñas nuevas no coinciden'; return }
  loading.value = true
  try {
    await service.resetCosmeticsPassword({ email: email.value.trim(), code: recoveryCode.value.trim(), password: newPassword.value })
    recoveryCode.value = ''; newPassword.value = ''; confirmPassword.value = ''; password.value = ''
    mode.value = 'login'; success.value = 'Contraseña actualizada. Ya puedes iniciar sesión.'
  } catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo cambiar la contraseña' }
  finally { loading.value = false }
}
async function submitCurrentMode() {
  if (mode.value === 'forgot') return requestReset()
  if (mode.value === 'reset') return resetPassword()
  return submit()
}
async function changePassword() {
  clearMessages()
  if (newPassword.value !== confirmPassword.value) { error.value = 'Las contraseñas nuevas no coinciden'; return }
  loading.value = true
  try {
    await service.changeCosmeticsPassword({ currentPassword: currentPassword.value, password: newPassword.value })
    account.value = undefined; emit('changed', undefined); mode.value = 'login'; changingPassword.value = false
    currentPassword.value = ''; newPassword.value = ''; confirmPassword.value = ''; password.value = ''
    success.value = 'Contraseña actualizada. Por seguridad, vuelve a iniciar sesión.'
  } catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo cambiar la contraseña' }
  finally { loading.value = false }
}
async function save() {
  if (!reauthPassword.value) { error.value = 'Escribe tu contraseña actual para guardar los cambios'; return }
  error.value = ''; loading.value = true
  try {
    account.value = await service.updateCosmeticsAccount({ email: email.value.trim(), nick: nick.value.trim(), currentPassword: reauthPassword.value })
    reauthPassword.value = ''; emit('changed', account.value)
  }
  catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo actualizar la cuenta' }
  finally { loading.value = false }
}
async function logout() {
  loading.value = true
  try { await service.logoutCosmeticsAccount(); account.value = undefined; emit('changed', undefined); password.value = ''; mode.value = 'login' }
  finally { loading.value = false }
}
async function removeAccount() {
  if (!reauthPassword.value) { error.value = 'Escribe tu contraseña actual para eliminar la cuenta'; return }
  if (!confirm('¿Eliminar tu cuenta MineLatino? Se cerrarán todas las sesiones y dejarás de usar los cosméticos.')) return
  loading.value = true
  try { await service.deleteCosmeticsAccount(reauthPassword.value); reauthPassword.value = ''; account.value = undefined; emit('changed', undefined); dialog.value = false }
  catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo eliminar la cuenta' }
  finally { loading.value = false }
}

onMounted(refresh)
</script>

<style scoped>
.account-card { background: #171a21 !important; border: 1px solid #ffffff20; border-radius: 20px !important; }
.account-title { display: flex; justify-content: space-between; align-items: center; white-space: normal; }
.identity-box { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px; margin-bottom: 18px; border: 1px solid #ffffff14; border-radius: 14px; background: #ffffff06; }
.identity-box div { min-width: 0; display: flex; flex-direction: column; }.identity-box small { color: #9ca3b4; font-size: 10px; letter-spacing: .12em; }.identity-box span { color: #8d94a5; font: 10px monospace; overflow-wrap: anywhere; }
.mode-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 4px; margin-bottom: 20px; border-radius: 12px; background: #0f1218; }.mode-tabs button { padding: 10px; border-radius: 9px; color: #9ca3b4; }.mode-tabs button.active { color: #f2f4f8; background: #ffffff10; }
.hint { color: #9ca3b4; font-size: 12px; line-height: 1.55; }.account-actions { padding: 10px 20px 18px; flex-wrap: wrap; }
.forgot-link, .password-toggle { display: inline-flex; align-items: center; gap: 7px; margin-top: 8px; color: #53dfed; font-size: 13px; }
.forgot-link:hover, .password-toggle:hover { text-decoration: underline; }
.password-panel { margin-top: 14px; padding: 16px; border: 1px solid #53dfed30; border-radius: 14px; background: #0d121a; }
</style>
