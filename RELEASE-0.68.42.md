# MineLatino Launcher 0.68.42

- Las clasificaciones de tiempo jugado aceptan únicamente cuentas Microsoft/Mojang verificadas.
- El backend mide la duración de cada sesión; ya no confía en nombres ni tiempos enviados por el cliente.
- Cada sesión usa un token aleatorio de un solo uso y una cuenta solo puede mantener una sesión activa.
- Los datos se vinculan al UUID premium, por lo que un cambio de nick conserva el tiempo acumulado.
- La persistencia del ranking se agrupa y escribe de forma asíncrona y atómica.

Validación: comprobaciones TypeScript y pruebas HTTP locales contra reportes falsificados.
