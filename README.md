# FH6 Random Drive

Generador de auto y carrera para Forza Horizon 6, en español, instalable como PWA.

## Uso

Abrí `INICIAR_EN_PC.bat` (requiere Python) o ejecutá `py -m http.server 8080` en esta carpeta y entrá a `http://localhost:8080`. Para instalarla en un teléfono, serví la carpeta mediante HTTPS. No requiere compilación ni claves de API.

- **Otro auto**, **Otra carrera** y **Cambiar ambos** generan selecciones distintas cuando hay alternativas.
- **No lo tengo** excluye un auto; **Autos excluidos** permite restaurarlo.
- La carrera muestra su ubicación sobre la imagen real del mapa de FH6. **Ampliar mapa** permite acercar hasta 400% y desplazarse por el mapa.
- Las selecciones y exclusiones quedan guardadas en el dispositivo. La app, portada y mapa funcionan sin conexión después de la primera carga completa; se guardan hasta 40 fotos de autos vistas. Las fotos aún no visitadas requieren internet.

## Actualización de autos y carreras

La app consulta los catálogos JSON públicos de la comunidad para incorporar autos, referencias de fotos y carreras. No necesita claves de API ni un servidor propio: consulta [FH6 Livery Viewer](https://github.com/Hx-zh/fh6-livery-viewer) para modelos recientes, [forzadata](https://github.com/pixelswiftali/forzadata) para fotos y nombres completos, y [ForzaLabs](https://forza.labsgg.com/interactive-map) para carreras.

- **Cada 6 horas**, mientras la app está abierta, consulta las fuentes online. Al abrirla o volver a ella, comprueba si corresponde actualizar.
- **Actualizar datos** permite consultar ambos catálogos en cualquier momento. El panel distingue la última consulta de la fecha de publicación de cada fuente, por separado para autos y carreras.
- Si una fuente falla, conserva su última lista válida y vuelve a intentarlo después de **15 minutos**. Una consulta fallida no impide guardar la actualización válida de la otra fuente ni seguir usando el generador.
- Los catálogos actualizados, las nuevas referencias de fotos y las posiciones de las carreras se guardan en el dispositivo para las siguientes sesiones. Guardar una referencia de foto no descarga todas las imágenes: se siguen guardando hasta 40 fotos vistas.

Las novedades se incorporan cuando las fuentes comunitarias las publican; puede haber demora respecto de una actualización del juego. La app no promete consultas en segundo plano cuando está cerrada. Al volver a abrirla revisa las actualizaciones pendientes y, sin conexión, utiliza los últimos datos guardados o el catálogo inicial incluido.

## Orientación del auto y afinidad con la carrera

La tarjeta del auto indica sus tipos de carrera orientativos, y la tarjeta de la carrera compara esa orientación con el auto actual. Se actualizan al cambiar cualquiera de los dos o al recibir nuevos perfiles de la API.

Las categorías incluidas en `car-profiles.js` provienen de la [lista oficial de FH6](https://forza.net/fh6cars), consultada el 22/09/2026, complementadas con atributos de serie de forzadata. Los perfiles nuevos que publica forzadata se integran en la sincronización de 6 horas y se guardan en caché. Para modelos sin categoría conocida se muestra «Sin datos suficientes»; no se deduce la aptitud sólo por marca, año, nombre o potencia.

`car-suitability.js` contiene reglas orientativas, no rankings oficiales ni garantía de victoria: rally favorece tierra, todoterreno favorece campo traviesa/tierra, drift favorece Drift Attack y deportivos favorecen asfalto. Clásicos de uso general se presentan con cautela. Touge requiere manejo ≥ 5,5 y frenado ≥ 4,5 en compactos/circuito; contrarreloj favorece categorías de circuito o manejo ≥ 7 y frenado ≥ 6 en deportivos; aceleración requiere salida ≥ 8, aceleración ≥ 8 y velocidad ≥ 7. Esos umbrales son heurísticas propias. Se descartan atributos fuera de 0–10 y valores que no sean números. La recomendación no conoce tus modificaciones ni comprueba los requisitos de clase de cada evento.

Las pruebas de esta mejora se ejecutan con `node --test tests/car-suitability.test.cjs`.

## Imágenes y datos

- Portada oficial: [Forza, Photos & Videos](https://forza.net/media). Archivo incluido `assets/fh6-cover.webp`.
- Mapa y ubicaciones: [ForzaLabs](https://forza.labsgg.com/interactive-map), [datos de marcadores](https://forza.labsgg.com/.netlify/functions/interactive-map-items). Imagen original de 2160 × 2700; las coordenadas de `races.js` son porcentajes de la imagen completa. El catálogo inicial incluye 89 carreras. Shimanoyama Drift Circuit señala el predio del circuito, con aviso visible: no representa una medición independiente del acceso a Drift Attack.
- Autos y fotos: [pixelswiftali/forzadata](https://github.com/pixelswiftali/forzadata), que referencia imágenes de Forza Wiki. `car-photos.js` incluye el catálogo inicial de 563 modelos y fotos para 562. Al preparar este catálogo, el MINI Cooper S de 1965 no tenía una foto disponible en la fuente; los modelos sin foto muestran un aviso. Las fotos iniciales se vinculan a un commit fijo; sólo se agregan referencias exactas por modelo y año, sin sustituir ediciones por otros autos.
- Se combinan los nombres de FH6 Livery Viewer y el catálogo con fotos sin eliminar entradas guardadas. Se deduplican coincidencias exactas normalizadas y aliases que apuntan a la misma foto. Una fuente puede nombrar de forma diferente un vehículo sin imagen; esas variantes no se fusionan por semejanza para no confundir ediciones. [HDR Car Ordinals](https://gist.github.com/HDR/0659d1717bc61504bf83750628963f4f) se conserva como alternativa si fallan ambas fuentes de autos. Los modelos sin foto identificada muestran un aviso. Se excluyen entradas de tráfico, Unobtainable y Playground Flatbed.
- El ícono de Random Drive es un diseño vectorial propio con identidad FH6, disponible en SVG y PNG de 192/512 píxeles. Esta es una app de fans no oficial. Las imágenes y marcas de Forza pertenecen a sus respectivos titulares.

El catálogo incluido se preparó con fuentes consultadas el 21/09/2026. `catalog-sync.js` se encarga de las consultas periódicas y la conservación de los últimos datos válidos. Las coordenadas nuevas deben mantener la proporción del mapa incluido; las actualizaciones del catálogo no reemplazan automáticamente la imagen base del mapa. Al cambiar archivos de la app, incrementá la versión `CACHE` de `sw.js` para renovar la PWA. Si quedó abierta una versión anterior, cerrala y volvé a abrirla tras actualizar.

## Verificación de esta versión

Probada en navegador Chromium: fotos reales, cambio de auto/carrera, exclusiones, restauración, selección persistente, errores de imágenes, cargas simultáneas, zoom y alineación del marcador, funcionamiento sin conexión y diseño a 320, 390, 768 y 1440 píxeles.

La sincronización incluye 26 pruebas de datos, fallos parciales, persistencia, intervalos, reintentos y concurrencia. Se ejecutan con `node --test tests/catalog-sync.test.cjs`, sin instalar dependencias. Los archivos de `tests/fixtures` contienen recortes de los catálogos públicos para reproducir las pruebas sin red. También se verificaron en navegador el paso simulado de 6 horas, la incorporación de nuevas entradas, el botón manual y la carga real de las APIs con uso offline posterior.
