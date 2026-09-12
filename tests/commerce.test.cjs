const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../commerce.js');
const producto = (extra = {}) => ({ id: 'VS Cake & Cream', nombre: 'VS Cake & Cream', imagen: 'img/test.jpeg', precio: 95, stock: 2, ...extra });

test('lee precios numéricos y formatos de moneda sin aceptar valores parciales', () => {
    for (const [raw, expected] of [[95, 95], ['S/. 95.50', 95.5], ['95,50', 95.5], ['S/ 1,234.50', 1234.5], ['1.234,50', 1234.5]]) assert.equal(C.precioNumero(raw), expected);
    for (const raw of ['', '95 soles', '10abc', '1,234', null, -2, 0, Infinity, 'NaN', true]) assert.equal(C.precioNumero(raw), null);
});

test('ignora stock negativo, fraccionario, nulo o inválido y mantiene agotados', () => {
    const catalogo = C.normalizarCatalogo({ valido: { precio: 95, stock: '2' }, agotado: { precio: '100,50', stock: 0 },
        negativo: { precio: 10, stock: -1 }, fraccion: { precio: 10, stock: 1.5 }, parcial: { precio: 10, stock: '2abc' },
        nulo: { precio: 10, stock: null }, precio: { precio: 'abc', stock: 1 } });
    assert.deepEqual([...catalogo.keys()], ['valido', 'agotado']);
    assert.throws(() => C.normalizarCatalogo({ error: 'No autorizado' }));
    assert.throws(() => C.normalizarCatalogo([]));
});

test('localStorage dañado no rompe el carrito ni permite inyectar nombre, imagen o precio', () => {
    const map = new Map([['VS Cake & Cream', producto()]]);
    assert.deepEqual(C.restaurarCarrito('{', map), []);
    assert.deepEqual(C.restaurarCarrito('null', map), []);
    const items = C.restaurarCarrito(JSON.stringify([
        { id: 'VS Cake & Cream', cantidad: 1, precio: .01, nombre: '<img onerror=alert(1)>', imagen: 'javascript:alert(1)' },
        { id: 'inventado', cantidad: 100 }, { id: 'VS Cake & Cream', cantidad: -1 }, { id: 'VS Cake & Cream', cantidad: 1 }
    ]), map);
    assert.equal(items.length, 1); assert.equal(items[0].cantidad, 2); assert.equal(items[0].precio, 95);
    assert.equal(items[0].nombre, 'VS Cake & Cream'); assert.equal(items[0].imagen, 'img/test.jpeg');
});

test('antes de comprar actualiza precios, limita cantidad y retira productos agotados o ausentes', () => {
    const map = new Map([['VS Cake & Cream', producto({ precio: 100, stock: 1 })], ['Agotado', producto({ id: 'Agotado', stock: 0 })]]);
    const result = C.reconciliarCarrito([producto({ cantidad: 5 }), producto({ id: 'Agotado', cantidad: 1 }), producto({ id: 'Ausente', cantidad: 1 })], map);
    assert.equal(result.items.length, 1); assert.equal(result.items[0].cantidad, 1); assert.equal(result.items[0].precio, 100);
    assert.equal(result.cambios.length, 4); assert.equal(C.totalCarrito(result.items), 100);
});

test('calcula en céntimos y permite búsquedas sin tildes', () => {
    assert.equal(C.totalCarrito([{ precio: .1, cantidad: 1 }, { precio: .2, cantidad: 1 }]), .3);
    assert.equal(C.textoBusqueda(' DÚO Clásico '), 'duo clasico');
});

test('el mensaje conserva &, #, tildes y signos, y la tarjeta solicita un enlace de pago', () => {
    const cliente = { nombre: 'Prueba & QA', dni: 'TEST0000', telefono: '000000000', correo: 'qa@example.com', direccion: 'Calle #12 & 13', distrito: 'Prueba', referencia: '100% prueba', pago: 'Tarjeta' };
    const link = C.enlaceWhatsApp('51978398707', [producto({ cantidad: 1 })], cliente, 'LP-test0000', 'desconocido');
    const url = new URL(link); assert.equal([...url.searchParams.keys()].length, 1);
    const texto = url.searchParams.get('text');
    for (const expected of ['Prueba & QA', 'VS Cake & Cream', 'Calle #12 & 13', '100% prueba', 'Mercado Pago', 'S/ 95.00', 'Registro por confirmar']) assert.ok(texto.includes(expected));
    assert.equal(url.hash, '');
});

test('exige confirmación explícita, incluso ante respuestas con errores contradictorios', () => {
    for (const result of [null, '', {}, [], { status: 'unknown' }, { success: false }, { error: 'stock' }, { success: true, error: 'stock' }]) assert.equal(C.estadoRespuesta(result), 'desconocido');
    for (const result of [{ success: true }, { ok: true }, { status: 'success' }, { status: 'ok' }]) assert.equal(C.estadoRespuesta(result), 'confirmado');
});

test('rechaza HTTP fallido, respuesta opaca, JSON roto y timeout; no reintenta un POST', async () => {
    for (const response of [{ ok: false }, { ok: true, type: 'opaque' }, { ok: true, json: async () => { throw new Error('HTML'); } }]) {
        let calls = 0;
        await assert.rejects(C.solicitarJSON('https://example.com', { method: 'POST' }, async () => { calls++; return response; }));
        assert.equal(calls, 1);
    }
    await assert.rejects(C.solicitarJSON('https://example.com', {}, async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('AbortError')))), 5));
    assert.deepEqual(await C.solicitarJSON('https://example.com', {}, async () => ({ ok: true, json: async () => ({ success: true }) })), { success: true });
});
