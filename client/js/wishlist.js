// wishlist.js

// Récupère le token du navigateur pour savoir si l'utilisateur est connecté.
function getToken() {
  return localStorage.getItem('token');
}

// Met à jour l'état visuel du bouton cœur : actif ou non.
function setFavoriteState(button, isFavorite) {
  if (!button) return;

  button.classList.toggle('is-active', isFavorite);
  button.setAttribute('aria-pressed', String(isFavorite));
  button.setAttribute('aria-label', isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris');

  const symbol = button.querySelector('.heart-symbol');
  if (symbol) {
    symbol.innerHTML = isFavorite
      ? '<i class="fa-solid fa-heart"></i>'
      : '<i class="fa-regular fa-heart"></i>';
  }
}

// Récupère la liste complète des IDs produits en favoris pour l'utilisateur connecté en UNE seule requête.
async function obtenirIdsFavoris() {
  const token = getToken();
  if (!token) return [];

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/wishlist/user-ids`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data.wishlistIds) ? data.wishlistIds : [];
  } catch (error) {
    console.error('Erreur lors de la récupération des favoris :', error);
    return [];
  }
}

// Initialise tous les boutons favoris à partir de la liste reçue du backend.
async function initialiserFavoris() {
  const buttons = document.querySelectorAll('.heart-icon');
  const idsFavoris = await obtenirIdsFavoris();
  const idsSet = new Set(idsFavoris.map(id => String(id)));

  for (const button of buttons) {
    const productId = button.dataset.productId;
    if (!productId) continue;

    setFavoriteState(button, idsSet.has(String(productId)));
  }
}

// Bascule l'état du favori côté serveur : ajoute ou retire le produit.
async function basculerFavori(productId) {
  const token = getToken();

  // Si l'utilisateur n'est pas connecté, on le redirige vers la page connexion.
  if (!token) {
    alert('Veuillez vous connecter pour enregistrer ce produit dans vos favoris !');
    window.location.href = '../html/connexion.html';
    return false;
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/wishlist/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ productId })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert('Erreur : ' + (data.error || 'Impossible de mettre à jour les favoris'));
      return false;
    }

    const data = await response.json();
    return Boolean(data.isFavorite);
  } catch (error) {
    console.error('Erreur lors du toggle favori :', error);
    return false;
  }
}

// Gestion du clic global : on écoute les boutons cœur même s'ils sont créés dynamiquement.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('.heart-icon');
  if (!button) return;

  const productId = button.dataset.productId;
  if (!productId) return;

  const isFavorite = await basculerFavori(productId);
  if (typeof isFavorite === 'boolean') {
    setFavoriteState(button, isFavorite);
  }
});

// Expose la fonction pour qu'elle puisse être relancée après le rendu du catalogue.
window.initialiserFavoris = initialiserFavoris;