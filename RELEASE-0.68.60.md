# MineLatino Launcher 0.68.60

- Elimina por completo `cmd.exe` y los archivos `.bat` del proceso de actualización automática.
- Aplica la actualización con un proceso auxiliar interno y oculto del propio launcher, sin mostrar Windows Command Processor ni solicitar elevación.
- Mantiene el reemplazo seguro: descarga y verifica primero, conserva una copia de respaldo y restaura la versión anterior si el cambio falla.
- Elimina automáticamente el antiguo `AutoUpdate.bat` que pudiera haber quedado de una versión previa.
