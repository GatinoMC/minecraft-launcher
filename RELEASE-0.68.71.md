GatinoLauncher 0.68.71 para Windows y Linux corrige el registro global de horas e incorpora las mejoras recientes del menú ESC y AFK Farm.

- Suma las horas de todos los perfiles del launcher, incluidos los perfiles antiguos retirados, en una única clasificación por usuario.
- Reconcilia el historial sin duplicarlo, admite cuentas Microsoft y offline, y envía checkpoints cada minuto para reducir pérdidas por cierres o reinicios.
- Actualiza automáticamente la clasificación de horas y muestra un estado de error recuperable cuando el servicio no responde.
- Muestra iconos de Discord y carrito de compras en los accesos del menú ESC de Minecraft 26.2.
- Coloca Discord y Tienda juntos, en dos columnas debajo de **Desconectar**, y evita que Mods los cubra en Minecraft 1.21.4 y 1.21.11.
- Añade a AFK Farm saldo asignado por administración, consumo calculado por el servidor y heartbeats autenticados mientras la automatización está activa.
- Separa AFK Farm del asistente mediante credenciales exclusivas y renovables, vinculadas a la sesión de MineLatino y recuperables tras reinicios del servicio.

Windows se distribuye como instalador `.exe`. Linux se distribuye como AppImage x86-64 y paquete `.deb` amd64. También se publican las sumas SHA-256 y los paquetes internos firmados para las actualizaciones automáticas.

**Aviso:** el instalador de Windows todavía no tiene firma Authenticode y puede mostrar “Editor desconocido”. Su SHA-256 se publica junto al archivo; las actualizaciones internas continúan firmadas y verificadas por el launcher.
