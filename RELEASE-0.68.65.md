MineLatino Launcher 0.68.65 para Windows x64.

- Sanitiza el contenido remoto y deshabilita HTML activo en Markdown.
- Restringe ventanas, navegación e IPC a los orígenes internos exactos del launcher.
- Elimina el proxy de red arbitrario y aísla el resolver remoto de OptiFine.
- Migra definitivamente las actualizaciones al repositorio `GatinoMC/minecraft-launcher`.
- Exige firmas Ed25519 independientes para las futuras actualizaciones de `app.asar`.
- Corrige el puente de actualización para instalaciones anteriores.

Descarga el archivo `.exe` para instalar, o el `.zip` para extraer el launcher.
También se publican checksums SHA-256 y el ASAR firmado para actualizaciones futuras.

**Aviso:** este instalador todavía no tiene firma Authenticode. Verifica el SHA-256
publicado antes de ejecutarlo. La integración de Authenticode se habilitará cuando
finalice la configuración externa de SignPath.
