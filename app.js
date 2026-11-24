import {
  auth,
  browserLocalPersistence,
  collection,
  createUserWithEmailAndPassword,
  db,
  doc,
  firebaseConfigurationError,
  firebaseConfigured,
  getCountFromServer,
  getDocs,
  limit,
  onAuthStateChanged,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  firebaseSignOut,
  updateDoc,
  updateProfile,
  where,
  writeBatch
} from "./firebase.js";

"use strict";

const MAX_QUANTITY = 999999;
const DEFAULT_CATEGORIES = ["Pantry", "Drinks", "Home goods", "Personal care", "Accessories", "Other"];
const productDialog = document.querySelector("#product-dialog");
const stockDialog = document.querySelector("#stock-dialog");
const accountDialog = document.querySelector("#account-dialog");
const profileDialog = document.querySelector("#profile-dialog");
const productForm = document.querySelector("#product-form");
const stockForm = document.querySelector("#stock-form");

let state = { products: [], activity: [], activityCount: 0 };
let showLowStock = false;
let showArchived = false;
let errorToastTimer;
let currentUser = null;
let authMode = "signin";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function setLoading(loading) {
  document.querySelector("#loading-state").hidden = !loading;
  if (loading) {
    document.querySelector("#inventory-table").hidden = true;
    document.querySelector("#empty-state").hidden = true;
    document.querySelector("#error-state").hidden = true;
  }
}

function showInventoryError(error) {
  setLoading(false);
  document.querySelector("#inventory-table").hidden = true;
  document.querySelector("#empty-state").hidden = true;
  document.querySelector("#error-state").hidden = false;
  document.querySelector("#error-description").textContent = error.message || "Please check your connection and try again.";
}

function mapProduct(snapshot) {
  return { id: snapshot.id, ...snapshot.data(), sku: snapshot.data().sku || "" };
}

function mapActivity(snapshot) {
  const row = snapshot.data();
  return {
    id: snapshot.id,
    productId: row.productId,
    productName: row.productName,
    direction: row.direction,
    quantity: row.quantity,
    reason: row.reason,
    timestamp: row.createdAt?.toMillis() || Date.now()
  };
}

async function loadAccountData() {
  setLoading(true);
  try {
    const productsQuery = query(collection(db, "products"), where("ownerId", "==", currentUser.uid));
    const activityQuery = query(
      collection(db, "stockChanges"),
      where("ownerId", "==", currentUser.uid),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const countQuery = query(collection(db, "stockChanges"), where("ownerId", "==", currentUser.uid));
    const [productsSnapshot, activitySnapshot, countSnapshot] = await Promise.all([
      getDocs(productsQuery),
      getDocs(activityQuery),
      getCountFromServer(countQuery)
    ]);
    state = {
      products: productsSnapshot.docs.map(mapProduct),
      activity: activitySnapshot.docs.map(mapActivity),
      activityCount: countSnapshot.data().count
    };
    document.querySelector("#error-state").hidden = true;
    setLoading(false);
    render();
    return true;
  } catch (error) {
    showInventoryError(error);
    showToast(`Could not load your Firebase inventory: ${error.message}`, "error");
    return false;
  }
}

function setProfileInitial(container, user) {
  const initial = container.querySelector("[data-profile-initial]");
  const displayName = user.displayName?.trim() || user.email?.split("@")[0] || "U";
  initial.textContent = displayName.slice(0, 1).toUpperCase();
}

function renderSession() {
  const displayName = currentUser.displayName?.trim() || currentUser.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  document.querySelector("#workspace-mode").innerHTML = "<span></span> Live workspace";
  document.querySelector("#sign-in-button").innerHTML = '<svg class="icon"><use href="#i-logout"/></svg> Sign out';
  document.querySelector("#profile-info strong").textContent = displayName;
  document.querySelector("#profile-info span").textContent = "Your workspace";
  document.querySelector("#profile-display-name").textContent = displayName;
  document.querySelector("#profile-email").textContent = currentUser.email || "";
  document.querySelectorAll(".profile-button, #profile-dialog-avatar").forEach((container) => setProfileInitial(container, currentUser));
  document.querySelector("#app-shell .page-heading h1").innerHTML = `${greeting}, ${escapeHtml(displayName)} <span class="wave" aria-hidden="true">✳</span>`;
  renderAuthDialog();
}

function showLanding() {
  if (profileDialog.open) profileDialog.close();
  currentUser = null;
  document.querySelector("#landing-page").hidden = false;
  document.querySelector("#app-shell").hidden = true;
  document.title = "Stockwise — A calmer way to run your shop";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showProfileDialog() {
  if (!currentUser) return;
  if (!profileDialog.open) profileDialog.showModal();
}

function renderAuthDialog() {
  const signedIn = Boolean(currentUser);
  const form = document.querySelector("#auth-form");
  document.querySelector("#account-dialog-title").textContent = signedIn
    ? "Your Stockwise account"
    : authMode === "signup" ? "Create your account" : "Sign in to your shop";
  document.querySelector("#account-dialog-subtitle").textContent = signedIn
    ? "Your inventory is private to your account."
    : authMode === "signup" ? "Start tracking your shop's inventory." : "Use your account to keep your inventory synced.";
  document.querySelector("#auth-config-warning").hidden = signedIn || firebaseConfigured;
  document.querySelector("#auth-form").hidden = signedIn || !firebaseConfigured;
  document.querySelector("#auth-toggle-line").hidden = signedIn || !firebaseConfigured;
  const signupName = document.querySelector("#signup-name-field");
  const signupNameInput = form.elements.namedItem("displayName");
  const isSigningUp = !signedIn && authMode === "signup";
  signupName.hidden = !isSigningUp;
  signupNameInput.required = isSigningUp;
  document.querySelector("#signed-in-note").hidden = !signedIn;
  document.querySelector("#account-signout").hidden = !signedIn;
  document.querySelector("#signed-in-email").textContent = signedIn ? currentUser.email : "";
  document.querySelector("#auth-submit").textContent = authMode === "signup" ? "Create account" : "Sign in";
  document.querySelector("#auth-toggle-line").firstChild.textContent = authMode === "signup" ? "Already have an account? " : "New to Stockwise? ";
  document.querySelector("#auth-toggle").textContent = authMode === "signup" ? "Sign in" : "Create an account";
  document.querySelector("#auth-config-message").textContent = firebaseConfigurationError
    || "Set your Firebase web app configuration in Vercel to enable secure accounts.";
  if (!signedIn) {
    form.elements.namedItem("password").setAttribute("autocomplete", authMode === "signup" ? "new-password" : "current-password");
  }
}

    async function activateAccount(user) {
      currentUser = user;
      document.querySelector("#landing-page").hidden = true;
      document.querySelector("#app-shell").hidden = false;
      document.title = "Stockwise — Your inventory";
      state = { products: [], activity: [], activityCount: 0 };
      resetFilters();
      renderSession();
      const loaded = await loadAccountData();
      if (loaded) showToast(`Signed in as ${user.email}.`);
    }

    function resetFilters() {
      showLowStock = false;
      showArchived = false;
      document.querySelector("#low-stock-filter").setAttribute("aria-pressed", "false");
      document.querySelector("#archive-filter").setAttribute("aria-pressed", "false");
      document.querySelector("#search-input").value = "";
      document.querySelector("#category-filter").value = "";
    }

    async function initializeStockwise() {
      if (!firebaseConfigured) {
        showLanding();
        return;
      }

      try {
        await setPersistence(auth, browserLocalPersistence);
        onAuthStateChanged(auth, (user) => {
          if (user) {
            if (currentUser?.uid !== user.uid) void activateAccount(user);
          } else if (currentUser) {
            currentUser = null;
            showLanding();
            showToast("You have signed out.");
          } else {
            showLanding();
          }
        }, (error) => {
          showInventoryError(error);
          showToast(`Could not connect to Firebase Authentication: ${error.message}`, "error");
        });
      } catch (error) {
        showInventoryError(error);
        showToast(`Could not initialize Firebase Authentication: ${error.message}`, "error");
      }
    }

    function openAccountDialog() {
      clearFormErrors(document.querySelector("#auth-form"));
      document.querySelector("#auth-form").reset();
      renderAuthDialog();
      accountDialog.showModal();
    }

    async function submitAuth(event) {
      event.preventDefault();
      const form = document.querySelector("#auth-form");
      clearFormErrors(form);
      if (!firebaseConfigured) {
        document.querySelector("#auth-form-error").textContent = "Configure your Firebase web app to enable sign-in.";
        return;
      }
      const email = form.elements.namedItem("email").value.trim();
      const password = form.elements.namedItem("password").value;
      const displayName = form.elements.namedItem("displayName").value.trim();
      if (authMode === "signup" && (!displayName || displayName.length > 60)) {
        document.querySelector("#auth-form-error").textContent = "Enter a name between 1 and 60 characters.";
        return;
      }
      if (!email || !form.elements.namedItem("email").validity.valid) {
        document.querySelector("#auth-form-error").textContent = "Enter a valid email address.";
        return;
      }
      if (password.length < 8) {
        document.querySelector("#auth-form-error").textContent = "Password must be at least 8 characters.";
        return;
      }

      const submitButton = document.querySelector("#auth-submit");
      submitButton.disabled = true;
      let accountCreated = false;
      try {
        if (authMode === "signup") {
          const credential = await createUserWithEmailAndPassword(auth, email, password);
          accountCreated = true;
          await updateProfile(credential.user, { displayName });
          if (currentUser?.uid === credential.user.uid) renderSession();
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }
        accountDialog.close();
      } catch (error) {
        if (accountCreated) {
          accountDialog.close();
          showToast(`Your account was created, but your name could not be saved: ${error.message}`, "error");
          return;
        }
        const status = document.querySelector("#auth-form-error");
        status.textContent = error.message || "Authentication failed. Please try again.";
        status.classList.remove("success-message");
        status.setAttribute("role", "alert");
      } finally {
        submitButton.disabled = false;
      }
    }

    async function requestPasswordReset() {
      const form = document.querySelector("#auth-form");
      clearFormErrors(form);
      const emailInput = form.elements.namedItem("email");
      const email = emailInput.value.trim();
      if (!email || !emailInput.validity.valid) {
        document.querySelector("#auth-form-error").textContent = "Enter your account email first.";
        emailInput.focus();
        return;
      }
      const button = document.querySelector("#forgot-password");
      button.disabled = true;
      try {
        await sendPasswordResetEmail(auth, email);
        const status = document.querySelector("#auth-form-error");
        status.textContent = "If an account exists for that email, Firebase will send a password reset link.";
        status.classList.add("success-message");
        status.setAttribute("role", "status");
      } catch (error) {
        const status = document.querySelector("#auth-form-error");
        status.textContent = `Could not send the reset email: ${error.message}`;
        status.setAttribute("role", "alert");
      } finally {
        button.disabled = false;
      }
    }

async function handleSignOut() {
      if (!currentUser || !auth) return;
      const button = document.querySelector("#account-signout");
      button.disabled = true;
      try {
        await firebaseSignOut(auth);
        accountDialog.close();
      } catch (error) {
        showToast(`Could not sign out: ${error.message}`, "error");
      } finally {
        button.disabled = false;
      }
}

function showToast(message, type = "success") {
  const region = document.querySelector("#toast-region");
  region.innerHTML = `<div class="toast ${type === "error" ? "toast-error" : ""}" role="${type === "error" ? "alert" : "status"}"><span class="toast-mark">${type === "error" ? "!" : "✓"}</span><span>${escapeHtml(message)}</span><button type="button" class="toast-close" aria-label="Dismiss notification">×</button></div>`;
  clearTimeout(errorToastTimer);
  errorToastTimer = setTimeout(() => { region.innerHTML = ""; }, 5000);
}

function isLowStock(product) {
  return Number(product.quantity) <= Number(product.reorderLevel);
}

function getVisibleProducts() {
  const query = document.querySelector("#search-input").value.trim().toLocaleLowerCase();
  const category = document.querySelector("#category-filter").value;
  return state.products
    .filter((product) => Boolean(product.archived) === showArchived)
    .filter((product) => !showLowStock || (!product.archived && isLowStock(product)))
    .filter((product) => !category || product.category === category)
    .filter((product) => !query || `${product.name} ${product.sku || ""}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function stockStatus(product) {
  if (product.archived) return '<span class="status-badge archived-badge">Archived</span>';
  if (isLowStock(product)) return '<span class="status-badge low-badge"><span></span> Low stock</span>';
  return '<span class="status-badge good-badge"><span></span> In stock</span>';
}

function renderProducts() {
  const products = getVisibleProducts();
  const tbody = document.querySelector("#inventory-body");
  const table = document.querySelector("#inventory-table");
  const empty = document.querySelector("#empty-state");
  const count = document.querySelector("#inventory-count");
  const search = document.querySelector("#search-input").value.trim();
  const filtered = Boolean(search || document.querySelector("#category-filter").value || showLowStock);

  document.querySelector("#nav-product-count").textContent = state.products.filter((product) => !product.archived).length;
  document.querySelector("#low-filter-count").textContent = state.products.filter((product) => !product.archived && isLowStock(product)).length;
  document.querySelector("#archived-count").textContent = state.products.filter((product) => product.archived).length;
  document.querySelector("#archive-filter span:first-of-type").textContent = showArchived ? "Active" : "Archived";
  count.textContent = `${products.length} ${products.length === 1 ? "product" : "products"}`;
  document.querySelector("#table-summary").textContent = `Showing ${products.length} ${products.length === 1 ? "product" : "products"}`;
  table.hidden = products.length === 0;
  empty.hidden = products.length > 0;
  if (!products.length) {
    document.querySelector("#empty-title").textContent = filtered ? "No products found" : (showArchived ? "No archived products" : "Your shelves are looking a little empty");
    document.querySelector("#empty-description").textContent = filtered
      ? "Try changing your search or filters to find what you’re looking for."
      : (showArchived ? "Products you archive will show up here." : "Add your first product and keep everything in one place.");
    document.querySelector("#empty-add-button").hidden = showArchived;
  }

  tbody.innerHTML = products.map((product) => {
    const initials = product.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const actionLabel = product.archived ? "Restore product" : "Archive product";
    return `<tr>
      <td><div class="product-cell"><span class="product-avatar ${categoryColor(product.category)}">${escapeHtml(initials)}</span><div class="product-details"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.sku || "No SKU")}</span></div></div></td>
      <td><span class="category-label"><span class="category-dot ${categoryColor(product.category)}"></span>${escapeHtml(product.category)}</span></td>
      <td><div class="stock-cell"><strong>${formatNumber(product.quantity)}</strong><span>reorder at ${formatNumber(product.reorderLevel)}</span></div></td>
      <td>${stockStatus(product)}</td>
      <td><div class="row-actions">${product.archived ? "" : `<button type="button" class="row-action" data-action="stock" data-id="${escapeHtml(product.id)}" aria-label="Update stock for ${escapeHtml(product.name)}" title="Update stock"><svg class="icon"><use href="#i-plus"/></svg></button><button type="button" class="row-action" data-action="edit" data-id="${escapeHtml(product.id)}" aria-label="Edit ${escapeHtml(product.name)}" title="Edit product"><svg class="icon"><use href="#i-edit"/></svg></button>`}<button type="button" class="row-action ${product.archived ? "restore-action" : "archive-action"}" data-action="archive" data-id="${escapeHtml(product.id)}" aria-label="${actionLabel}: ${escapeHtml(product.name)}" title="${actionLabel}"><svg class="icon"><use href="${product.archived ? "#i-plus" : "#i-archive"}"/></svg></button></div></td>
    </tr>`;
  }).join("");
}

function categoryColor(category) {
  const colors = { "Pantry": "color-sage", "Drinks": "color-blue", "Home goods": "color-lilac", "Personal care": "color-peach", "Accessories": "color-sand", "Other": "color-slate" };
  return colors[category] || "color-slate";
}

function formatNumber(number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(number) || 0);
}

function renderCategories() {
  const select = document.querySelector("#category-filter");
  const current = select.value;
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...state.products.map((product) => product.category)])].filter(Boolean).sort();
  select.innerHTML = '<option value="">All categories</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  select.value = categories.includes(current) ? current : "";
}

function relativeTime(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function renderActivity() {
  const entries = [...state.activity].sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).slice(0, 7);
  const list = document.querySelector("#activity-list");
  if (!entries.length) {
    list.innerHTML = '<div class="activity-empty"><span class="empty-icon"><svg class="icon"><use href="#i-clock"/></svg></span><strong>No stock changes yet</strong><p>Updates you record will appear here.</p></div>';
    return;
  }
  list.innerHTML = entries.map((entry) => {
    const added = entry.direction === "add";
    return `<article class="activity-item"><span class="activity-marker ${added ? "marker-add" : "marker-remove"}"><svg class="icon"><use href="${added ? "#i-arrow-up" : "#i-arrow-down"}"/></svg></span><div class="activity-copy"><div class="activity-title"><strong>${escapeHtml(entry.productName)}</strong><span class="activity-amount ${added ? "amount-add" : "amount-remove"}">${added ? "+" : "−"}${formatNumber(entry.quantity)}</span></div><p>${added ? "Stock added" : "Stock removed"} · ${escapeHtml(entry.reason)}</p><time datetime="${new Date(Number(entry.timestamp)).toISOString()}">${relativeTime(entry.timestamp)}</time></div></article>`;
  }).join("");
}

function renderStats() {
  const active = state.products.filter((product) => !product.archived);
  const low = active.filter(isLowStock).length;
  document.querySelector("#stat-products").textContent = formatNumber(active.length);
  document.querySelector("#stat-units").textContent = formatNumber(active.reduce((sum, product) => sum + Number(product.quantity), 0));
  document.querySelector("#stat-low").textContent = formatNumber(low);
  document.querySelector("#stat-low-foot").innerHTML = `<span class="stat-foot-dot ${low ? "amber" : "green"}"></span> ${low ? "At or below reorder point" : "Everything is well stocked"}`;
  document.querySelector("#stat-changes").textContent = formatNumber(state.activityCount);
  document.querySelector("#stat-changes-foot").innerHTML = '<span class="stat-foot-dot purple"></span> Across your workspace';
}

function render() {
  renderStats();
  renderCategories();
  renderProducts();
  renderActivity();
}

function setFormError(form, field, message) {
  const target = form.querySelector(`[data-error="${field}"]`);
  if (target) target.textContent = message;
  const input = form.elements.namedItem(field);
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
}

function clearFormErrors(form) {
  form.querySelectorAll(".field-error").forEach((element) => { element.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach((element) => element.removeAttribute("aria-invalid"));
  const error = form.querySelector(".dialog-error");
  if (error) {
    error.textContent = "";
    error.classList.remove("success-message");
    error.setAttribute("role", "alert");
  }
}

function validateWholeNumber(value, min, max) {
  if (value === "" || !Number.isSafeInteger(Number(value))) return false;
  return Number(value) >= min && Number(value) <= max;
}

function openProductDialog(product) {
  clearFormErrors(productForm);
  productForm.reset();
  productForm.elements.namedItem("productId").value = product ? product.id : "";
  productForm.elements.namedItem("name").value = product ? product.name : "";
  const categorySelect = productForm.elements.namedItem("category");
  if (product && ![...categorySelect.options].some((option) => option.value === product.category)) {
    categorySelect.add(new Option(product.category, product.category, true, true));
  }
  categorySelect.value = product ? product.category : "";
  productForm.elements.namedItem("sku").value = product ? product.sku || "" : "";
  productForm.elements.namedItem("quantity").value = product ? product.quantity : 0;
  productForm.elements.namedItem("quantity").readOnly = Boolean(product);
  document.querySelector("#quantity-field").childNodes[0].textContent = product ? "Quantity in stock" : "Starting stock";
  document.querySelector("#quantity-hint").textContent = product ? "Use Update stock to record a change with a reason." : "";
  productForm.elements.namedItem("reorderLevel").value = product ? product.reorderLevel : 5;
  document.querySelector("#product-dialog-title").textContent = product ? "Edit product" : "Add a product";
  document.querySelector("#product-submit-button").textContent = product ? "Save changes" : "Add product";
  productDialog.showModal();
  productForm.elements.namedItem("name").focus();
}

async function saveProduct(event) {
  event.preventDefault();
  if (!currentUser) {
    showLanding();
    return;
  }
  clearFormErrors(productForm);
  const form = productForm.elements;
  const name = form.namedItem("name").value.trim();
  const category = form.namedItem("category").value;
  const sku = form.namedItem("sku").value.trim();
  const quantity = form.namedItem("quantity").value;
  const reorderLevel = form.namedItem("reorderLevel").value;
  const existingId = form.namedItem("productId").value;
  let valid = true;
  if (!name) { setFormError(productForm, "name", "Enter a product name."); valid = false; }
  if (!category) { setFormError(productForm, "category", "Choose a category."); valid = false; }
  if (!validateWholeNumber(quantity, 0, MAX_QUANTITY)) { setFormError(productForm, "quantity", `Enter a whole number from 0 to ${MAX_QUANTITY}.`); valid = false; }
  if (!validateWholeNumber(reorderLevel, 0, MAX_QUANTITY)) { setFormError(productForm, "reorderLevel", `Enter a whole number from 0 to ${MAX_QUANTITY}.`); valid = false; }
  if (sku && state.products.some((product) => product.id !== existingId && !product.archived && product.sku && product.sku.toLocaleLowerCase() === sku.toLocaleLowerCase())) {
    document.querySelector("#product-form-error").textContent = "That SKU is already used by another active product.";
    valid = false;
  }
  if (!valid) return;
  const submitButton = document.querySelector("#product-submit-button");
  submitButton.disabled = true;
  try {
    const values = {
      name,
      category,
      sku: sku || "",
      reorderLevel: Number(reorderLevel),
      updatedAt: serverTimestamp()
    };
    if (existingId) {
      await updateDoc(doc(db, "products", existingId), values);
    } else {
      const batch = writeBatch(db);
      const productRef = doc(collection(db, "products"));
      const initialQuantity = Number(quantity);
      const product = {
        ...values,
        id: productRef.id,
        ownerId: currentUser.uid,
        quantity: initialQuantity,
        archived: false,
        createdAt: serverTimestamp()
      };
      if (initialQuantity > 0) {
        const changeRef = doc(collection(db, "stockChanges"));
        product.lastChangeId = changeRef.id;
        batch.set(changeRef, {
          id: changeRef.id,
          ownerId: currentUser.uid,
          productId: productRef.id,
          productName: name,
          direction: "add",
          quantity: initialQuantity,
          reason: "Initial stock",
          createdAt: serverTimestamp()
        });
      } else {
        product.lastChangeId = null;
      }
      batch.set(productRef, product);
      await batch.commit();
    }
    productDialog.close();
    if (await loadAccountData()) showToast(existingId ? `${name} updated.` : `${name} added to inventory.`);
  } catch (error) {
    document.querySelector("#product-form-error").textContent = error.code === "firestore/already-exists"
      ? "That SKU is already used by another active product."
      : `Could not save this product: ${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
}

function openStockDialog(product) {
  clearFormErrors(stockForm);
  stockForm.reset();
  stockForm.elements.namedItem("productId").value = product.id;
  document.querySelector("#stock-product-name").textContent = product.name;
  document.querySelector("#stock-current-value").textContent = formatNumber(product.quantity);
  stockDialog.showModal();
  stockForm.elements.namedItem("quantity").focus();
}

async function saveStockChange(event) {
  event.preventDefault();
  if (!currentUser) {
    showLanding();
    return;
  }
  clearFormErrors(stockForm);
  const form = stockForm.elements;
  const product = state.products.find((item) => item.id === form.namedItem("productId").value);
  const quantityText = form.namedItem("quantity").value;
  const direction = form.namedItem("direction").value;
  const reason = form.namedItem("reason").value;
  let valid = true;
  if (!validateWholeNumber(quantityText, 1, MAX_QUANTITY)) { setFormError(stockForm, "quantity", `Enter a whole number from 1 to ${MAX_QUANTITY}.`); valid = false; }
  if (!reason) { setFormError(stockForm, "reason", "Choose a reason for this change."); valid = false; }
  const quantity = Number(quantityText);
  if (product && direction === "remove" && quantity > Number(product.quantity)) {
    setFormError(stockForm, "quantity", `Only ${formatNumber(product.quantity)} units are in stock.`);
    valid = false;
  }
  if (product && direction === "add" && Number(product.quantity) + quantity > MAX_QUANTITY) {
    setFormError(stockForm, "quantity", `Stock cannot exceed ${formatNumber(MAX_QUANTITY)} units.`);
    valid = false;
  }
  if (!product) {
    document.querySelector("#stock-form-error").textContent = "This product could not be found. Close this form and try again.";
    valid = false;
  }
  if (!valid) return;
  const submitButton = stockForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const productRef = doc(db, "products", product.id);
    const changeRef = doc(collection(db, "stockChanges"));
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(productRef);
      if (!current.exists() || current.data().ownerId !== currentUser.uid || current.data().archived) {
        throw new Error("This product is unavailable in your workspace.");
      }
      const currentQuantity = current.data().quantity;
      const nextQuantity = direction === "add" ? currentQuantity + quantity : currentQuantity - quantity;
      if (direction === "remove" && quantity > currentQuantity) {
        throw new Error(`Only ${formatNumber(currentQuantity)} units are in stock.`);
      }
      if (nextQuantity > MAX_QUANTITY) {
        throw new Error(`Stock cannot exceed ${formatNumber(MAX_QUANTITY)} units.`);
      }
      transaction.update(productRef, {
        quantity: nextQuantity,
        lastChangeId: changeRef.id,
        updatedAt: serverTimestamp()
      });
      transaction.set(changeRef, {
        id: changeRef.id,
        ownerId: currentUser.uid,
        productId: productRef.id,
        productName: current.data().name,
        direction,
        quantity,
        reason,
        createdAt: serverTimestamp()
      });
    });
    stockDialog.close();
    if (await loadAccountData()) {
      showToast(`${formatNumber(quantity)} ${quantity === 1 ? "unit" : "units"} ${direction === "add" ? "added to" : "removed from"} ${product.name}.`);
    }
  } catch (error) {
    document.querySelector("#stock-form-error").textContent = `Could not update stock: ${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
}

async function toggleArchive(product) {
  if (!currentUser) {
    showLanding();
    return;
  }
  const archived = !product.archived;
  try {
    await updateDoc(doc(db, "products", product.id), { archived, updatedAt: serverTimestamp() });
    if (await loadAccountData()) showToast(archived ? `${product.name} archived.` : `${product.name} restored.`);
  } catch (error) {
    showToast(error.code === "23505"
      ? `Cannot restore ${product.name}: another active product uses SKU ${product.sku}.`
      : `Could not ${archived ? "archive" : "restore"} ${product.name}: ${error.message}`, "error");
  }
}

function exportCsv() {
  const rows = [["Product", "SKU", "Category", "Quantity", "Reorder point", "Status"]];
  state.products.filter((product) => !product.archived).forEach((product) => {
    rows.push([product.name, product.sku || "", product.category, product.quantity, product.reorderLevel, isLowStock(product) ? "Low stock" : "In stock"]);
  });
  const csv = rows.map((row) => row.map((field) => {
    let value = String(field);
    if (/^\s*[=+\-@]/.test(value)) value = `'${value}`;
    return `"${value.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "stockwise-inventory.csv";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("Your inventory CSV is ready.");
}

document.querySelector("#add-product-button").addEventListener("click", () => openProductDialog(null));
document.querySelector("#empty-add-button").addEventListener("click", () => openProductDialog(null));
document.querySelector("#sign-in-button").addEventListener("click", () => {
  if (currentUser) {
    void handleSignOut();
    return;
  }
  authMode = "signin";
  openAccountDialog();
});
document.querySelector("#account-button").addEventListener("click", openAccountDialog);
document.querySelector("#account-signout").addEventListener("click", handleSignOut);
document.querySelectorAll(".profile-button").forEach((button) => {
  button.addEventListener("click", showProfileDialog);
});
document.querySelector("#auth-form").addEventListener("submit", submitAuth);
document.querySelector("#forgot-password").addEventListener("click", requestPasswordReset);
document.querySelector("#auth-toggle").addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  clearFormErrors(document.querySelector("#auth-form"));
  renderAuthDialog();
});
window.addEventListener("stockwise:signin", () => {
  authMode = "signin";
  openAccountDialog();
});
window.addEventListener("stockwise:signup", () => {
  authMode = "signup";
  openAccountDialog();
});
document.querySelector("#retry-load").addEventListener("click", () => {
  if (currentUser) void loadAccountData();
  else showLanding();
});
document.querySelector("#export-button").addEventListener("click", exportCsv);
document.querySelector("#search-input").addEventListener("input", renderProducts);
document.querySelector("#category-filter").addEventListener("change", renderProducts);
document.querySelector("#low-stock-filter").addEventListener("click", (event) => {
  showLowStock = !showLowStock;
  event.currentTarget.setAttribute("aria-pressed", String(showLowStock));
  renderProducts();
});
document.querySelector("#archive-filter").addEventListener("click", (event) => {
  showArchived = !showArchived;
  showLowStock = false;
  document.querySelector("#low-stock-filter").setAttribute("aria-pressed", "false");
  event.currentTarget.setAttribute("aria-pressed", String(showArchived));
  renderProducts();
});
document.querySelector("#inventory-body").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const product = state.products.find((item) => item.id === button.dataset.id);
  if (!product) {
    showToast("That product could not be found. Refresh and try again.", "error");
    return;
  }
  if (button.dataset.action === "edit") openProductDialog(product);
  if (button.dataset.action === "stock") openStockDialog(product);
  if (button.dataset.action === "archive") void toggleArchive(product);
});
productForm.addEventListener("submit", saveProduct);
stockForm.addEventListener("submit", saveStockChange);
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.querySelector("#toast-region").addEventListener("click", (event) => {
  if (event.target.closest(".toast-close")) event.currentTarget.innerHTML = "";
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !event.ctrlKey && !event.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    document.querySelector("#search-input").focus();
  }
});
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});
document.querySelectorAll(".side-nav .nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".side-nav .nav-link").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});
const date = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
document.querySelector(".eyebrow").innerHTML = `<span class="eyebrow-dot"></span> ${escapeHtml(date.toLocaleUpperCase())}`;

void initializeStockwise();
