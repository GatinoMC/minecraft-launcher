# Auditoría técnica y de seguridad — MineLatino Launcher

Fecha: 2026-09-13  
Repositorios revisados:

- `GatinoMC/minecraft-launcher` (`main`, commit `a80be6c1`)
- `FredyGraces20/MineLatino-Backend` (`main`, commit `7120295`)
- `FredyGraces20/MineLatino-Cosmetics` (`main`, commit `02c8124`)
- Servicios públicos de Railway del launcher y de cosméticos

## Resumen ejecutivo

**Nivel de riesgo posterior a la remediación: MEDIO. Madurez de seguridad: media-alta.**

El proyecto tiene una base razonable: el renderer principal usa aislamiento de contexto y sandbox, los tokens de cuenta se almacenan hasheados en el backend de cosméticos, las contraseñas de jugadores usan `scrypt`, los orígenes privados se validan, los chequeos de tipos y lint no fallan y las auditorías de dependencias no detectaron vulnerabilidades conocidas.

Los dos hallazgos críticos y todos los hallazgos medios/bajos fueron corregidos. El contenido remoto ahora se sanitiza, cada invocación IPC se limita al origen exacto del renderer, las ventanas remotas no reciben preload privilegiado y las actualizaciones ASAR nuevas requieren una firma Ed25519 independiente. También se eliminó el proxy de red arbitrario, se endureció OptiFine, se fijaron las acciones CI por SHA, se activó Dependabot y los dos servicios Railway se desplegaron con los controles nuevos.

Queda un riesgo alto residual: el instalador público 0.68.64 no tiene firma Authenticode. El workflow ya bloquea la publicación si SignPath no devuelve una firma válida, pero faltan la aprobación/cuenta y las variables de SignPath. CurseForge y las noticias de Discord siguen degradados porque sus credenciales externas tampoco existen en Railway; `/health` ahora lo expresa como `status: degraded`.

Conteo de hallazgos:

| Severidad | Cantidad |
| --- | ---: |
| Crítica | 0 |
| Alta | 1 |
| Media | 0 |
| Baja | 0 |

## Estado de remediación

| ID | Estado final | Cambio principal |
| --- | --- | --- |
| SEC-001 | Resuelto | DOMPurify con política estricta, Markdown sin HTML y CSP del renderer |
| SEC-002 | Resuelto para releases nuevos | Firma Ed25519 obligatoria para el checksum ASAR; clave privada en GitHub Secrets |
| SEC-003 | Resuelto | Orígenes exactos para ventanas/navegación y validación del emisor IPC |
| SEC-004 | Resuelto y desplegado | Repositorio canónico `GatinoMC/minecraft-launcher` y puente Railway para clientes antiguos |
| SEC-005 | Pendiente externo | Workflow preparado; faltan credenciales/aprobación de SignPath |
| SEC-006 | Resuelto | Todas las acciones de workflows fijadas a commits inmutables |
| SEC-007 | Resuelto | `netFetch` y su handler principal fueron eliminados |
| SEC-008 | Resuelto | Sandbox, aislamiento, navegación exacta y preload mínimo para OptiFine |
| SEC-009 | Resuelto y desplegado | Límite 20/min por IP Railway y body máximo de 1 KiB |
| SEC-010 | Resuelto y desplegado | Node corre sin privilegios mediante `su-exec`; sólo `/data` se repara como root |
| SEC-011 | Resuelto | Alertas y actualizaciones de seguridad activadas; Dependabot npm/actions semanal |
| SEC-012 | Resuelto y desplegado | CSP con hashes exactos y `unsafe-hashes`, sin `unsafe-inline` |

## Alcance y método

Se hizo revisión estática enfocada en fronteras Electron (renderer/preload/main), HTML remoto, navegación, IPC, actualizaciones, secretos, autenticación, CORS, cabeceras, límites de recursos, contenedores y cadena de suministro. También se ejecutaron chequeos locales y consultas de sólo lectura contra GitHub/Railway. No se realizaron ataques destructivos, carga contra producción ni una prueba de penetración con credenciales reales.

## Hallazgos críticos

### SEC-001 — HTML remoto sin sanitizar alcanza un renderer Electron privilegiado

**Severidad:** Crítica  
**Estado:** Resuelto en `f89bd590` y `83b93d99`

**Ubicaciones:**

- `xmcl-keystone-ui/src/composables/curseforgeChangelog.ts:12-25`
- `xmcl-keystone-ui/src/composables/curseforge.ts:278-291`
- `xmcl-keystone-ui/src/components/MarketProjectDetailVersion.vue:102-105`
- `xmcl-keystone-ui/src/components/MarketProjectDetail.vue:426-431`
- `xmcl-keystone-ui/src/components/StoreProject.vue:57-60`
- `xmcl-electron-app/preload/service.ts:167-179,188-194`
- `xmcl-runtime/service/pluginServicesHandler.ts:95-120,189-209`
- `xmcl-keystone-ui/src/index.html:4-40`

**Evidencia:** las descripciones y changelogs recibidos de CurseForge se asignan a `root.innerHTML` y se devuelven sin un sanitizador. Después se renderizan con `v-html`. La página principal no define CSP. El preload expone `serviceChannels.call(...)` y `netFetch(...)`; el runtime despacha dinámicamente cualquier método que exista en cualquier servicio registrado, sin una lista permitida por método ni comprobación visible del origen del emisor.

**Impacto:** contenido malicioso o comprometido en CurseForge puede introducir manejadores de eventos/HTML activo. Si obtiene ejecución JavaScript en el renderer, puede invocar funciones privilegiadas del launcher, leer recursos de red y abusar de sesiones accesibles a la aplicación. La combinación convierte un XSS de contenido en una posible ejecución de código/capacidades locales.

**Corrección recomendada:** sanitizar todo HTML remoto con una política estricta (por ejemplo DOMPurify, prohibiendo eventos, SVG/MathML y URLs peligrosas); preferir Markdown renderizado con HTML deshabilitado; añadir una CSP estricta; crear una lista explícita de servicios y métodos IPC permitidos; validar `event.senderFrame.url` en main antes de cada operación privilegiada.

**Mitigación temporal:** deshabilitar la representación HTML de CurseForge y mostrar texto plano hasta publicar un cliente corregido.

**Posible falso positivo:** CurseForge podría aplicar saneamiento en su servidor, pero no existe garantía en el cliente ni defensa ante un compromiso aguas arriba. La aplicación de escritorio debe tratar esa respuesta como no confiable.

### SEC-002 — La autoactualización de `app.asar` no tiene autenticidad criptográfica independiente

**Severidad:** Crítica  
**Estado:** Resuelto para clientes/releases nuevos en `76c75aa5`

**Ubicaciones:**

- `xmcl-electron-app/main/utils/updater.ts:65-129`
- `xmcl-electron-app/main/utils/updater.ts:221-289`
- `xmcl-electron-app/main/utils/updater.ts:431-496`

**Evidencia:** el cliente descarga `app.asar` y su archivo adyacente `.sha256` desde el mismo release. Verifica que ambos coincidan y luego reemplaza el `app.asar` instalado. No se encontró una firma Ed25519/RSA del manifiesto o ASAR verificada con una clave pública embebida, ni fuses de integridad de ASAR.

**Impacto:** quien comprometa la cuenta de GitHub, un token de release o la ruta que produce el manifiesto puede publicar un ASAR malicioso y su SHA-256 correspondiente. El cliente lo aceptaría y lo ejecutaría al reiniciar. El hash detecta corrupción accidental, no demuestra autoría.

**Corrección recomendada:** firmar el manifiesto y cada ASAR con una clave de release protegida fuera de GitHub; incluir únicamente la clave pública en el launcher y verificar la firma antes de aceptar el hash. Evaluar `EnableEmbeddedAsarIntegrityValidation` y `OnlyLoadAppFromAsar` de Electron, además de conservar el chequeo SHA-256.

**Mitigación temporal:** deshabilitar la actualización ASAR y distribuir únicamente instaladores Authenticode firmados hasta implementar firmas de payload.

**Posible falso positivo:** HTTPS y el allowlist reducen ataques de red, pero no cubren el compromiso del productor del release; por eso no sustituyen una firma independiente.

## Hallazgos altos

### SEC-003 — Una ventana remota puede recibir el preload privilegiado usando `frameName = app`

**Severidad:** Alta  
**Estado:** Resuelto en `83b93d99`

**Ubicación:** `xmcl-electron-app/main/ElectronController.ts:63-97`

**Evidencia:** el manejador permite la ventana si `url.host === 'app'` **o** `detail.frameName === 'app'`. La segunda condición no restringe URL/protocolo y configura `preload: indexPreload`.

**Impacto:** una llamada como `window.open(urlRemota, 'app')`, especialmente desde el HTML no confiable del hallazgo SEC-001, puede abrir contenido remoto con el puente privilegiado del launcher.

**Corrección recomendada:** exigir siempre el origen interno exacto para cargar el preload; nunca usar el nombre del frame como frontera de confianza. Establecer explícitamente `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, y rechazar protocolos distintos de los internos esperados.

**Mitigación temporal:** eliminar la excepción `detail.frameName === 'app'`.

### SEC-004 — El canal de actualización publicado no coincide con el allowlist del cliente

**Severidad:** Alta (disponibilidad de parches)  
**Estado:** Resuelto en `76c75aa5` y backend `9c0e9ee`; desplegado en Railway

**Ubicaciones:**

- `xmcl-electron-app/main/utils/updater.ts:177-193`
- `xmcl-electron-app/build/electron-builder.config.ts:29-30`

**Evidencia:** `GET https://minelatino-production.up.railway.app/api/release?version=0.68.63` anuncia v0.68.64 con assets bajo `https://github.com/GatinoMC/minecraft-launcher/releases/download/...`. `trustedUpdateUrl` sólo permite `/FredyGraces20/MineLatino-Launcher/releases/download/` o el origen de Railway, por lo que lanza `Untrusted update origin`.

**Impacto:** usuarios de versiones anteriores no pueden recibir 0.68.64 ni futuros parches por el mecanismo normal. Esto aumenta la ventana de exposición de cualquier vulnerabilidad corregida.

**Corrección recomendada:** definir una única identidad de release compartida entre build, manifiesto y updater. Para clientes ya publicados, crear un release puente en el repositorio antiguo confiable o servir el artefacto desde el origen de Railway que ya aceptan; cambiar sólo el cliente nuevo no repara a los clientes antiguos.

**Mitigación temporal:** retirar el anuncio roto o publicar/copiar los assets en el origen antiguo permitido hasta distribuir un updater migrado y firmado.

### SEC-005 — El instalador público de Windows no está firmado

**Severidad:** Alta  
**Estado:** Pendiente por dependencia externa de SignPath

**Ubicaciones:**

- `.github/workflows/sign-release.yml:97-154`
- `xmcl-electron-app/build/electron-builder.config.ts:114-116`

**Evidencia:** `Get-AuthenticodeSignature` sobre `minelatino-0.68.64-win32-x64.exe` devuelve `NotSigned`; SHA-256 `9fdb5f6378b9b82290a15c7beb871d8c01363d1d675d6f29307b6e2f87b6dbc3`, coincidente con el asset público. Existe un workflow SignPath que verifica la firma antes de reemplazar el asset, pero GitHub muestra cero ejecuciones para `sign-release.yml`.

**Impacto:** Windows no puede verificar el editor, aumenta el riesgo de suplantación/manipulación y empeora SmartScreen. Los usuarios no tienen una señal confiable de que el binario proviene de MineLatino.

**Corrección recomendada:** completar la configuración de SignPath, ejecutar el workflow para cada tag y bloquear la publicación/promoción de un release si la firma no es `Valid`.

**Mitigación temporal:** publicar de forma destacada el SHA-256 por un canal separado y advertir que el instalador aún no está firmado. No equivale a Authenticode.

### SEC-006 — Acciones de CI sensibles están referenciadas por tags mutables

**Severidad:** Alta  
**Estado:** Resuelto en `aa0ac19e`

**Ubicaciones:**

- `.github/workflows/sign-release.yml:48-106`
- `.github/workflows/build.yml:31-52,264-322`
- `.github/workflows/deploy-release.yml:13-28,103`

**Evidencia:** workflows con permisos de escritura y secretos usan acciones como `signpath/github-action-submit-signing-request@v2`, `pnpm/action-setup@v6`, `ci010/upload-blob-to-azure@master` y otras por tag/rama, no por SHA inmutable.

**Impacto:** si una acción de terceros o su tag es comprometido, una ejecución puede exfiltrar secretos de firmado/despliegue o modificar releases.

**Corrección recomendada:** fijar cada acción de terceros a un SHA de commit revisado, aplicar permisos mínimos por job, usar environments con aprobación para firmado/release y rotar credenciales si alguna acción dudosa llegó a ejecutarse.

**Mitigación temporal:** no ejecutar workflows de publicación/firma hasta fijar las dependencias de CI.

## Hallazgos medios

### SEC-007 — Proxy HTTP arbitrario desde el renderer (SSRF y lectura de red local)

**Severidad:** Media  
**Estado:** Resuelto en `83b93d99`

**Ubicaciones:**

- `xmcl-electron-app/preload/service.ts:190-194`
- `xmcl-electron-app/main/controllers/windowController.ts:188-239`

**Evidencia:** `window.netFetch(url)` llega a `http.request`/`https.request`, sigue hasta cinco redirects y no restringe host, protocolo final, IP privada/loopback, tamaño de respuesta ni emisor IPC.

**Impacto:** un renderer comprometido puede consultar servicios locales, metadatos de nube o respuestas internas y cargar contenido sin límite de tamaño en memoria.

**Corrección recomendada:** allowlist de hosts/paths, validar cada redirect, bloquear loopback/redes privadas/link-local, limitar bytes, aceptar sólo HTTPS cuando sea posible y validar el sender.

### SEC-008 — Resolver remoto de OptiFine sin sandbox ni aislamiento de contexto

**Severidad:** Media  
**Estado:** Resuelto en `83b93d99`

**Ubicaciones:**

- `xmcl-electron-app/main/controllers/optifine.ts:58-81,85-128`
- `xmcl-electron-app/preload/optifine.ts:129-145`

**Evidencia:** una `BrowserWindow` oculta carga `https://optifined.net/downloads` con `contextIsolation: false`, `sandbox: false` y un preload que usa IPC. No se observó un guard de navegación/origen para esa ventana.

**Impacto:** eleva el daño posible si el sitio remoto, una redirección o Chromium son comprometidos; además el contenido remoto controla los datos de descarga extraídos por el preload.

**Corrección recomendada:** `contextIsolation: true`, `sandbox: true`, preload mínimo con `contextBridge`, navegación limitada exactamente a `https://optifined.net`, validación de las URLs extraídas y cierre inmediato tras resolver.

### SEC-009 — El endpoint público de desafíos de tiempo de juego permite agotar el cupo global

**Severidad:** Media  
**Estado:** Resuelto en backend `9c0e9ee`; desplegado en Railway

**Ubicaciones:**

- `../MineLatino-Backend/src/playtimeAuth.ts:3-6,27-53`
- `../MineLatino-Backend/src/index.ts:210-220`

**Evidencia:** cualquier cliente puede crear desafíos de 60 segundos; el único límite visible es un mapa global de 1.000 elementos. No hay límite por IP/usuario en la ruta.

**Impacto:** un atacante puede llenar repetidamente el mapa y provocar `429` a todos los jugadores, impidiendo nuevas sesiones de tiempo de juego.

**Corrección recomendada:** rate limiting por IP/usuario en aplicación y Railway/edge, cuotas más pequeñas por origen, métricas de rechazos y límites de body/concurrencia.

### SEC-010 — El contenedor de cosméticos corre como root

**Severidad:** Media  
**Estado:** Resuelto en cosméticos `ef9e7b3`; desplegado en Railway

**Ubicación:** `../MineLatino-Cosmetics/Dockerfile:1-10`

**Evidencia:** usa `node:24-alpine` pero no declara `USER`; por defecto el proceso se ejecuta como root.

**Impacto:** una futura ejecución remota de código tendría mayores privilegios dentro del contenedor y sobre volúmenes montados.

**Corrección recomendada:** copiar con ownership adecuado, preparar `/data` con permisos mínimos y ejecutar como el usuario `node` o un UID/GID dedicado. Añadir filesystem de sólo lectura cuando Railway lo permita.

## Hallazgos bajos

### SEC-011 — Dependabot está deshabilitado

**Severidad:** Baja  
**Estado:** Resuelto en GitHub y `aa0ac19e`

**Evidencia:** la API responde `403: Dependabot alerts are disabled for this repository`.

**Impacto:** aunque las auditorías de hoy están limpias, no habrá alerta continua automática al publicarse una vulnerabilidad nueva.

**Corrección recomendada:** habilitar Dependency Graph, Dependabot alerts/security updates y añadir dependency review/auditoría en CI.

### SEC-012 — La CSP del panel administrativo permite scripts y estilos inline

**Severidad:** Baja  
**Estado:** Resuelto en cosméticos `ef9e7b3`; desplegado y verificado

**Ubicación:** `../MineLatino-Cosmetics/service/src/http.mjs:9` y HTML servido desde `service/public/index.html`

**Evidencia:** la respuesta pública incluye `script-src 'self' 'unsafe-inline'` y `style-src 'self' 'unsafe-inline'`. El token administrativo se mantiene en memoria del JavaScript, lo cual es positivo, pero cualquier XSS dentro del panel tendría acceso a esa sesión.

**Impacto:** reduce la protección de CSP ante una futura inyección.

**Corrección recomendada:** mover scripts/estilos a archivos estáticos o usar nonce/hash; retirar `'unsafe-inline'` al menos de `script-src`.

## Fallos funcionales y operativos observados

### OPS-001 — Actualización 0.68.64 publicada pero no instalable

**Resuelto.** El manifiesto entrega URLs bajo el origen Railway ya confiable y ese endpoint redirige únicamente a assets con nombre válido del repositorio canónico de GatinoMC.

### OPS-002 — CurseForge no está configurado en producción

**Pendiente de credencial externa.** `/health` informa `ready.curseforgeApiKey:false` y `status: degraded`. El proxy permanece cerrado de forma segura hasta configurar `CURSEFORGE_API_KEY`.

### OPS-003 — Noticias de Discord vacías

**Pendiente de credencial externa.** `/health` informa `ready.discordBotToken:false` y `status: degraded`; falta configurar `DISCORD_BOT_TOKEN`.

### OPS-004 — Advertencias de estilo

**Resuelto.** `pnpm lint` finaliza con cero advertencias y cero errores. Se corrigieron las tres comparaciones no estrictas detectadas originalmente:

- `xmcl-keystone-ui/src/views/minelatino/MineLatinoStoreScreen.vue:266`
- `xmcl-keystone-ui/src/composables/minelatino.ts:373`
- `xmcl-keystone-ui/src/composables/minelatino.ts:378`

No son vulnerabilidades por sí solas, pero conviene corregirlas para evitar coerciones inesperadas.

## Controles positivos verificados

- Ventana principal: `contextIsolation: true` y `sandbox: true` (`ElectronController.ts:349-354`).
- Ventanas web de MineLatino: sin preload, `nodeIntegration: false`, aislamiento y sandbox activos.
- OAuth de Microsoft valida origen y ruta de redirect y usa una ventana aislada.
- Backend de CurseForge restringe rutas, oculta la clave, limita el body y no sigue redirects arbitrarios.
- Servicio de cosméticos rechaza orígenes ajenos en endpoints de cuenta/admin; pruebas desde `https://evil.example` devolvieron 403.
- Cabeceras de cosméticos: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`, `Cache-Control: no-store`.
- Contraseñas de jugadores con `scrypt`, sal aleatoria y comparación constante; tokens persistentes hasheados con SHA-256; sesiones auxiliares cortas y vinculadas a la sesión padre.
- No se encontraron `.env`, claves privadas, certificados o keystores versionados con los patrones inspeccionados.

## Verificaciones ejecutadas

| Verificación | Resultado |
| --- | --- |
| `pnpm check` (launcher) | Correcto |
| `pnpm lint` (launcher) | Correcto, 0 advertencias y 0 errores |
| Tests enfocados (firma/orígenes/sanitización/updater) | 8/8 correctos |
| `pnpm audit --prod` | 0 vulnerabilidades conocidas |
| Backend `npm test` | 7/7 correctos |
| Backend `npm run typecheck` | Correcto |
| Backend `npm audit --omit=dev` | 0 vulnerabilidades |
| Cosméticos `node --check` | Correcto |
| Cosméticos `npm test` | 88/88 correctos |
| Firma del instalador 0.68.64 | `NotSigned` |
| GitHub Actions `Validate` en `aa0ac19e` | Correcto: lint, tipos, tests y build |
| Railway launcher `/health` | HTTP 200, `status: degraded`; sólo faltan CurseForge y Discord |
| Puente Railway → GatinoMC | HTTP 302 al asset canónico esperado |
| Railway cosméticos | Deploy `SUCCESS`; CSP 5.615 bytes, hashes presentes, sin `unsafe-inline` |
| Origen hostil contra cuenta/admin de cosméticos | HTTP 403 |

## Próximas acciones pendientes

1. Completar el alta de SignPath, configurar sus cuatro variables y `SIGNPATH_API_TOKEN`, y ejecutar el workflow de firma para el próximo tag. No promover otro instalador sin Authenticode válido.
2. Crear/configurar `CURSEFORGE_API_KEY` y `DISCORD_BOT_TOKEN` en Railway; comprobar que `/health` cambie de `degraded` a `ready`.
3. Publicar el siguiente release desde un tag que contenga la verificación Ed25519 y conservar el secreto `ASAR_SIGNING_PRIVATE_KEY` sólo en GitHub Actions.

## Limitaciones

Esta auditoría no garantiza ausencia de vulnerabilidades. No incluyó pentest autenticado, fuzzing, análisis SAST comercial, revisión de configuración interna de cuentas Railway/GitHub (2FA, miembros, logs, backups), ni validación de infraestructura fuera de lo observable desde repositorios y endpoints públicos. Es recomendable repetir la revisión después de las correcciones y antes de distribuir un instalador firmado.
