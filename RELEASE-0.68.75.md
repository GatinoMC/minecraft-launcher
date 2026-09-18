GatinoLauncher 0.68.75 reemplaza el actualizador que podía cerrarse sin instalar ni volver a abrir el launcher.

- Descarga automáticamente en segundo plano las actualizaciones internas firmadas.
- Instala la actualización automáticamente cuando el usuario cierra GatinoLauncher.
- Permite instalar inmediatamente con el botón **Instalar ahora y reiniciar**.
- Ejecuta el reemplazo mediante Windows PowerShell oculto, fuera de Electron, para que `app.asar` no permanezca bloqueado.
- Comprueba la firma Ed25519 y SHA-256 antes de preparar la actualización.
- Espera a que terminen todos los procesos del launcher, vuelve a abrir GatinoLauncher y confirma que arrancó correctamente.
- Restaura automáticamente la versión anterior si el nuevo launcher no logra iniciar.

Las versiones anteriores reciben el instalador completo de esta versión para salir del actualizador defectuoso. Desde 0.68.75, las siguientes actualizaciones se descargarán solas y se instalarán al cerrar el launcher.
