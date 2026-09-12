/* Luxepoint USA: catálogo y reserva por WhatsApp. Sin datos de clientes en localStorage. */
(() => {
    'use strict';
    const URL_API_GOOGLE_SHEETS = 'https://script.google.com/macros/s/AKfycbzxpf_0OB3jC3HuIweE4xRiWdw1QP17lCoAL-DaE9OLGA2jQTx80kRACBkjxQSZ_G6DsQ/exec';
    const NUMERO_WHATSAPP = '51978398707';
    const CART_KEY = 'luxepoint_carrito';
    const ORDER_KEY = 'luxepoint_pedido_pendiente';
    const C = window.LuxeCommerce;
    const $ = id => document.getElementById(id);
    const money = value => `S/ ${value.toFixed(2)}`;
    const tarjetas = [...document.querySelectorAll('.producto-card')];
    const productos = new Map();
    let categoria = 'todos';
    let catalogoListo = false;
    let sincronizacion = null;
    let enviando = false;
    let avisoTimer;
    let pedido = leerPedido();
    let enlacePedido = null;
    let resumenPedido = null;

    function leer(key) { try { return localStorage.getItem(key); } catch { return null; } }
    function escribir(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    }
    function leerPedido() {
        try {
            const value = JSON.parse(leer(ORDER_KEY));
            if (value && /^LP-[a-z0-9-]{8,60}$/i.test(value.id) && ['enviando', 'confirmado', 'desconocido'].includes(value.estado)) {
                return { id: value.id, estado: value.estado };
            }
        } catch { /* Un valor local dañado nunca debe romper la tienda. */ }
        return null;
    }
    function avisar(texto) {
        clearTimeout(avisoTimer);
        $('aviso').textContent = texto;
        $('aviso').hidden = false;
        avisoTimer = setTimeout(() => { $('aviso').hidden = true; }, 5500);
    }
    function notaCarrito(texto) {
        $('aviso-carrito').textContent = texto;
        $('aviso-carrito').hidden = !texto;
    }
    function abrir(id) {
        document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
        $(id).showModal();
        document.body.style.overflow = 'hidden';
    }
    function guardarCarrito() {
        escribir(CART_KEY, carrito.map(({ id, cantidad }) => ({ id, cantidad })));
        renderCarrito();
        renderTarjetas();
    }

    tarjetas.forEach((card, index) => {
        const nombre = card.querySelector('h4').textContent.trim();
        card.dataset.productId = nombre;
        productos.set(nombre, { id: nombre, nombre, imagen: card.querySelector('img').getAttribute('src'),
            categoria: card.dataset.categoria, precio: null, stock: null, orden: index });
    });
    let carrito = C.restaurarCarrito(leer(CART_KEY), productos);

    function renderTarjetas() {
        tarjetas.forEach(card => {
            const p = productos.get(card.dataset.productId);
            const cantidad = carrito.find(item => item.id === p.id)?.cantidad || 0;
            const conocido = p.precio !== null && p.stock !== null;
            card.querySelector('.precio').textContent = conocido ? money(p.precio) : 'Por confirmar';
            const stock = card.querySelector('.stock');
            stock.textContent = !conocido ? 'Disponibilidad por confirmar' : p.stock === 0 ? 'Sin existencias' :
                p.stock === 1 ? 'Última unidad disponible' : `${p.stock} unidades disponibles`;
            stock.classList.toggle('low-stock', conocido && p.stock > 0 && p.stock <= 3);
            const btn = card.querySelector('.btn-add-cart');
            btn.disabled = !catalogoListo || !conocido || p.stock <= cantidad || enviando || Boolean(pedido);
            btn.textContent = !conocido || !catalogoListo ? 'Por confirmar' : p.stock === 0 ? 'Agotado' :
                p.stock <= cantidad ? 'Ya está en tu carrito' : 'Añadir al carrito';
            btn.setAttribute('aria-label', `${btn.textContent}: ${p.nombre}`);
            let tag = card.querySelector('.tag-agotado');
            if (conocido && p.stock === 0 && !tag) {
                tag = document.createElement('span'); tag.className = 'tag-agotado'; tag.textContent = 'Agotado';
                card.querySelector('.producto-img').appendChild(tag);
            } else if (tag && p.stock !== 0) tag.remove();
        });
    }

    function filtrar() {
        const query = C.textoBusqueda($('buscar-productos').value);
        const disponibles = $('solo-disponibles').checked;
        const orden = $('ordenar-productos').value;
        let count = 0;
        const lista = [...tarjetas].sort((a, b) => {
            const x = productos.get(a.dataset.productId), y = productos.get(b.dataset.productId);
            if (orden.startsWith('precio')) {
                if (x.precio === null || y.precio === null) return x.precio === null ? (y.precio === null ? x.orden - y.orden : 1) : -1;
                return orden === 'precio-asc' ? x.precio - y.precio : y.precio - x.precio;
            }
            return orden === 'nombre' ? x.nombre.localeCompare(y.nombre, 'es') : x.orden - y.orden;
        });
        lista.forEach(card => {
            const p = productos.get(card.dataset.productId);
            card.hidden = !((categoria === 'todos' || p.categoria === categoria) &&
                C.textoBusqueda(p.nombre).includes(query) && (!disponibles || (catalogoListo && p.stock > 0)));
            if (!card.hidden) count++;
            $('contenedor-productos').appendChild(card);
        });
        $('resultados').textContent = `${count} de ${productos.size} productos`;
        $('sin-resultados').hidden = count > 0;
        document.querySelectorAll('.filtro-categoria').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.filter === categoria)));
    }

    async function sincronizar(forzar = false) {
        if (sincronizacion) {
            if (!forzar) return sincronizacion;
            await sincronizacion;
        }
        const trabajo = async () => {
            $('estado-stock').textContent = 'Consultando precios y disponibilidad…';
            $('estado-stock').dataset.state = 'loading';
            $('actualizar-stock').disabled = true;
            try {
                const data = await C.solicitarJSON(URL_API_GOOGLE_SHEETS, { cache: 'no-store' });
                const actualizados = C.normalizarCatalogo(data);
                if (![...productos.keys()].some(id => actualizados.has(id))) throw new Error('El catálogo no coincide');
                productos.forEach((p, id) => {
                    const actual = actualizados.get(id);
                    p.precio = actual ? actual.precio : null;
                    p.stock = actual ? actual.stock : null;
                });
                catalogoListo = true;
                const resultado = pedido ? { items: carrito, cambios: [] } : C.reconciliarCarrito(carrito, productos);
                carrito = resultado.items;
                if (resultado.cambios.length) notaCarrito(`${resultado.cambios.join(' ')} Revisa tu carrito antes de continuar.`);
                const hora = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                $('estado-stock').textContent = `Precios y disponibilidad actualizados a las ${hora}.`;
                $('estado-stock').dataset.state = 'ready';
                guardarCarrito(); filtrar();
                return { ok: true, cambios: resultado.cambios };
            } catch {
                catalogoListo = false;
                $('estado-stock').textContent = 'No pudimos verificar precios y existencias. Pulsa Actualizar para volver a consultar.';
                $('estado-stock').dataset.state = 'error';
                renderTarjetas(); renderCarrito(); filtrar();
                return { ok: false, cambios: [] };
            } finally { $('actualizar-stock').disabled = false; }
        };
        sincronizacion = trabajo();
        try { return await sincronizacion; } finally { sincronizacion = null; }
    }

    function renderCarrito() {
        const totalCantidad = carrito.reduce((n, item) => n + item.cantidad, 0);
        document.querySelector('.badge').textContent = totalCantidad;
        $('cart-btn').setAttribute('aria-label', `Abrir carrito, ${totalCantidad} productos`);
        const container = $('items-carrito');
        container.replaceChildren();
        if (!carrito.length) {
            const p = document.createElement('p'); p.className = 'empty-state';
            p.textContent = pedido ? 'Consulta abajo el estado de tu último pedido.' : 'Tu carrito está vacío. Explora la colección y añade tus favoritos.';
            container.appendChild(p);
        }
        carrito.forEach(item => {
            const div = document.createElement('div'); div.className = 'item-carrito';
            const img = document.createElement('img'); img.src = item.imagen; img.alt = item.nombre; img.width = 74; img.height = 85;
            const detalles = document.createElement('div'); detalles.className = 'item-detalles';
            const titulo = document.createElement('h3'); titulo.textContent = item.nombre;
            const precio = document.createElement('p'); precio.textContent = item.precio === null ? 'Precio por verificar' : `${money(item.precio)} por unidad`;
            const cantidad = document.createElement('div'); cantidad.className = 'quantity-control';
            const menos = document.createElement('button'); menos.type = 'button'; menos.textContent = '−';
            menos.setAttribute('aria-label', `Quitar una unidad de ${item.nombre}`);
            menos.disabled = enviando || Boolean(pedido);
            menos.addEventListener('click', () => cambiarCantidad(item.id, -1));
            const valor = document.createElement('span'); valor.textContent = item.cantidad;
            const mas = document.createElement('button'); mas.type = 'button'; mas.textContent = '+';
            mas.setAttribute('aria-label', `Añadir una unidad de ${item.nombre}`);
            mas.disabled = !catalogoListo || item.cantidad >= item.stock || enviando || Boolean(pedido);
            mas.addEventListener('click', () => cambiarCantidad(item.id, 1));
            cantidad.append(menos, valor, mas);
            const subtotal = document.createElement('strong'); subtotal.textContent = item.precio === null ? 'Por verificar' : money(item.precio * item.cantidad);
            detalles.append(titulo, precio, cantidad, subtotal);
            const quitar = document.createElement('button'); quitar.type = 'button'; quitar.className = 'btn-eliminar'; quitar.textContent = '×';
            quitar.setAttribute('aria-label', `Eliminar ${item.nombre} del carrito`);
            quitar.disabled = enviando || Boolean(pedido);
            quitar.addEventListener('click', () => { carrito = carrito.filter(p => p.id !== item.id); guardarCarrito(); });
            div.append(img, detalles, quitar); container.appendChild(div);
        });
        $('total-carrito').textContent = carrito.some(p => p.precio === null) ? 'Por verificar' : money(C.totalCarrito(carrito));
        $('btn-ir-checkout').disabled = enviando || (!pedido && (!carrito.length || !catalogoListo));
        $('btn-ir-checkout').textContent = pedido ? 'Ver mi pedido' : 'Continuar con mi pedido';
        if (pedido) notaCarrito('Tienes un pedido iniciado. Consulta su estado antes de preparar otro.');
        renderResumen();
    }

    function cambiarCantidad(id, cambio) {
        if (enviando || pedido) return;
        const item = carrito.find(p => p.id === id);
        const p = productos.get(id);
        if (!item || !p) return;
        if (cambio > 0 && (!catalogoListo || item.cantidad >= p.stock)) { avisar('Ya tienes todas las unidades disponibles.'); return; }
        item.cantidad += cambio;
        if (item.cantidad < 1) carrito = carrito.filter(p => p.id !== id);
        guardarCarrito();
    }

    function renderResumen() {
        const resumen = $('resumen-checkout'); resumen.replaceChildren();
        const items = pedido && resumenPedido ? resumenPedido : carrito;
        items.forEach(item => {
            const p = document.createElement('p'); p.textContent = `${item.cantidad} × ${item.nombre}`; resumen.appendChild(p);
        });
        const total = document.createElement('strong');
        total.textContent = pedido && !items.length ? `Referencia: ${pedido.id}` : items.some(p => p.precio === null) ? 'Subtotal por verificar' : `Subtotal: ${money(C.totalCarrito(items))}`;
        resumen.appendChild(total);
    }

    function mostrarPedido(link) {
        if (!pedido) return;
        $('form-checkout').hidden = true;
        const estado = $('estado-pedido'); estado.hidden = false; estado.dataset.state = pedido.estado;
        estado.textContent = pedido.estado === 'confirmado' ?
            `Reserva registrada. Referencia: ${pedido.id}. Continúa por WhatsApp para coordinar el pago y la entrega.` :
            `No pudimos confirmar el registro de ${pedido.id}. Puede haberse descontado stock. Consulta con la tienda antes de repetir el pedido; no lo enviaremos de nuevo automáticamente.`;
        if (link) enlacePedido = { id: pedido.id, url: link };
        $('abrir-whatsapp').href = enlacePedido?.id === pedido.id ? enlacePedido.url : `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(`Hola, quiero consultar el estado del pedido ${pedido.id}. Por favor, verifiquen si ya se descontó stock antes de registrarlo otra vez.`)}`;
        $('abrir-whatsapp').hidden = false;
        $('nuevo-pedido').hidden = false;
    }

    function datosCliente() {
        const data = {};
        for (const campo of ['nombre', 'dni', 'telefono', 'correo', 'direccion', 'distrito', 'referencia']) data[campo] = $(`cliente-${campo}`).value.trim();
        data.pago = document.querySelector('input[name="pago"]:checked').value;
        return data;
    }

    async function registrarPedido(cliente) {
        // La lectura dentro del bloqueo evita que otra pestaña repita el envío.
        pedido = leerPedido();
        if (pedido) { mostrarPedido(); return; }
        const sync = await sincronizar(true);
        if (!sync.ok) { notaCarrito('No pudimos comprobar el stock. Actualiza el catálogo y vuelve a intentarlo.'); abrir('modal-carrito'); return; }
        if (sync.cambios.length || !carrito.length) {
            if (!carrito.length) notaCarrito('Los productos de tu carrito ya no están disponibles.');
            abrir('modal-carrito'); return;
        }
        const items = carrito.map(item => ({ ...item }));
        resumenPedido = items;
        pedido = { id: `LP-${crypto.randomUUID()}`, estado: 'enviando' };
        if (!escribir(ORDER_KEY, pedido)) {
            pedido = null;
            $('estado-pedido').textContent = 'Tu navegador no permite guardar el estado del pedido. Habilita el almacenamiento del sitio o consulta por WhatsApp.';
            $('estado-pedido').hidden = false;
            return;
        }
        let respuesta;
        try {
            // text/plain permite enviar JSON sin un preflight que Apps Script no atiende.
            // Se conserva el contrato existente {items}; pedidoId permite trazabilidad
            // y debe usarse para idempotencia también en el servidor.
            respuesta = await C.solicitarJSON(URL_API_GOOGLE_SHEETS, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ pedidoId: pedido.id, items: items.map(({ id, nombre, precio, cantidad }) => ({ id, nombre, precio, cantidad })) })
            });
        } catch { /* Un timeout no prueba que el servidor no haya descontado stock. */ }
        pedido.estado = C.estadoRespuesta(respuesta);
        escribir(ORDER_KEY, pedido);
        const link = C.enlaceWhatsApp(NUMERO_WHATSAPP, items, cliente, pedido.id, pedido.estado);
        if (pedido.estado === 'confirmado') { carrito = []; guardarCarrito(); }
        // El enlace se abre mediante un clic real, evitando bloqueadores de ventanas.
        mostrarPedido(link);
        renderCarrito(); renderTarjetas();
    }

    $('form-checkout').addEventListener('submit', async event => {
        event.preventDefault();
        if (enviando) return;
        if (pedido) { mostrarPedido(); return; }
        if (!$('form-checkout').reportValidity() || !carrito.length) return;
        const cliente = datosCliente();
        if (['nombre', 'dni', 'telefono', 'direccion', 'distrito'].some(key => !cliente[key]) || cliente.telefono.replace(/\D/g, '').length < 9) {
            $('estado-pedido').textContent = 'Completa tus datos y un teléfono válido antes de continuar.';
            $('estado-pedido').hidden = false; return;
        }
        enviando = true;
        $('enviar-pedido').disabled = true; $('enviar-pedido').textContent = 'Verificando y preparando…';
        $('estado-pedido').hidden = true;
        $('form-checkout').setAttribute('aria-busy', 'true');
        $('form-checkout').querySelectorAll('fieldset').forEach(field => { field.disabled = true; });
        renderCarrito(); renderTarjetas();
        try {
            if (navigator.locks) {
                await navigator.locks.request('luxepoint-reserva', { ifAvailable: true }, async lock => {
                    if (!lock) { $('estado-pedido').textContent = 'Ya hay un pedido en proceso en otra pestaña.'; $('estado-pedido').hidden = false; return; }
                    await registrarPedido(cliente);
                });
            } else await registrarPedido(cliente);
        } catch {
            if (pedido) { pedido.estado = 'desconocido'; escribir(ORDER_KEY, pedido); mostrarPedido(); }
            else { $('estado-pedido').textContent = 'No pudimos preparar el pedido. No se ha enviado la reserva.'; $('estado-pedido').hidden = false; }
        } finally {
            enviando = false; $('enviar-pedido').disabled = false; $('enviar-pedido').textContent = 'Reservar y continuar';
            $('form-checkout').removeAttribute('aria-busy');
            $('form-checkout').querySelectorAll('fieldset').forEach(field => { field.disabled = false; });
            renderCarrito(); renderTarjetas();
        }
    });

    document.addEventListener('click', event => {
        const add = event.target.closest('.btn-add-cart');
        if (add && !add.disabled && !pedido && !enviando && catalogoListo) {
            const p = productos.get(add.closest('.producto-card').dataset.productId);
            const item = carrito.find(item => item.id === p.id);
            if ((item?.cantidad || 0) >= p.stock) return;
            if (item) item.cantidad++; else carrito.push({ ...p, cantidad: 1 });
            guardarCarrito(); notaCarrito(`${p.nombre} añadido al carrito.`); abrir('modal-carrito');
        }
        const filter = event.target.closest('[data-filter]');
        if (filter) {
            event.preventDefault(); categoria = filter.dataset.filter; filtrar();
            $('menu-categorias').hidden = true; $('menu-btn').setAttribute('aria-expanded', 'false');
            if (filter.tagName === 'A') $('novedades').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }
        const close = event.target.closest('[data-close]');
        if (close) $(close.dataset.close).close();
        if (!event.target.closest('.nav-left')) { $('menu-categorias').hidden = true; $('menu-btn').setAttribute('aria-expanded', 'false'); }
    });
    $('menu-btn').addEventListener('click', () => {
        $('menu-categorias').hidden = !$('menu-categorias').hidden;
        $('menu-btn').setAttribute('aria-expanded', String(!$('menu-categorias').hidden));
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !$('menu-categorias').hidden) {
            $('menu-categorias').hidden = true; $('menu-btn').setAttribute('aria-expanded', 'false'); $('menu-btn').focus();
        }
    });
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('close', () => { if (!document.querySelector('dialog[open]')) document.body.style.overflow = ''; });
        dialog.addEventListener('click', event => {
            const rect = dialog.getBoundingClientRect();
            if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
        });
    });
    $('cart-btn').addEventListener('click', () => abrir('modal-carrito'));
    $('btn-ir-checkout').addEventListener('click', () => { if (pedido) mostrarPedido(); renderResumen(); abrir('modal-checkout'); });
    $('volver-carrito').addEventListener('click', () => abrir('modal-carrito'));
    $('buscar-productos').addEventListener('input', filtrar);
    $('ordenar-productos').addEventListener('change', filtrar);
    $('solo-disponibles').addEventListener('change', filtrar);
    $('actualizar-stock').addEventListener('click', () => sincronizar());
    $('limpiar-filtros').addEventListener('click', () => { categoria = 'todos'; $('buscar-productos').value = ''; $('solo-disponibles').checked = false; $('ordenar-productos').value = 'coleccion'; filtrar(); });
    $('ver-sorteo').addEventListener('click', () => abrir('modal-sorteo'));
    $('nuevo-pedido').addEventListener('click', () => {
        if (enviando) return;
        if (!window.confirm('Esto inicia un carrito vacío y no cancela tu reserva anterior. Si su estado está por confirmar, consulta primero con la tienda. ¿Preparar un pedido diferente?')) return;
        try { localStorage.removeItem(ORDER_KEY); } catch { avisar('No pudimos iniciar otro pedido. Revisa el almacenamiento del navegador.'); return; }
        pedido = null; enlacePedido = null; resumenPedido = null; carrito = []; guardarCarrito(); notaCarrito('');
        $('form-checkout').reset(); $('form-checkout').hidden = false;
        $('estado-pedido').hidden = true; $('abrir-whatsapp').hidden = true; $('nuevo-pedido').hidden = true;
        $('modal-checkout').close(); sincronizar(true);
    });
    window.addEventListener('storage', event => {
        if (event.key === ORDER_KEY) {
            pedido = leerPedido();
            if (pedido) mostrarPedido();
            else { $('form-checkout').hidden = false; $('estado-pedido').hidden = true; $('abrir-whatsapp').hidden = true; $('nuevo-pedido').hidden = true; }
            renderCarrito(); renderTarjetas();
        }
        if (event.key === CART_KEY && !enviando) {
            carrito = C.restaurarCarrito(leer(CART_KEY), productos);
            if (catalogoListo && !pedido) carrito = C.reconciliarCarrito(carrito, productos).items;
            renderCarrito(); renderTarjetas();
        }
    });
    renderCarrito(); renderTarjetas(); filtrar();
    if (pedido) mostrarPedido();
    sincronizar();
})();
