/* Reglas de compra sin dependencias; compartidas por la web y las pruebas. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LuxeCommerce = api;
})(typeof window === 'undefined' ? this : window, function () {
    'use strict';

    function precioNumero(value) {
        if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
        if (typeof value !== 'string') return null;
        let text = value.trim().replace(/^S\/\.?\s*/i, '').replace(/\s/g, '');
        if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(text)) text = text.replace(/,/g, '');
        else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) text = text.replace(/\./g, '').replace(',', '.');
        else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
        if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
        const number = Number(text);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    function normalizarCatalogo(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Catálogo inválido');
        const catalogo = new Map();
        for (const [id, value] of Object.entries(data)) {
            if (!value || typeof value !== 'object') continue;
            const precio = precioNumero(value.precio);
            const stock = typeof value.stock === 'number' ? value.stock :
                typeof value.stock === 'string' && /^\d+$/.test(value.stock.trim()) ? Number(value.stock) : NaN;
            if (precio !== null && Number.isSafeInteger(stock) && stock >= 0) {
                catalogo.set(id, { id, precio, stock });
            }
        }
        if (!catalogo.size) throw new Error('No hay productos válidos');
        return catalogo;
    }

    function restaurarCarrito(raw, productos) {
        let data;
        try { data = JSON.parse(raw); } catch { return []; }
        if (!Array.isArray(data)) return [];
        const cantidades = new Map();
        for (const item of data) {
            if (!item || !productos.has(item.id) || !Number.isSafeInteger(item.cantidad) || item.cantidad < 1) continue;
            cantidades.set(item.id, Math.min(999, (cantidades.get(item.id) || 0) + item.cantidad));
        }
        return Array.from(cantidades, ([id, cantidad]) => ({ ...productos.get(id), cantidad }));
    }

    function reconciliarCarrito(carrito, productos) {
        const cambios = [];
        const items = [];
        for (const item of carrito) {
            const actual = productos.get(item.id);
            if (!actual || actual.precio === null || !actual.stock) {
                cambios.push(`${item.nombre}: ya no está disponible.`);
                continue;
            }
            const cantidad = Math.min(item.cantidad, actual.stock);
            if (cantidad !== item.cantidad) cambios.push(`${actual.nombre}: quedan ${actual.stock} unidades.`);
            if (item.precio !== null && item.precio !== actual.precio) cambios.push(`${actual.nombre}: el precio cambió.`);
            items.push({ ...actual, cantidad });
        }
        return { items, cambios };
    }

    function totalCarrito(items) {
        return items.reduce((sum, item) => sum + Math.round(item.precio * 100) * item.cantidad, 0) / 100;
    }

    function textoBusqueda(text) {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
    }

    function enlaceWhatsApp(numero, items, cliente, pedidoId, estado) {
        const importe = value => `S/ ${value.toFixed(2)}`;
        const lineas = [
            '*PEDIDO LUXEPOINT USA*', `Referencia: ${pedidoId}`, '',
            estado === 'confirmado' ? 'Reserva registrada. Pago pendiente de coordinar.' :
                'Registro por confirmar. Por favor, revisen esta referencia antes de descontar stock otra vez.', '',
            '*DATOS DEL CLIENTE*', `Nombre: ${cliente.nombre}`, `DNI / CE: ${cliente.dni}`,
            `Teléfono: ${cliente.telefono}`, `Correo: ${cliente.correo || 'No indicado'}`, '',
            '*ENTREGA*', `Dirección: ${cliente.direccion}`, `Distrito / provincia: ${cliente.distrito}`,
            `Referencia: ${cliente.referencia || 'Sin referencia'}`, '',
            `Método de pago: ${cliente.pago}`, '', '*PRODUCTOS*',
            ...items.map((item, index) => `${index + 1}. ${item.nombre} × ${item.cantidad} — ${importe(item.precio * item.cantidad)}`), '',
            `*Subtotal de productos: ${importe(totalCarrito(items))}*`,
            'Entrega y total final por confirmar con la tienda.'
        ];
        if (cliente.pago === 'Tarjeta') lineas.push('Deseo recibir el enlace de pago de Mercado Pago.');
        return `https://wa.me/${numero}?text=${encodeURIComponent(lineas.join('\n'))}`;
    }

    // Un HTTP 200, un cuerpo vacío o una respuesta opaca no confirman una reserva.
    function estadoRespuesta(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return 'desconocido';
        if (data.success === false || data.ok === false || data.status === 'error' || data.error) return 'desconocido';
        if (data.success === true || data.ok === true || data.status === 'success' || data.status === 'ok') return 'confirmado';
        return 'desconocido';
    }

    async function solicitarJSON(url, options = {}, fetchFn = fetch, timeout = 20000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetchFn(url, { ...options, signal: controller.signal });
            if (!response.ok || response.type === 'opaque') throw new Error('Respuesta no verificable');
            return await response.json();
        } finally { clearTimeout(timer); }
    }

    return { precioNumero, normalizarCatalogo, restaurarCarrito, reconciliarCarrito, totalCarrito,
        textoBusqueda, enlaceWhatsApp, estadoRespuesta, solicitarJSON };
});
