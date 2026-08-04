// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================

// URL DE TU APPS SCRIPT
const URL_API_GOOGLE_SHEETS = "https://script.google.com/macros/s/AKfycbzxpf_0OB3jC3HuIweE4xRiWdw1QP17lCoAL-DaE9OLGA2jQTx80kRACBkjxQSZ_G6DsQ/exec";

// NÚMERO DE WHATSAPP (Perú)
const NUMERO_WHATSAPP = "51978398707";

// MERCADO PAGO - PUBLIC KEY
const PUBLIC_KEY_MERCADOPAGO = "APP_USR-80f6396e-c6c7-420b-83b6-5f56cb015040";

// Inicializar Mercado Pago (Si el SDK se cargó correctamente en el <head>)
let mp = null;
if (typeof MercadoPago !== 'undefined') {
    mp = new MercadoPago(PUBLIC_KEY_MERCADOPAGO, { locale: 'es-PE' });
}

let carrito = JSON.parse(localStorage.getItem('luxepoint_carrito')) || [];

// ==========================================
// INICIALIZACIÓN Y EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    actualizarCarritoUI();
    sincronizarStockDesdeGoogleSheets();

    // Modales y Eventos UI
    const cartBtn = document.getElementById('cart-btn');
    const modalCarrito = document.getElementById('modal-carrito');
    const cerrarCarrito = document.getElementById('cerrar-carrito');
    const modalCheckout = document.getElementById('modal-checkout');
    const btnIrCheckout = document.getElementById('btn-ir-checkout');
    const cerrarCheckout = document.getElementById('cerrar-checkout');
    const formCheckout = document.getElementById('form-checkout');

    if (cartBtn && modalCarrito) {
        cartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modalCarrito.classList.add('active');
        });
    }

    if (cerrarCarrito && modalCarrito) {
        cerrarCarrito.addEventListener('click', () => modalCarrito.classList.remove('active'));
    }

    if (btnIrCheckout && modalCheckout && modalCarrito) {
        btnIrCheckout.addEventListener('click', () => {
            if (carrito.length === 0) {
                alert('Tu carrito está vacío.');
                return;
            }
            modalCarrito.classList.remove('active');
            modalCheckout.classList.add('active');
        });
    }

    if (cerrarCheckout && modalCheckout) {
        cerrarCheckout.addEventListener('click', () => modalCheckout.classList.remove('active'));
    }

    window.addEventListener('click', (e) => {
        if (e.target === modalCarrito) modalCarrito.classList.remove('active');
        if (e.target === modalCheckout) modalCheckout.classList.remove('active');
    });

    // Agregar al carrito mediante eventos delegados
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('btn-add-cart')) {
            const tarjeta = e.target.closest('.producto-card');

            const producto = {
                id: tarjeta.querySelector('h4').innerText.trim(),
                nombre: tarjeta.querySelector('h4').innerText.trim(),
                precio: parseFloat(tarjeta.querySelector('.precio').innerText.replace('S/.', '').replace('S/', '').trim()),
                imagen: tarjeta.querySelector('.producto-img img').getAttribute('src'),
                cantidad: 1
            };

            agregarAlCarrito(producto);
        }
    });

    if (formCheckout) {
        formCheckout.addEventListener('submit', (e) => {
            e.preventDefault();
            enviarPedidoWhatsApp();
        });
    }
});

// ==========================================
// CONSULTAR STOCK Y PRECIOS DESDE GOOGLE SHEETS
// ==========================================

async function sincronizarStockDesdeGoogleSheets() {
    if (!URL_API_GOOGLE_SHEETS || URL_API_GOOGLE_SHEETS.includes("PEGA_AQUI")) return;

    try {
        const respuesta = await fetch(URL_API_GOOGLE_SHEETS);
        const dataSheets = await respuesta.json();

        const productos = document.querySelectorAll('.producto-card');
        productos.forEach(card => {
            const tituloElemento = card.querySelector('h4');
            if (!tituloElemento) return;

            const titulo = tituloElemento.innerText.trim();
            const stockSpan = card.querySelector('.stock span');
            const precioElemento = card.querySelector('.precio');
            const boton = card.querySelector('.btn-add-cart');
            const tagContainer = card.querySelector('.producto-img');

            if (dataSheets[titulo] !== undefined) {
                const infoProducto = dataSheets[titulo];

                // 1. Actualizar Precio
                if (infoProducto.precio !== undefined && infoProducto.precio !== "" && precioElemento) {
                    const nuevoPrecio = parseFloat(infoProducto.precio);
                    precioElemento.innerText = `S/. ${nuevoPrecio.toFixed(2)}`;
                }

                // 2. Actualizar Stock
                if (stockSpan && infoProducto.stock !== undefined) {
                    const stockDisponible = parseInt(infoProducto.stock);
                    stockSpan.innerText = stockDisponible;

                    if (stockDisponible <= 0 && boton) {
                        boton.disabled = true;
                        boton.innerText = "Agotado";
                        boton.style.backgroundColor = "#cccccc";
                        boton.style.color = "#666666";
                        boton.style.cursor = "not-allowed";

                        let tagAgotado = tagContainer ? tagContainer.querySelector('.tag-agotado') : null;
                        if (!tagAgotado && tagContainer) {
                            tagAgotado = document.createElement('span');
                            tagAgotado.className = 'tag tag-agotado';
                            tagAgotado.style.backgroundColor = '#e74c3c';
                            tagAgotado.style.color = '#ffffff';
                            tagAgotado.innerText = 'Agotado';
                            tagContainer.appendChild(tagAgotado);
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error al consultar Google Sheets:", error);
    }
}

// ==========================================
// FUNCIONES DEL CARRITO DE COMPRAS
// ==========================================

function filtrarCategoria(categoria) {
    const seccionNovedades = document.getElementById('novedades');
    const productos = document.querySelectorAll('.producto-card');

    if (seccionNovedades) seccionNovedades.style.display = 'block';

    productos.forEach(producto => {
        const categoriaProducto = producto.getAttribute('data-categoria');
        if (categoria === 'todos' || categoriaProducto === categoria) {
            producto.style.display = 'block';
            producto.style.opacity = '0';
            setTimeout(() => {
                producto.style.transition = 'opacity 0.4s ease';
                producto.style.opacity = '1';
            }, 50);
        } else {
            producto.style.display = 'none';
        }
    });

    if (seccionNovedades) seccionNovedades.scrollIntoView({ behavior: 'smooth' });
}

function agregarAlCarrito(productoNuevo) {
    const existe = carrito.find(item => item.id === productoNuevo.id);

    if (existe) {
        existe.cantidad += 1;
    } else {
        carrito.push(productoNuevo);
    }

    guardarYActualizar();
    const modalCarrito = document.getElementById('modal-carrito');
    if (modalCarrito) modalCarrito.classList.add('active');
}

function eliminarDelCarrito(id) {
    carrito = carrito.filter(item => item.id !== id);
    guardarYActualizar();
}

function guardarYActualizar() {
    localStorage.setItem('luxepoint_carrito', JSON.stringify(carrito));
    actualizarCarritoUI();
}

function actualizarCarritoUI() {
    const contenedorItems = document.getElementById('items-carrito');
    const badge = document.querySelector('.badge');
    const totalElemento = document.getElementById('total-carrito');

    if (!contenedorItems) return;

    const totalCantidad = carrito.reduce((acc, item) => acc + item.cantidad, 0);
    if (badge) badge.innerText = totalCantidad;

    if (carrito.length === 0) {
        contenedorItems.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío.</p>';
        if (totalElemento) totalElemento.innerText = 'S/. 0.00';
        return;
    }

    contenedorItems.innerHTML = '';
    let totalPrecio = 0;

    carrito.forEach(item => {
        const subtotal = item.precio * item.cantidad;
        totalPrecio += subtotal;

        const idLimpio = item.id.replace(/'/g, "\\'");

        const itemDiv = document.createElement('div');
        itemDiv.classList.add('item-carrito');
        itemDiv.innerHTML = `
            <img src="${item.imagen}" alt="${item.nombre}">
            <div class="item-detalles">
                <h5>${item.nombre}</h5>
                <p>S/. ${item.precio.toFixed(2)} x ${item.cantidad}</p>
                <strong>Subtotal: S/. ${subtotal.toFixed(2)}</strong>
            </div>
            <button class="btn-eliminar" onclick="eliminarDelCarrito('${idLimpio}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        contenedorItems.appendChild(itemDiv);
    });

    if (totalElemento) {
        totalElemento.innerText = `S/. ${totalPrecio.toFixed(2)}`;
    }
}

// ==========================================
// PROCESAMIENTO DE PEDIDOS Y PAGOS
// ==========================================

// 🟢 OPCIÓN 1: PEDIDO POR WHATSAPP (Yape / Plin / Transferencia)
async function enviarPedidoWhatsApp() {
    const nombre = document.getElementById('cliente-nombre').value.trim();
    const dni = document.getElementById('cliente-dni').value.trim();
    const telefono = document.getElementById('cliente-telefono').value.trim();
    const correo = document.getElementById('cliente-correo').value.trim() || "No especificado";
    const direccion = document.getElementById('cliente-direccion').value.trim();
    const distrito = document.getElementById('cliente-distrito').value.trim();
    const referencia = document.getElementById('cliente-referencia').value.trim() || "Sin referencia";
    
    const pagoChecked = document.querySelector('input[name="pago"]:checked');
    const metodoPago = pagoChecked ? pagoChecked.value : "No seleccionado";

    // Actualizar stock en Google Sheets
    if (URL_API_GOOGLE_SHEETS) {
        try {
            await fetch(URL_API_GOOGLE_SHEETS, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: carrito })
            });
        } catch (error) {
            console.error("Error al actualizar stock:", error);
        }
    }

    let mensaje = `*NUEVO PEDIDO - LUXEPOINT USA*%0A%0A`;
    mensaje += `*DATOS DEL CLIENTE:*%0A`;
    mensaje += `👤 *Nombre:* ${nombre}%0A`;
    mensaje += `🪪 *DNI/CE:* ${dni}%0A`;
    mensaje += `📞 *Teléfono:* ${telefono}%0A`;
    mensaje += `📧 *Correo:* ${correo}%0A%0A`;

    mensaje += `*DIRECCIÓN DE ENTREGA:*%0A`;
    mensaje += `📍 *Dirección:* ${direccion}%0A`;
    mensaje += `🏙️ *Distrito/Prov:* ${distrito}%0A`;
    mensaje += `📌 *Referencia:* ${referencia}%0A%0A`;

    mensaje += `💳 *Método de Pago:* ${metodoPago}%0A%0A`;

    mensaje += `*DETALLE DEL PEDIDO:*%0A`;
    let totalPrecio = 0;
    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        totalPrecio += subtotal;
        mensaje += `${index + 1}. ${item.nombre} (x${item.cantidad}) - S/. ${subtotal.toFixed(2)}%0A`;
    });

    mensaje += `%0A💰 *TOTAL A PAGAR: S/. ${totalPrecio.toFixed(2)}*`;

    const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${mensaje}`;
    window.open(url, '_blank');

    carrito = [];
    guardarYActualizar();

    const modalCheckout = document.getElementById('modal-checkout');
    if (modalCheckout) modalCheckout.classList.remove('active');
}

// 💳 OPCIÓN 2: SOLICITAR LINK DE PAGO MERCADO PAGO VÍA WHATSAPP
async function pagarConMercadoPago() {
    if (!carrito || carrito.length === 0) {
        alert("Tu carrito está vacío. Agrega productos antes de realizar el pedido.");
        return;
    }

    const nombre = document.getElementById('cliente-nombre').value.trim();
    const dni = document.getElementById('cliente-dni').value.trim();
    const telefono = document.getElementById('cliente-telefono').value.trim();
    const correo = document.getElementById('cliente-correo').value.trim() || "No especificado";
    const direccion = document.getElementById('cliente-direccion').value.trim();
    const distrito = document.getElementById('cliente-distrito').value.trim();
    const referencia = document.getElementById('cliente-referencia').value.trim() || "Sin referencia";

    // Validar que los campos obligatorios estén llenos
    if (!nombre || !dni || !telefono || !direccion || !distrito) {
        alert("Por favor completa los campos obligatorios de envío (Nombre, DNI, Teléfono, Dirección y Distrito).");
        return;
    }

    // Actualizar stock en Google Sheets
    if (URL_API_GOOGLE_SHEETS) {
        try {
            await fetch(URL_API_GOOGLE_SHEETS, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: carrito })
            });
        } catch (error) {
            console.error("Error al actualizar stock:", error);
        }
    }

    let mensaje = `*NUEVO PEDIDO - SOLICITUD DE PAGO CON TARJETA (MERCADO PAGO)*%0A%0A`;
    mensaje += `*DATOS DEL CLIENTE:*%0A`;
    mensaje += `👤 *Nombre:* ${nombre}%0A`;
    mensaje += `🪪 *DNI/CE:* ${dni}%0A`;
    mensaje += `📞 *Teléfono:* ${telefono}%0A`;
    mensaje += `📧 *Correo:* ${correo}%0A%0A`;

    mensaje += `*DIRECCIÓN DE ENTREGA:*%0A`;
    mensaje += `📍 *Dirección:* ${direccion}%0A`;
    mensaje += `🏙️ *Distrito/Prov:* ${distrito}%0A`;
    mensaje += `📌 *Referencia:* ${referencia}%0A%0A`;

    mensaje += `💳 *Método de Pago:* Tarjeta Crédito / Débito (Mercado Pago)%0A%0A`;

    mensaje += `*DETALLE DEL PEDIDO:*%0A`;
    let totalPrecio = 0;
    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        totalPrecio += subtotal;
        mensaje += `${index + 1}. ${item.nombre} (x${item.cantidad}) - S/. ${subtotal.toFixed(2)}%0A`;
    });

    mensaje += `%0A💰 *TOTAL A PAGAR: S/. ${totalPrecio.toFixed(2)}*%0A%0A`;
    mensaje += `_Hola, deseo pagar con tarjeta de crédito/débito. Por favor envíenme el link de pago de Mercado Pago para concretar mi compra._`;

    const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${mensaje}`;
    window.open(url, '_blank');

    carrito = [];
    guardarYActualizar();

    const modalCheckout = document.getElementById('modal-checkout');
    if (modalCheckout) modalCheckout.classList.remove('active');
}
// ==========================================
// AVISO TEMPORIZADO DE SORTEO (50 SEGUNDOS)
// ==========================================

let tiempoRestanteSorteo = 50;
let intervaloSorteo = null;

function iniciarSorteoAviso() {
    const modal = document.getElementById('modal-sorteo');
    const timerElem = document.getElementById('timer-sorteo');
    const progressFill = document.getElementById('progress-fill');
    const btnCerrar = document.getElementById('btn-cerrar-sorteo');

    if (!modal) return;

    // Mostrar el modal tras 1.5 segundos de cargar la página
    setTimeout(() => {
        modal.classList.add('active');

        intervaloSorteo = setInterval(() => {
            tiempoRestanteSorteo--;
            if (timerElem) timerElem.innerText = tiempoRestanteSorteo;

            // Actualizar la barra de progreso proporcionalmente
            if (progressFill) {
                const porcentaje = (tiempoRestanteSorteo / 50) * 100;
                progressFill.style.width = `${porcentaje}%`;
            }

            if (tiempoRestanteSorteo <= 0) {
                cerrarSorteoModal();
            }
        }, 1000);
    }, 1500);

    if (btnCerrar) {
        btnCerrar.addEventListener('click', cerrarSorteoModal);
    }
}

function cerrarSorteoModal() {
    const modal = document.getElementById('modal-sorteo');
    if (modal) modal.classList.remove('active');
    if (intervaloSorteo) clearInterval(intervaloSorteo);
}

// Ejecutar el temporizador cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    iniciarSorteoAviso();
});
