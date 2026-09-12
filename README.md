# Luxepoint USA

Tienda estática en HTML, CSS y JavaScript. Conserva los 33 productos, sus nombres, fotografías, el número de WhatsApp y la URL del servicio de inventario del proyecto original.

## Cambios de esta propuesta

- Catálogo visible al entrar, búsqueda por producto o marca, categorías, orden por precio o nombre y filtro de disponibilidad.
- Diseño con los colores de la tienda, portada más corta, tarjetas legibles y reglas de adaptación a pantallas pequeñas.
- Menú operable con clic y teclado. Carrito y formulario con diálogos nativos, cierre con Escape y campos etiquetados.
- Cantidades editables, límites según existencias y actualización de precios también dentro del carrito.
- Consulta nueva del inventario antes de reservar. Los cambios de precio o cantidad requieren revisar el carrito y volver a continuar.
- Estado visible si falla la consulta. No se habilitan compras con precios o stock sin verificar.
- Un solo flujo de reserva para Yape/Plin, transferencia y solicitud de enlace de Mercado Pago. El sitio no cobra tarjetas; el enlace se solicita a la tienda por WhatsApp, como en el flujo anterior.
- Mensajes codificados con `encodeURIComponent`, preservando nombres con `&`, tildes, porcentajes y direcciones con `#`.
- Confirmación explícita antes de vaciar el carrito. Un timeout o una respuesta ilegible conserva el pedido y permite consultar su estado sin volver a enviarlo automáticamente.
- Registro local de la referencia del pedido para evitar reenvíos después de recargar. Web Locks serializa las reservas entre pestañas compatibles del mismo navegador.
- Los datos de contacto, DNI y dirección no se guardan en `localStorage`. Se incluyen en el enlace de WhatsApp preparado después del formulario y permanecen en memoria durante esa visita.
- El sorteo se consulta desde un aviso discreto; ya no interrumpe automáticamente la navegación. Se retira el enlace de TikTok que apuntaba a `TU_USUARIO`.

## Inventario y servicio existente

La lectura real del servicio y la hoja «Stock USA» se revisaron en modo de solo lectura. Los 33 nombres de producto coinciden con la columna `id`. La hoja también tiene las columnas `stock` y `precio`.

El GET existente devuelve un objeto indexado por nombre:

```json
{
  "Nombre exacto del producto": { "stock": 2, "precio": 95 }
}
```

El nombre identifica el producto en la integración actual. Si se cambia, debe actualizarse en la hoja y en la tarjeta del catálogo. Los productos ausentes o con datos inválidos quedan deshabilitados.

El POST conserva el campo `items` y añade `pedidoId`:

```json
{
  "pedidoId": "LP-referencia-unica",
  "items": [
    { "id": "Nombre exacto del producto", "nombre": "Nombre exacto del producto", "precio": 95, "cantidad": 1 }
  ]
}
```

Se envía JSON como `text/plain;charset=utf-8`, sin `no-cors`. El servicio debe leer `JSON.parse(e.postData.contents)`, procesar el pedido y devolver JSON legible. La confirmación admitida es `success: true`, `ok: true`, `status: "success"` o `status: "ok"`, sin un campo de error. Ejemplo de respuesta recomendada:

```json
{ "success": true, "pedidoId": "LP-referencia-unica" }
```

Una respuesta vacía, HTML, errores HTTP, errores declarados, timeouts o fallos CORS se tratan como **estado desconocido**, porque el servidor podría haber modificado existencias antes del fallo. No se repite el POST. El cliente conserva la referencia y ofrece consultar por WhatsApp.

### Pendiente antes de aplicar a la tienda en producción

El código de Apps Script no está incluido en estos repositorios ni se encontró como archivo accesible de Drive. No se ejecutó ningún POST contra el inventario real. Hay que revisar `doGet` y `doPost` y comprobar el contrato anterior en una copia de prueba de la hoja antes de integrar esta propuesta.

La validación del navegador no sustituye la validación del servidor. Apps Script debe volver a leer precios y stock, rechazar cantidades inválidas y pedidos sin existencias, serializar las escrituras concurrentes y registrar `pedidoId` de forma persistente para no descontar dos veces una misma reserva. Estos controles del servidor **no se han implementado ni verificado en esta propuesta**. Web Locks y el registro local solo reducen reenvíos en un mismo navegador; no cubren otros clientes ni todos los navegadores.

El flujo existente descuenta stock al solicitar la reserva, antes de pagar. Por eso los textos nuevos dicen «reserva», no «compra pagada». Un pedido abandonado requiere que la tienda libere las existencias; este repositorio no puede comprobar que se envió un mensaje ni que se recibió un pago. «Preparar un pedido diferente» crea un carrito vacío y no cancela la reserva anterior.

La respuesta JSON y las redirecciones de Apps Script se describen en [Content Service](https://developers.google.com/apps-script/guides/content). La exclusión de escrituras concurrentes se documenta en [LockService](https://developers.google.com/apps-script/reference/lock/lock-service). Son referencias para revisar el servidor, no evidencia de que el servicio actual implemente esos controles.

## Ejecutar y verificar

Para servir la tienda no se necesita Node ni un proceso de compilación. Se publican `index.html`, `css/`, `img/`, `commerce.js` y `main.js` con el alojamiento estático habitual. No se cambia la configuración de publicación.

Las dependencias de npm se utilizan únicamente para pruebas. Con Node 24.15 o posterior de la rama 24:

```sh
npm ci
npm test
npm run check
```

Las 12 pruebas incluyen reglas de precios, cantidades, datos locales corruptos, caracteres especiales, respuestas no verificables, reposición de productos, revisión del carrito, doble envío y recuperación tras recargar. Las pruebas de interfaz usan DOM simulado con JSDOM y respuestas de red falsas; nunca escriben en Google Sheets ni envían WhatsApp.

También se comprobaron la sintaxis JavaScript, los 33 productos, las referencias a recursos locales, los identificadores HTML y las etiquetas de los campos. La revisión visual en un navegador real quedó pendiente porque la vista de prueba no fue accesible desde el navegador del entorno. Los tests con JSDOM no verifican el diseño visual ni el comportamiento nativo de los diálogos.
