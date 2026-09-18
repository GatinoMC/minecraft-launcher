# GatinoLauncher 0.68.76

- Sustituye el actualizador PowerShell por el instalador NSIS estándar de Windows para evitar la detección heurística `Wacatac.B!ml`.
- Descarga las actualizaciones en segundo plano y las instala automáticamente al cerrar el launcher.
- Verifica el SHA-256 y la firma Ed25519 de GatinoLauncher antes de ejecutar cualquier instalador descargado.
- Mantiene el botón **Instalar ahora y reiniciar** para aplicar inmediatamente una actualización lista.

Las versiones 0.68.75 y anteriores deben instalar esta versión una vez mediante el instalador completo. A partir de aquí, las siguientes actualizaciones se aplicarán al cerrar el launcher.
