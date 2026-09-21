# FH6 Random Drive

Generador de auto y carrera para Forza Horizon 6, en español, instalable como PWA.

## Uso

Abrí `INICIAR_EN_PC.bat` (requiere Python) o ejecutá `py -m http.server 8080` en esta carpeta y entrá a `http://localhost:8080`. Para instalarla en un teléfono, serví la carpeta mediante HTTPS. No requiere compilación ni claves de API.

- **Otro auto**, **Otra carrera** y **Cambiar ambos** generan selecciones distintas cuando hay alternativas.
- **No lo tengo** excluye un auto; **Autos excluidos** permite restaurarlo.
- La carrera muestra su ubicación sobre la imagen real del mapa de FH6. **Ampliar mapa** permite acercar hasta 400% y desplazarse por el mapa.
- Las selecciones y exclusiones quedan guardadas en el dispositivo. La app, portada y mapa funcionan sin conexión después de la primera carga completa; se guardan hasta 40 fotos de autos vistas. Las fotos aún no visitadas requieren internet.

## Imágenes y datos

- Portada oficial: [Forza, Photos & Videos](https://forza.net/media). Archivo incluido `assets/fh6-cover.webp`.
- Mapa y ubicaciones: [ForzaLabs](https://forza.labsgg.com/interactive-map), [datos de marcadores](https://forza.labsgg.com/.netlify/functions/interactive-map-items). Imagen original de 2160 × 2700; las coordenadas de `races.js` son porcentajes de la imagen completa. Incluye las 89 carreras existentes. Shimanoyama Drift Circuit señala el predio del circuito, con aviso visible: no representa una medición independiente del acceso a Drift Attack.
- Autos y fotos: [pixelswiftali/forzadata](https://github.com/pixelswiftali/forzadata), que referencia imágenes de Forza Wiki. `car-photos.js` incluye el catálogo de 563 modelos y fotos para 562. El MINI Cooper S de 1965 no tiene una foto disponible en esta fuente y muestra un aviso. Las fotos iniciales se vinculan a un commit fijo; sólo se agregan referencias exactas por modelo y año, sin sustituir ediciones por otros autos.
- Se prioriza el catálogo con nombres completos y fotos. La lista [HDR Car Ordinals](https://gist.github.com/HDR/0659d1717bc61504bf83750628963f4f) se conserva como alternativa online; sus vehículos sin foto identificada muestran un aviso. Se excluyen sus entradas marcadas Traffic o Unobtainable.
- El ícono de Random Drive es un diseño vectorial propio con identidad FH6, disponible en SVG y PNG de 192/512 píxeles. Esta es una app de fans no oficial. Las imágenes y marcas de Forza pertenecen a sus respectivos titulares.

Las fuentes se consultaron el 21/09/2026. Para actualizar posiciones o imágenes, conservá las proporciones y las referencias de origen. Al cambiar archivos de la app, incrementá la versión `CACHE` de `sw.js` para renovar la PWA. Si quedó abierta una versión anterior, cerrala y volvé a abrirla tras actualizar.

## Verificación de esta versión

Probada en navegador Chromium: fotos reales, cambio de auto/carrera, exclusiones, restauración, selección persistente, errores de imágenes, cargas simultáneas, zoom y alineación del marcador, funcionamiento sin conexión y diseño a 320, 390, 768 y 1440 píxeles.
