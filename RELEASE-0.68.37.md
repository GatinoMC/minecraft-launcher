# MineLatino Launcher 0.68.37

- Corregidas las miniaturas de cosméticos: cada cara utiliza su textura y la animación `.mcmeta` correspondiente, igual que el probador 3D.
- Las coordenadas UV del JSON Java mantienen su escala de 16 unidades aunque Blockbench exporte `texture_size`.
- Encuadre centrado de modelos desplazados; cancelación de cargas antiguas y liberación de recursos gráficos al cerrar o actualizar las miniaturas.
- Renderer reutilizable para el panel administrativo del servicio de cosméticos.
- Las tareas de publicación heredadas de XMCL no se ejecutan sobre las releases de MineLatino.

Compatible con la distribución automática de Cosmetics alpha.8: Fabric y Forge 1.21.4, y Fabric 1.21.11. Reinicia Minecraft después de actualizar el mod.

Validación: siete pruebas de geometría/materiales, comprobación de tipos completa y lint sin errores (tres advertencias existentes ajenas a estos cambios). Probador y miniaturas comprobados en el launcher real de desarrollo con Ocean, sus dos PNG y su animación publicados. La comprobación visual dentro de Minecraft con otros jugadores sigue pendiente; no se afirma que la prueba del launcher sustituya esa validación.
