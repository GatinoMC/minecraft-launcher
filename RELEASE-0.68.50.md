# MineLatino Launcher 0.68.50

- Corrige el fallo del actualizador al no existir todavía el archivo `pending_update`.
- La primera actualización ya no intenta ejecutar `toLowerCase()` sobre un checksum inexistente.
- Verifica el SHA-256 después de descargar antes de sustituir `app.asar`.
- Las versiones anteriores reciben temporalmente el instalador completo como ruta de recuperación.
