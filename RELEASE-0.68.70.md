GatinoLauncher 0.68.70 corrige el flujo de actualización en Windows y añade un instalador de recuperación.

- Espera a que terminen todos los procesos de Electron antes de reemplazar `app.asar`.
- Conserva la verificación Ed25519 y SHA-256 del paquete interno.
- Registra cada fase, revierte el cambio si falla y vuelve a abrir el launcher.
- Incluye un instalador `.exe` para actualizar instalaciones atascadas en versiones anteriores.

El instalador todavía no tiene Authenticode y Windows puede mostrar “Editor desconocido”. Su SHA-256 se publica junto al archivo; las actualizaciones internas continúan firmadas y verificadas por el launcher.
