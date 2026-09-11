# MineLatino Launcher 0.68.40

- La actualización automática descarga y verifica primero el nuevo mod.
- El mod anterior se conserva si falla la descarga, el tamaño, el hash SHA-1 o la instalación.
- Las versiones antiguas se eliminan únicamente después de confirmar que el nuevo JAR quedó instalado.
- Si la limpieza falla, el launcher la vuelve a intentar en la siguiente sincronización.
- La comprobación también limpia versiones antiguas que hayan quedado junto a la versión actual.

Validación: comprobación de tipos del proceso principal y compilación de producción.
