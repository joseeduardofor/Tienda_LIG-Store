const API_URL = 'https://fakestoreapi.com/products';
const STORAGE_KEY = 'ilg_store_cart';
const favorites = new Set();

let allProducts = [];
let currentCategory = 'todos';
let currentSearch = '';
let currentMode = 'all';
let currentMaxPrice = 1000;
let currentSort = 'featured';
let cart = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let modalQty = 1;
let lastPurchase = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (n) => `$${Number(n).toFixed(2)}`;

function escapeHtml(str = '') {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function saveCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

function normalizeProduct(product) {
  return {
    ...product,
    category: product.category || 'General',
    rating: product.rating || { rate: 4.5, count: 120 },
    image: product.image || `images/products/product-${(product.id % 20) + 1}.svg`,
    stock: product.stock ?? 12,
    sales: product.sales ?? Math.round(Math.random() * 120 + 40),
    featured: product.featured ?? false,
    isNew: product.isNew ?? false,
    offer: product.offer ?? false
  };
}

async function loadProducts() {
  $('#loadingState').classList.remove('d-none');
  $('#errorState').classList.add('d-none');
  $('#productsGrid').innerHTML = '';
  $('#sectionStack').innerHTML = '';

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('API no disponible');
    const data = await response.json();
    allProducts = data.map(normalizeProduct);
  } catch (error) {
    console.warn('Usando datos locales', error);
    allProducts = window.fallbackProducts?.map(normalizeProduct) || [];
    $('#errorState').classList.remove('d-none');
  } finally {
    $('#loadingState').classList.add('d-none');
    buildCategoryChips();
    renderSections();
    renderProducts();
  }
}

function buildCategoryChips() {
  const categories = ['todos', ...new Set(allProducts.map((p) => p.category))];
  const wrap = $('#categoryChips');
  wrap.innerHTML = categories.map((category) => `
    <button class="chip ${category === currentCategory ? 'active' : ''}" data-cat="${category}" type="button">
      ${escapeHtml(category)}
    </button>
  `).join('');

  wrap.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.cat;
      wrap.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'));
      btn.classList.add('active');
      renderProducts();
    });
  });
}

function getFilteredProducts() {
  const search = currentSearch.trim().toLowerCase();
  return allProducts
    .filter((product) => {
      const categoryOk = currentCategory === 'todos' || product.category === currentCategory;
      const priceOk = product.price <= currentMaxPrice;
      const modeOk =
        currentMode === 'all' ||
        (currentMode === 'featured' && product.featured) ||
        (currentMode === 'new' && product.isNew) ||
        (currentMode === 'offers' && product.offer) ||
        (currentMode === 'popular' && product.sales > 90) ||
        (currentMode === 'rated' && product.rating.rate >= 4.7);
      const searchOk = !search || [product.title, product.category, String(product.price)].some((value) => value.toLowerCase().includes(search));
      return categoryOk && priceOk && modeOk && searchOk;
    })
    .sort((a, b) => {
      switch (currentSort) {
        case 'rating': return b.rating.rate - a.rating.rate;
        case 'sales': return b.sales - a.sales;
        case 'price-asc': return a.price - b.price;
        case 'price-desc': return b.price - a.price;
        default: return Number(b.featured) - Number(a.featured);
      }
    });
}

function renderSections() {
  const featured = [...allProducts].filter((p) => p.featured).slice(0, 4);
  const news = [...allProducts].filter((p) => p.isNew).slice(0, 4);
  const bestSellers = [...allProducts].sort((a, b) => b.sales - a.sales).slice(0, 4);
  const offers = [...allProducts].filter((p) => p.offer).slice(0, 4);

  const cards = [
    { title: 'Productos destacados', items: featured },
    { title: 'Productos nuevos', items: news },
    { title: 'Más vendidos', items: bestSellers },
    { title: 'Ofertas del día', items: offers }
  ];

  $('#sectionStack').innerHTML = cards.map((section) => `
    <section class="section-card">
      <h3>${escapeHtml(section.title)}</h3>
      <div class="section-grid">
        ${section.items.map((product) => `
          <article class="product-card">
            <div class="card-top">
              <span class="product-badge"><i class="fa-solid fa-bolt"></i>${escapeHtml(product.category)}</span>
              <button class="favorite-btn ${favorites.has(product.id) ? 'active' : ''}" type="button" data-fav-id="${product.id}" aria-label="Favorito">
                <i class="fa-solid fa-heart"></i>
              </button>
            </div>
            <div class="product-image">
              <img src="${product.image}" alt="${escapeHtml(product.title)}" loading="lazy">
            </div>
            <div class="product-info">
              <div class="product-title">${escapeHtml(product.title)}</div>
              <div class="product-meta">
                <span><i class="fa-solid fa-star"></i>${product.rating.rate.toFixed(1)}</span>
                <span>${product.sales} ventas</span>
              </div>
              <div class="product-price">${fmt(product.price)}</div>
              <div class="availability">${product.stock > 0 ? `Disponible · ${product.stock} en stock` : 'Agotado'}</div>
            </div>
            <div class="product-actions">
              <button class="btn btn-primary" type="button" data-open-id="${product.id}">Ver detalles</button>
              <button class="btn btn-secondary" type="button" data-add-id="${product.id}">Agregar</button>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');

  bindSectionEvents();
}

function bindSectionEvents() {
  $$('#sectionStack [data-open-id]').forEach((button) => {
    button.addEventListener('click', () => openProductModal(Number(button.dataset.openId)));
  });
  $$('#sectionStack [data-add-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = allProducts.find((item) => item.id === Number(button.dataset.addId));
      if (product) addToCart(product, 1);
    });
  });
  $$('#sectionStack [data-fav-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.favId);
      if (favorites.has(id)) {
        favorites.delete(id);
      } else {
        favorites.add(id);
      }
      button.classList.toggle('active', favorites.has(id));
      updateFavoritesCount();
    });
  });
}

function updateFavoritesCount() {
  $('#favoritesCount').textContent = favorites.size;
}

function renderProducts() {
  const list = getFilteredProducts();
  const grid = $('#productsGrid');

  if (!list.length) {
    grid.innerHTML = '';
    $('#noResults').classList.remove('d-none');
    return;
  }

  $('#noResults').classList.add('d-none');
  grid.innerHTML = list.map((product) => `
    <article class="product-card">
      <div class="card-top">
        <span class="product-badge"><i class="fa-solid fa-bolt"></i>${escapeHtml(product.category)}</span>
        <button class="favorite-btn ${favorites.has(product.id) ? 'active' : ''}" type="button" data-fav-id="${product.id}" aria-label="Favorito">
          <i class="fa-solid fa-heart"></i>
        </button>
      </div>
      <div class="product-image">
        <img src="${product.image}" alt="${escapeHtml(product.title)}" loading="lazy">
      </div>
      <div class="product-info">
        <div class="product-title">${escapeHtml(product.title)}</div>
        <div class="product-meta">
          <span><i class="fa-solid fa-star"></i>${product.rating.rate.toFixed(1)}</span>
          <span>${product.sales} ventas</span>
        </div>
        <div class="product-price">${fmt(product.price)}</div>
        <div class="availability">${product.stock > 0 ? `Disponible · ${product.stock} en stock` : 'Agotado'}</div>
      </div>
      <div class="product-actions">
        <button class="btn btn-primary" type="button" data-open-id="${product.id}">Ver detalles</button>
        <button class="btn btn-secondary" type="button" data-add-id="${product.id}">Agregar</button>
      </div>
    </article>
  `).join('');

  bindProductEvents();
}

function bindProductEvents() {
  $$('#productsGrid [data-open-id]').forEach((button) => {
    button.addEventListener('click', () => openProductModal(Number(button.dataset.openId)));
  });
  $$('#productsGrid [data-add-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = allProducts.find((item) => item.id === Number(button.dataset.addId));
      if (product) addToCart(product, 1);
    });
  });
  $$('#productsGrid [data-fav-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.favId);
      if (favorites.has(id)) {
        favorites.delete(id);
      } else {
        favorites.add(id);
      }
      button.classList.toggle('active', favorites.has(id));
      updateFavoritesCount();
    });
  });
}

function openProductModal(id) {
  const product = allProducts.find((item) => item.id === id);
  if (!product) return;

  modalQty = 1;
  $('#productModalBody').innerHTML = `
    <div class="modal-product-image">
      <img src="${product.image}" alt="${escapeHtml(product.title)}">
    </div>
    <h3>${escapeHtml(product.title)}</h3>
    <p>${escapeHtml(product.description)}</p>
    <div class="product-meta">
      <span><i class="fa-solid fa-tag"></i>${escapeHtml(product.category)}</span>
      <span><i class="fa-solid fa-star"></i>${product.rating.rate.toFixed(1)} (${product.rating.count} reseñas)</span>
    </div>
    <div class="product-price">${fmt(product.price)}</div>
    <div class="qty-control">
      <button type="button" id="qtyMinus">−</button>
      <span id="qtyValue">1</span>
      <button type="button" id="qtyPlus">+</button>
    </div>
    <div class="product-actions">
      <button class="btn btn-primary w-100" type="button" id="addToCartBtn">Agregar al carrito</button>
    </div>
  `;

  $('#qtyMinus').addEventListener('click', () => {
    if (modalQty > 1) modalQty -= 1;
    $('#qtyValue').textContent = modalQty;
  });
  $('#qtyPlus').addEventListener('click', () => {
    modalQty += 1;
    $('#qtyValue').textContent = modalQty;
  });
  $('#addToCartBtn').addEventListener('click', () => {
    addToCart(product, modalQty);
    bootstrap.Modal.getInstance($('#productModal')).hide();
  });

  new bootstrap.Modal($('#productModal')).show();
}

function addToCart(product, qty = 1) {
  const existing = cart.find((item) => item.id === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id: product.id, title: product.title, price: product.price, image: product.image, qty });
  }
  saveCart();
  renderCart();
  showToast(`${product.title.slice(0, 28)}${product.title.length > 28 ? '…' : ''} agregado`);
}

function changeQty(id, delta) {
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((entry) => entry.id !== id);
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter((entry) => entry.id !== id);
  saveCart();
  renderCart();
}

function renderCart() {
  $('#cartCount').textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  const list = $('#cartItemsList');

  if (!cart.length) {
    list.innerHTML = '';
    $('#cartEmptyState').classList.remove('d-none');
  } else {
    $('#cartEmptyState').classList.add('d-none');
    list.innerHTML = cart.map((item) => `
      <div class="cart-item">
        <img src="${item.image}" alt="${escapeHtml(item.title)}">
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${fmt(item.price)} c/u</p>
          <div class="qty-mini">
            <button type="button" data-qty-id="${item.id}" data-delta="-1">−</button>
            <span>${item.qty}</span>
            <button type="button" data-qty-id="${item.id}" data-delta="1">+</button>
          </div>
        </div>
        <div>
          <strong>${fmt(item.price * item.qty)}</strong>
          <button class="favorite-btn mt-2" type="button" data-remove-id="${item.id}" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-qty-id]').forEach((button) => {
      button.addEventListener('click', () => changeQty(Number(button.dataset.qtyId), Number(button.dataset.delta)));
    });
    list.querySelectorAll('[data-remove-id]').forEach((button) => {
      button.addEventListener('click', () => removeFromCart(Number(button.dataset.removeId)));
    });
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shipping = subtotal > 0 ? 12 : 0;
  $('#cartSubtotal').textContent = fmt(subtotal);
  $('#cartShipping').textContent = fmt(shipping);
  $('#cartTotal').textContent = fmt(subtotal + shipping);
  $('#paymentTotal').textContent = fmt(subtotal + shipping);
}

function showToast(message) {
  $('#toastMsg').textContent = message;
  new bootstrap.Toast($('#cartToast'), { delay: 2200 }).show();
}

$('#checkoutBtn').addEventListener('click', () => {
  if (!cart.length) {
    showToast('Tu carrito está vacío');
    return;
  }
  bootstrap.Offcanvas.getInstance($('#cartOffcanvas'))?.hide();
  new bootstrap.Modal($('#paymentModal')).show();
});

$('#clearCartBtn').addEventListener('click', () => {
  cart = [];
  saveCart();
  renderCart();
  showToast('Carrito vaciado');
});

$('#cardNumber').addEventListener('input', (event) => {
  const value = event.target.value.replace(/\D/g, '').slice(0, 16);
  event.target.value = value.replace(/(.{4})/g, '$1 ').trim();
});
$('#cardExpiry').addEventListener('input', (event) => {
  let value = event.target.value.replace(/\D/g, '').slice(0, 4);
  if (value.length > 2) value = `${value.slice(0, 2)}/${value.slice(2)}`;
  event.target.value = value;
});
$('#cardCvv').addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
});

$('#paymentForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const name = $('#cardName').value.trim();
  const number = $('#cardNumber').value.replace(/\s/g, '');
  const expiry = $('#cardExpiry').value;
  const cvv = $('#cardCvv').value;

  let valid = true;
  $('#cardName').classList.toggle('is-invalid', name.length < 3);
  $('#cardNumber').classList.toggle('is-invalid', number.length !== 16);
  $('#cardExpiry').classList.toggle('is-invalid', !/^\d{2}\/\d{2}$/.test(expiry));
  $('#cardCvv').classList.toggle('is-invalid', cvv.length < 3);

  if (name.length < 3 || number.length !== 16 || !/^\d{2}\/\d{2}$/.test(expiry) || cvv.length < 3) {
    valid = false;
  }

  if (!valid) return;

  lastPurchase = { name, date: new Date(), items: JSON.parse(JSON.stringify(cart)), total: cart.reduce((sum, item) => sum + item.price * item.qty, 0) + (cart.length ? 12 : 0) };
  bootstrap.Modal.getInstance($('#paymentModal')).hide();
  form.reset();
  form.querySelectorAll('.is-invalid').forEach((field) => field.classList.remove('is-invalid'));
  cart = [];
  saveCart();
  renderCart();
  new bootstrap.Modal($('#successModal')).show();
});

$('#downloadTicketBtn').addEventListener('click', () => {
  if (lastPurchase) generateTicketPDF(lastPurchase);
});

function generateTicketPDF(purchase) {
  const { jsPDF } = window.jspdf;
  const widthMM = 80;
  const lineHeight = 4.6;
  const headerLines = 8;
  const itemLines = purchase.items.length * 2;
  const footerLines = 6;
  const heightMM = (headerLines + itemLines + footerLines) * lineHeight + 20;

  const doc = new jsPDF({ unit: 'mm', format: [widthMM, heightMM] });
  doc.setFont('courier', 'normal');
  let y = 8;
  const cx = widthMM / 2;

  doc.setFontSize(11);
  doc.text('ILG STORE', cx, y, { align: 'center' }); y += 5;
  doc.setFontSize(8);
  doc.text('Compra confirmada', cx, y, { align: 'center' }); y += 5;
  doc.text('--------------------------------', cx, y, { align: 'center' }); y += 5;
  doc.setFontSize(7.5);
  doc.text(`Cliente: ${purchase.name}`, 4, y); y += 4;
  doc.text(`Fecha: ${purchase.date.toLocaleDateString()} ${purchase.date.toLocaleTimeString()}`, 4, y); y += 4;
  doc.text('--------------------------------', cx, y, { align: 'center' }); y += 5;

  purchase.items.forEach((item) => {
    const title = item.title.length > 28 ? `${item.title.slice(0, 28)}...` : item.title;
    doc.text(title, 4, y); y += 3.6;
    doc.text(`  ${item.qty} x ${fmt(item.price)}`, 4, y);
    doc.text(fmt(item.price * item.qty), widthMM - 4, y, { align: 'right' });
    y += 4.4;
  });

  doc.text('--------------------------------', cx, y, { align: 'center' }); y += 5;
  doc.setFontSize(9);
  doc.text('TOTAL', 4, y);
  doc.text(fmt(purchase.total), widthMM - 4, y, { align: 'right' });
  doc.save(`ticket_ilg_store_${Date.now()}.pdf`);
}

$('#searchInput').addEventListener('input', (event) => {
  currentSearch = event.target.value;
  renderProducts();
});

$('#priceInput').addEventListener('input', (event) => {
  currentMaxPrice = Number(event.target.value);
  $('#priceValue').textContent = `Hasta ${fmt(currentMaxPrice)}`;
  renderProducts();
});

$('#sortSelect').addEventListener('change', (event) => {
  currentSort = event.target.value;
  renderProducts();
});

$$('.filter-pill').forEach((button) => {
  button.addEventListener('click', () => {
    currentMode = button.dataset.mode;
    $$('.filter-pill').forEach((pill) => pill.classList.remove('active'));
    button.classList.add('active');
    renderProducts();
  });
});

$('[data-store-name]').textContent = 'ILG Store';
updateFavoritesCount();
renderCart();
loadProducts();
