import type { RendererActionEnd, RendererActionStart } from '@xmcl/runtime-api'
import type { LauncherAppPlugin } from '~/app'
import {
  endRendererAction,
  setRuntimeTelemetryEnabled,
  startRendererAction,
} from '~/infra'

/**
 * MineLatino deliberately keeps launcher diagnostics local. The renderer IPC
 * handlers remain registered so callers do not fail, but no account, crash,
 * resource or usage data is exported to XMCL, Azure, or another third party.
 */
export const pluginTelemetry: LauncherAppPlugin = async (app) => {
  setRuntimeTelemetryEnabled(false)
  app.controller.handle('renderer-telemetry-exception', () => undefined)
  app.controller.handle('renderer-telemetry-flush', async () => undefined)
  app.controller.handle('renderer-telemetry-action-start', (_, action: RendererActionStart) => startRendererAction(action))
  app.controller.handle('renderer-telemetry-action-end', (_, action: RendererActionEnd) => endRendererAction(action))
  app.getLogger('Telemtry').log('External telemetry disabled by MineLatino policy')
}
