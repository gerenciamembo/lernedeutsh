# Entrenador de mazos

Aplicación web minimalista para crear mazos de tarjetas a partir de archivos JSON o Excel y repasarlos siguiendo una dinámica de repasos con refuerzo sobre tarjetas con menos aciertos.

## Requisitos

No se necesitan dependencias externas. La aplicación utiliza únicamente Python estándar para el backend y HTML/CSS/JS para la interfaz.

## Ejecutar en local

```bash
python backend/src/app.py
```

El servidor se inicia por defecto en `http://0.0.0.0:8000`. Abre esa URL en tu navegador para utilizar la aplicación.

## Formato del archivo de mazo

Sube un archivo `.json` cuyo contenido sea un arreglo de objetos o un Excel `.xlsx` donde la primera fila define los encabezados de cada columna y cada fila posterior representa una tarjeta. Los campos pueden variar entre mazos porque se almacenan como objetos flexibles. Ejemplo en JSON:

```json
[
  { "frente": "Hallo", "traduccion": "Hola" },
  { "frente": "Danke", "traduccion": "Gracias" }
]
```

## Flujo de estudio

1. Crea un mazo desde la pantalla principal.
2. Al abrir un mazo, se mostrará una tarjeta aleatoria.
3. Marca la tarjeta como "Comprendido" o "No entendí" para incrementar o disminuir el contador de aciertos.
4. Después de recorrer todas las tarjetas, solo se repetirán aquellas que tengan aciertos negativos hasta que todas estén en valores positivos.
5. Puedes volver al listado de mazos en cualquier momento con el botón "Volver".

## Despliegue

El proyecto está preparado para ejecutarse en plataformas gratuitas que permitan aplicaciones Python simples (por ejemplo, Railway o Render). Solo necesitas iniciar el proceso `python backend/src/app.py` y asegurarte de que el directorio `backend/data` sea persistente si deseas conservar los mazos.

### Render (plan gratuito)

1. Crea una cuenta gratuita en [Render](https://render.com/) y conéctala con tu repositorio de GitHub.
2. Tras importar el repositorio, selecciona **New → Web Service** y apunta al branch que quieras publicar.
3. Configura el servicio con:
   * **Environment**: `Python`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `python backend/src/app.py`
   * **Port**: Render usa la variable `PORT` automáticamente, el servidor la detecta sin cambios adicionales.
4. Haz clic en **Create Web Service** y espera a que termine el build. Cuando el estado cambie a **Live**, la aplicación quedará disponible en la URL proporcionada por Render.

### Railway

1. Crea un proyecto nuevo en [Railway](https://railway.app/) y conecta tu repositorio de GitHub.
2. Añade un servicio de tipo **Python** y define el comando de inicio `python backend/src/app.py`.
3. Railway también expone la variable `PORT` automáticamente, así que no necesitas cambios adicionales.
4. Si quieres conservar los mazos tras reinicios, adjunta un volumen persistente y móntalo en `backend/data`.

### Otros proveedores

* **Fly.io**: instala la CLI `flyctl`, ejecuta `fly launch --no-deploy` para generar la configuración y asegúrate de que el comando de inicio sea `python backend/src/app.py`. Luego despliega con `fly deploy`.
* **Deta Space**: crea un nuevo proyecto `Micro` y sube el código tal como está; define el comando `python backend/src/app.py` y publica. Recuerda activar almacenamiento persistente para `backend/data`.

> 💡 Como el proyecto no requiere dependencias externas, los tiempos de build son muy rápidos y no es necesario usar contenedores personalizados.
