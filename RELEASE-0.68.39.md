# MineLatino Launcher 0.68.39

- Corregida la creación del perfil recomendado después de actualizar el launcher cuando ya existen otros perfiles.
- Si falta `MineLatino 1.21.11`, ahora se crea automáticamente sin eliminar ni modificar los perfiles del usuario.
- Si el perfil recomendado ya existe pero no recibió el paquete inicial, se instalan Fabric API, Sodium, Lithium, FerriteCore, ImmediatelyFast y Entity Culling.
- El mod de cosméticos Fabric 1.21.11 continúa sincronizándose automáticamente desde MineLatino.
- El paquete inicial queda marcado después de una instalación completa para evitar descargas repetidas en cada inicio.

Validación: prueba de regresión del flujo de actualización, comprobación de tipos, lint y compilación de producción.
