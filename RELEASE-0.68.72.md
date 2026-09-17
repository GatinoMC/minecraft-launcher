GatinoLauncher 0.68.72 corrige la sesión de Microsoft y completa el flujo seguro de actualización en Windows.

- Mantiene la cuenta Microsoft seleccionada mediante su identificador estable y evita mostrar el selector en cada inicio.
- Los errores temporales de red o de Mojang ya no invalidan la sesión guardada.
- Cerrar sesión elimina el token local y la cuenta correspondiente de la caché de autenticación.
- El launcher espera una confirmación real del auxiliar antes de cerrarse y confirma que la versión nueva arrancó correctamente.
- Si la versión nueva no inicia, restaura el `app.asar` anterior y vuelve a abrir el launcher.
- Las actualizaciones manuales abren el instalador y nunca se confunden con “Reiniciar para instalar”.
- Limpia descargas pendientes antiguas y evita marcar como lista una descarga cancelada.
- Railway descubre automáticamente la última publicación estable de GitHub y deja de quedarse fijado a una versión anterior.

El instalador de Windows todavía puede mostrar “Editor desconocido” mientras no disponga de una firma Authenticode. Los paquetes internos continúan protegidos mediante SHA-256 y firma Ed25519.
