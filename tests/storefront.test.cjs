const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = ['commerce.js', 'main.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8'));
const settle = () => new Promise(resolve => setImmediate(resolve));

async function tienda(options = {}) {
    const dom = new JSDOM(html, { url: 'https://tienda.example.test/', runScripts: 'outside-only' });
    const w = dom.window, d = w.document;
    const saved = options.saved || new Map();
    Object.defineProperty(w, 'localStorage', { value: {
        getItem: key => saved.get(key) ?? null,
        setItem: (key, value) => saved.set(key, value),
        removeItem: key => saved.delete(key)
    } });
    w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.matchMedia = () => ({ matches: false });
    const catalogo = Object.fromEntries([...d.querySelectorAll('.producto-card h4')].map((p, i) => [p.textContent.trim(), { precio: 100 + i * 10, stock: 2 }]));
    const estado = options.estado || { catalogo, posts: [], respuesta: { success: true }, fallo: false };
    w.fetch = async (url, init) => {
        assert.equal(url, 'https://script.google.com/macros/s/AKfycbzxpf_0OB3jC3HuIweE4xRiWdw1QP17lCoAL-DaE9OLGA2jQTx80kRACBkjxQSZ_G6DsQ/exec');
        if (init.method === 'POST') {
            estado.posts.push(JSON.parse(init.body));
            assert.equal(init.headers['Content-Type'], 'text/plain;charset=utf-8');
            assert.notEqual(init.mode, 'no-cors');
            if (estado.fallo) throw new Error('Respuesta perdida después de procesar');
            return { ok: true, json: async () => estado.respuesta };
        }
        return { ok: true, json: async () => JSON.parse(JSON.stringify(estado.catalogo)) };
    };
    for (const script of scripts) w.eval(script);
    await settle();
    const submit = () => d.getElementById('form-checkout').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    const llenar = () => {
        for (const [campo, value] of Object.entries({ nombre: 'QA & Demostración', dni: 'TEST0000', telefono: '000000000', correo: 'qa@example.test', direccion: 'Dirección #1 & prueba', distrito: 'Distrito de prueba' })) d.getElementById(`cliente-${campo}`).value = value;
    };
    return { dom, w, d, saved, estado, submit, llenar };
}

test('catálogo visible, búsqueda, categorías, menú móvil y estados vacío / agotado / repuesto', async t => {
    const s = await tienda(); t.after(() => s.dom.window.close());
    const { d, w, estado } = s;
    assert.equal(d.getElementById('resultados').textContent, '33 de 33 productos');
    assert.equal(d.querySelector('.btn-add-cart').disabled, false);
    d.getElementById('menu-btn').click(); assert.equal(d.getElementById('menu-btn').getAttribute('aria-expanded'), 'true');
    d.querySelector('.dropdown-categorias [data-filter="termos"]').click();
    assert.equal(d.querySelectorAll('.producto-card:not([hidden])').length, 6);
    assert.equal(d.getElementById('menu-categorias').hidden, true);
    d.getElementById('buscar-productos').value = 'inexistente'; d.getElementById('buscar-productos').dispatchEvent(new w.Event('input'));
    assert.equal(d.getElementById('sin-resultados').hidden, false);
    d.getElementById('limpiar-filtros').click();
    const id = d.querySelector('.producto-card h4').textContent;
    estado.catalogo[id].stock = 0; d.getElementById('actualizar-stock').click(); await settle();
    assert.equal(d.querySelector('.btn-add-cart').textContent, 'Agotado');
    estado.catalogo[id].stock = 3; d.getElementById('actualizar-stock').click(); await settle();
    assert.equal(d.querySelector('.btn-add-cart').disabled, false);
    assert.equal(d.querySelector('.tag-agotado'), null);
});

test('límites de cantidad y cambio de precio exigen revisión; confirmación y doble envío', async t => {
    const s = await tienda(); t.after(() => s.dom.window.close());
    const { d, estado } = s;
    d.querySelector('.btn-add-cart').click();
    d.querySelector('.quantity-control button:last-child').click();
    assert.equal(d.querySelector('.quantity-control span').textContent, '2');
    assert.equal(d.querySelector('.quantity-control button:last-child').disabled, true);
    d.getElementById('btn-ir-checkout').click(); s.llenar();
    const id = d.querySelector('.producto-card h4').textContent;
    estado.catalogo[id] = { precio: 150, stock: 1 };
    s.submit(); await settle();
    assert.equal(estado.posts.length, 0);
    assert.match(d.getElementById('aviso-carrito').textContent, /precio cambió/);
    assert.equal(d.querySelector('.quantity-control span').textContent, '1');
    d.getElementById('btn-ir-checkout').click();
    s.submit(); s.submit(); await settle();
    assert.equal(estado.posts.length, 1);
    assert.equal(estado.posts[0].items[0].precio, 150);
    assert.equal(estado.posts[0].items[0].cantidad, 1);
    assert.match(estado.posts[0].pedidoId, /^LP-/);
    assert.equal(d.querySelector('.badge').textContent, '0');
    assert.match(d.getElementById('estado-pedido').textContent, /Reserva registrada/);
    const href = d.getElementById('abrir-whatsapp').href;
    assert.match(new URL(href).searchParams.get('text'), /QA & Demostración/);
    d.getElementById('volver-carrito').click(); d.getElementById('btn-ir-checkout').click();
    assert.equal(d.getElementById('abrir-whatsapp').href, href);
    assert.match(d.getElementById('resumen-checkout').textContent, /S\/ 150.00/);
    s.submit(); await settle(); assert.equal(estado.posts.length, 1);
});

test('respuesta perdida mantiene carrito y bloquea reenvío incluso después de recargar', async t => {
    const s = await tienda(); t.after(() => s.dom.window.close());
    s.d.querySelector('.btn-add-cart').click(); s.d.getElementById('btn-ir-checkout').click(); s.llenar();
    s.estado.fallo = true; s.submit(); await settle();
    assert.equal(s.estado.posts.length, 1);
    assert.equal(s.d.querySelector('.badge').textContent, '1');
    assert.match(s.d.getElementById('estado-pedido').textContent, /Puede haberse descontado stock/);
    const serialized = [...s.saved.values()].join(' ');
    assert.ok(!serialized.includes('QA & Demostración'));
    assert.ok(!serialized.includes('TEST0000'));
    s.submit(); await settle(); assert.equal(s.estado.posts.length, 1);
    const reload = await tienda({ saved: s.saved, estado: s.estado }); t.after(() => reload.dom.window.close());
    reload.submit(); await settle(); assert.equal(s.estado.posts.length, 1);
    assert.equal(reload.d.querySelector('.btn-add-cart').disabled, true);
    assert.equal(reload.d.getElementById('abrir-whatsapp').hidden, false);
});

test('catálogo inválido y almacenamiento alterado nunca habilitan compras con precios antiguos', async t => {
    const saved = new Map([['luxepoint_carrito', '{JSON dañado']]);
    const s = await tienda({ saved }); t.after(() => s.dom.window.close());
    assert.equal(s.d.querySelector('.badge').textContent, '0');
    s.estado.catalogo = { error: 'Catálogo temporalmente no disponible' };
    s.d.getElementById('actualizar-stock').click(); await settle();
    assert.equal(s.d.querySelector('.btn-add-cart').disabled, true);
    assert.equal(s.d.getElementById('btn-ir-checkout').disabled, true);
    assert.match(s.d.getElementById('estado-stock').textContent, /No pudimos verificar/);
    assert.equal(s.estado.posts.length, 0);
});
