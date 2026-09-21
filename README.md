# FH6 Random Drive

Mini PWA para elegir un auto y una carrera al azar en Forza Horizon 6.

## Qué hace
- Sortea un auto.
- Sortea una carrera.
- "No lo tengo" excluye ese auto del futuro sorteo.
- Permite restaurar autos excluidos.
- Intenta actualizar la lista de autos online.
- Guarda la última lista descargada en el teléfono.
- Incluye 89 carreras documentadas en el proyecto.
- Se puede instalar como app desde Chrome/Edge.

## Fuentes de autos
1. Primaria: HDR - Forza Horizon 6 Car Ordinals (GitHub Gist).
2. Secundaria: pixelswiftali/forzadata (GitHub).
3. Si ambas fallan, usa la última lista guardada.
4. Si es la primera apertura y no hay internet, usa una lista mínima de emergencia.

## Probar en Windows
No abras index.html directamente. Levantá un servidor local:

    py -m http.server 8080

y abrí:

    http://localhost:8080

También podés ejecutar `INICIAR_EN_PC.bat`.

## Publicarlo en GitHub Pages
1. Crear un repositorio nuevo, por ejemplo `fh6-random`.
2. Subir todos los archivos de esta carpeta a la raíz del repositorio.
3. GitHub -> Settings -> Pages.
4. En "Build and deployment", elegir "Deploy from a branch".
5. Branch: `main` / folder: `/ (root)`.
6. Guardar.
7. GitHub mostrará una URL parecida a:
   `https://TU_USUARIO.github.io/fh6-random/`

## Instalar en Android
1. Abrir la URL de GitHub Pages en Chrome.
2. Menú ⋮.
3. "Agregar a pantalla principal" o "Instalar app".
4. Aceptar.

## iPhone
Abrir la web en Safari -> Compartir -> "Añadir a pantalla de inicio".
