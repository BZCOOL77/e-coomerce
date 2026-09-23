// product-reviews.js

// ID du produit affiché sur la page actuelle, dans l'URL : /product.html?id=12345
 const urlParams = new URLSearchParams(window.location.search);
        const currentProductId = urlParams.get('id');



/**
 * FONCTION 1 : Charger et afficher la moyenne et la liste des avis
 */
async function fetchAndDisplayReviews() {
  try {
    const response = await fetch(`/api/reviews/product/${currentProductId}`);
    const data = await response.json();

    // 1. Mise à jour de la note moyenne sur la page (Ex: "4.3 / 5")
    document.getElementById('average-score').innerText = data.moyenne;
    document.getElementById('total-reviews-count').innerText = data.totalAvis;

    // 2. Affichage des commentaires
    const container = document.getElementById('reviews-container');
    
    if (data.reviews.length === 0) {
      container.innerHTML = "<p>Aucun avis pour le moment sur ce produit.</p>";
      return;
    }

    // On parcourt la liste et on génère le HTML de chaque avis
    container.innerHTML = data.reviews.map(review => {
      // Génère les étoiles visuelles (Ex: 4 étoiles = ★★★★☆)
      const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
      const authorName = review.userId ? `${review.userId.prenom} ${review.userId.nom}` : 'Client ShopyCloth';

      return `
        <div class="review-card" style="border-bottom: 1px solid #ccc; padding: 10px 0;">
          <strong>${authorName}</strong> <span style="color: green;">✔ Achat Vérifié</span>
          <div style="color: #f5b301;">${stars}</div>
          <p>${review.comment}</p>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error("Erreur chargement avis :", error);
  }
}

/**
 * FONCTION 2 : Envoyer la note choisie par le client au Backend
 */
document.getElementById('submit-review-btn').addEventListener('click', async (e) => {
  e.preventDefault();

  // Récupérer la note sélectionnée (bouton radio 1 à 5 étoiles)
  const selectedStar = document.querySelector('input[name="rating"]:checked');
  const commentText = document.getElementById('review-comment-text').value;

  if (!selectedStar) {
    alert("Veuillez cliquer sur une étoile pour attribuer une note !");
    return;
  }

  // Préparation des données à envoyer
  const payload = {
    productId: currentProductId,
    rating: parseInt(selectedStar.value), // Convertit "5" en chiffre 5
    comment: commentText
  };

  // Envoi de la requête au serveur Node.js
  const response = await fetch('/api/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}` // Token JWT d'authentification
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (response.ok) {
    alert("Merci ! " + result.message);
    // On rafraîchit la moyenne et les avis affichés à l'écran
    fetchAndDisplayReviews();
  } else {
    // Si l'utilisateur n'a PAS acheté le produit, le backend renvoie l'erreur 403 ici !
    alert("Erreur : " + result.error);
  }
});

// Lancer le chargement au démarrage de la page
fetchAndDisplayReviews();