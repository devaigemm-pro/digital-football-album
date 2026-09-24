Falta el icono de la app.

Contents.json referencia un único icono universal de 1024x1024 llamado
"AppIcon.png" (convención de la plantilla React Native 0.75). El binario PNG NO
se incluye en este scaffold (no se fabrican assets binarios).

Acción del desarrollador:
  1. Añade un PNG de 1024x1024 (sin canal alpha) llamado exactamente
     "AppIcon.png" en esta carpeta (AppIcon.appiconset/), o
  2. Arrastra tu set de iconos en Xcode sobre el AppIcon del catálogo, dejando
     que Xcode regenere Contents.json.

Este archivo README.txt puede borrarse una vez añadido el icono.
