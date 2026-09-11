# MineLatino Launcher 0.68.41

- La actualización interna exige un archivo SHA-256 válido publicado junto al ASAR.
- El ASAR recién descargado se vuelve a verificar antes de quedar pendiente de instalación.
- Un archivo incompleto, corrupto o manipulado se elimina y nunca sustituye la aplicación actual.
- Una descarga pendiente existente solo se reutiliza cuando coincide con el hash oficial.

Validación: comprobación de tipos del proceso principal y compilación de producción.
