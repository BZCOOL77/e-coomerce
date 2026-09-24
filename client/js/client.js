// On récupère les éléments principaux de navigation pour gérer les clics dans le header et la navbar.
const navbarre = document.getElementById('navbarre');
const header = document.querySelector('header');
const tousLesProduitsBtn = document.getElementById('tous-les-produits');

// Si l'utilisateur arrive sur une page de vendeur, on affiche le bouton "Tous les produits".
if (tousLesProduitsBtn) {
    const vendeurId = new URLSearchParams(window.location.search).get('vendeurId');
    tousLesProduitsBtn.style.display = vendeurId ? '' : 'none';
}

// Gestion du bouton pour devenir vendeur.
const besellerBtn = document.getElementById('beseller-btn');
if (besellerBtn) {
    besellerBtn.addEventListener('click', () => {
        // Redirection vers la page de demande pour devenir vendeur.
        window.location.href = '../html/tobeseller.html';
    });
}

// Gère les redirections de navigation selon le bouton cliqué.
function gererNavigationPrincipale(event) {
    const tousLesProduitsBtn = event.target.closest('.tous-les-produits');
    const vendeurBtn = event.target.closest('.vendeur');
    const mescommandesBtn = event.target.closest('.mescommandes');
    const adminBtn = event.target.closest('.adminBtn');
    const panierBtn = event.target.closest('.panier');

    if (tousLesProduitsBtn) {
        window.location.href = '../html/client.html';
    }
    if (panierBtn) {
        // Redirection vers la page panier.html
        window.location.href = '../html/panier.html';
    }
    if (adminBtn) {// Redirection vers la page nav.html
        window.location.href = '../../frontend/html/nav.html';
    }
    if (vendeurBtn) {// Redirection vers la page vendeur.html
        window.location.href = '../html/parvendeur.html';
    }
    if (mescommandesBtn) {// Redirection vers la page historique.html
        window.location.href = '../html/mes-commandes.html';
    }
}

if (navbarre) {
    navbarre.addEventListener('click', gererNavigationPrincipale);
}

if (header) {
    header.addEventListener('click', gererNavigationPrincipale);
}





// Événement de délégation pour gérer les clics sur les boutons Détails et Ajouter au panier.
const catalogue = document.getElementById('catalogue');
if (catalogue) {
    catalogue.addEventListener('click', (event) => {
        const btnDetail = event.target.closest('.btn-detail');
        const btnPanier = event.target.closest('.ajouter-panier');

        if (btnDetail) {
            const id = btnDetail.dataset.id;
            console.log("Direction -> Page Détails pour :", id);
            window.location.href = `detail.html?id=${id}`;
        }

        if (btnPanier) {
            const id = btnPanier.dataset.id;
            const vendeurId = btnPanier.dataset.vendeur;
            
            console.log("DEBUG - dataset.id :", id);
            console.log("DEBUG - dataset.vendeur :", vendeurId);
            
            // On récupère les informations du produit depuis la carte pour les ajouter au panier.
            const carte = btnPanier.closest('.carte');
            const nom = carte.querySelector('.nom').innerText;
            const prixTexte = carte.querySelector('.prix').innerText;
            const prix = prixTexte.replace(/[^\d.]/g, '');
            const image = carte.querySelector('img').src;

            ajouterAuPanier(id, nom, prix, image, vendeurId);
            btnPanier.innerHTML = '<i class="fa-solid fa-check"></i><span>Ajouté !</span>';
            setTimeout(() => {
                btnPanier.innerHTML = '<i class="fa-solid fa-cart-plus"></i><span>Ajouter au panier</span>';
            }, 2000);
        }
    });
}




// Fonctions utilitaires pour afficher ou masquer le loader pendant les appels serveur.
function showLoading() {
    const loader = document.getElementById('loader');
    const overlay = document.getElementById('overlay');
    if(loader) loader.style.display = 'block';
    if(overlay) overlay.style.display = 'block';
}

function hideLoading() {
    const loader = document.getElementById('loader');
    const overlay = document.getElementById('overlay');
    if(loader) loader.style.display = 'none';
    if(overlay) overlay.style.display = 'none';
}

// Charge les produits depuis le backend, avec possibilité de filtrage par catégorie.
async function chargerProduits(categorie = '', event = null) {
    showLoading(); 

    // -------------------------------------------------------------
    // GESTION DU STYLE DU BOUTON ACTIF
    // -------------------------------------------------------------
    const tousLesBoutons = document.querySelectorAll('.bouton-categorie button');

    if (event && event.currentTarget) {
        // Clic utilisateur : on nettoie tout et on active le bouton cliqué
        tousLesBoutons.forEach(btn => btn.classList.remove('active'));
        event.currentTarget.classList.add('active');
    } else if (!document.querySelector('.bouton-categorie button.active')) {
        // Chargement initial (pas de clic) : on s'assure que "Tous" est actif si aucun ne l'est
        if (tousLesBoutons.length > 0) {
            tousLesBoutons[0].classList.add('active');
        }
    }// FIN DE LA GESTION DU STYLE DU BOUTON ACTIF

    // 1. On analyse l'URL actuelle du navigateur à la recherche de '?vendeurId=...'
    const urlParams = new URLSearchParams(window.location.search);
    const vendeurId = urlParams.get('vendeurId');

    // 2. On prépare l'objet URLSearchParams pour construire une URL propre et sans erreurs
    const queryParams = new URLSearchParams();

    // 3. Si un vendeurId est présent dans la page, on l'ajoute aux paramètres de requête
    if (vendeurId) {
        queryParams.append('vendeurId', vendeurId);
    }

    // 4. Si une catégorie est transmise à la fonction, on l'ajoute également aux paramètres
    if (categorie) {
        queryParams.append('categorie', categorie);
    }

    // 5. On prépare l'URL finale de notre API backend
    // Si des paramètres existent, toString() les formate automatiquement (ex: ?vendeurId=123&categorie=Electronique)
    const queryString = queryParams.toString();
    const urlAPI = `${CONFIG.API_BASE_URL}/api/products${queryString ? `?${queryString}` : ''}`;

    try {
        const response = await fetch(urlAPI);

        if (!response.ok) throw new Error("Le serveur ne répond pas correctement");

        const produits = await response.json();
        console.log("Produits reçus du serveur :", produits); // DEBUG
        
        // LE PONT : On appelle la fonction d'affichage en lui passant les données
        afficherProduits(produits); 

    } catch (error) {
        console.error("Erreur lors du chargement :", error);
        alert("Vérifiez que le Backend est lancé !");
    } finally {
        hideLoading(); 
    }
}


// Affiche les produits dans le catalogue, en créant les cartes HTML correspondantes.
function afficherProduits(produits) {
    const container = document.getElementById('catalogue');
    if (!container) return; // Sécurité si l'élément n'existe pas

    container.innerHTML = ''; // On vide pour repartir à zéro

    if (produits.length === 0) {
            container.innerHTML = "<p style='color: black;'>Ce vendeur n'a aucun produit en vente pour le moment.</p>";
            return;
        }

    produits.forEach(produit => {
        // On vérifie si le produit est épuisé
        const estEpuise = produit.stock <= 0;
        console.log("Produit complet :", produit); // DEBUG - Affiche TOUT
        console.log("VendeurId du produit :", produit.vendeurId); // DEBUG - Affiche le vendeurId

        // Note moyenne du produit renvoyée par le backend sous la clé "averageRating".
        // On garde une valeur numérique sûre pour éviter les erreurs si le champ est absent.
        const noteMoyenne = Number(produit.averageRating || 0);
        
        container.innerHTML += `
            <article class="carte" data-rating="${noteMoyenne}"><!-- un data-rating pour stocker la note moyenne et l'utiliser plus tard -->
                <div class="produit-image">
                    <button class="heart-icon" type="button" data-product-id="${produit._id}" aria-label="Ajouter aux favoris">
                        <span class="heart-symbol"><i class="fa-regular fa-heart"></i></span>
                    </button>
                    <img src="${produit.image}" alt="${produit.nom}">
                </div>
                <div class="produit-info">
                    <h3 class="nom">${produit.nom}</h3>
                    <p class="prix">${produit.prix} €</p>
                    <div class="product-rating" aria-live="polite">
                        <span class="rating-stars" aria-label="Moyenne des notes"></span>
                        <span class="rating-value">0.0/5</span>
                    </div>
                    <p class="description">${produit.description}</p>
                    <button class="btn-detail" data-id="${produit._id}">
                        <i class="fa-solid fa-circle-info"></i>
                        <span>Détails</span>
                    </button>
                    <p class="stock-info" style="color: ${estEpuise ? 'red' : 'green'}; font-size: 0.85rem;">
                        ${estEpuise ? '❌ Rupture de stock' : ` disponibles`}
                    </p>

            ${estEpuise ? `
                <button class="ajouter-panier btn-disabled" disabled style="background-color: #cbd5e0; cursor: not-allowed;" data-id="${produit._id}" data-vendeur="${produit.vendeurId}">
                    <i class="fa-solid fa-ban"></i>
                    <span>Indisponible</span>
                </button>
            ` : `
                <button class="ajouter-panier" data-id="${produit._id}" data-vendeur="${produit.vendeurId}">
                    <i class="fa-solid fa-cart-plus"></i>
                    <span>Ajouter au panier</span>
                </button>
            `}

                </div>
            </article>
        `;
    });

    // Après l'injection du HTML, on applique le rendu réutilisable à chaque carte.
    // Cela évite de dupliquer la logique de calcul, et on garde une seule source de vérité.
    const cartes = document.querySelectorAll('#catalogue .carte');
    cartes.forEach(carte => {
        const score = Number(carte.dataset.rating || 0);// On récupère la note moyenne stockée dans le data-rating de la carte
        const ratingContainer = carte.querySelector('.product-rating');
        const starsContainer = carte.querySelector('.rating-stars');
        const valueContainer = carte.querySelector('.rating-value');

        // Exception propre au catalogue : les notes inférieures à 3 ne sont pas affichées.
        // On masque la div parente pour supprimer aussi son fond, sa bordure et son espace.
        if (score < 3) {
            if (ratingContainer) ratingContainer.style.display = 'none';
            return;
        }

        // Pour les notes à partir de 3, on réutilise le moteur partagé de rendu des étoiles.
        if (typeof window.renderProductRating === 'function') {// On vérifie que la fonction est bien définie avant de l'appeler
            window.renderProductRating(score, starsContainer, valueContainer);// On appelle la fonction partagée pour afficher les étoiles et la note
        }
    });

    if (typeof window.initialiserFavoris === 'function') {
        window.initialiserFavoris();
    }
}

// Charge automatiquement tous les produits au démarrage de la page.
document.addEventListener('DOMContentLoaded', () => chargerProduits());

/**
 * SECTION : GESTION DU PANIER 
 * Cette logique utilise le LocalStorage pour la persistance des données.
 */

// 1. RÉCUPÉRATION : On extrait le panier du stockage local
function obtenirPanier() {
    // On cherche la clé 'panier_shopy'
    const panierData = localStorage.getItem('panier_shopy');
    
    // Si vide, on renvoie un tableau JS vide, sinon on transforme le texte en Objet
    return panierData ? JSON.parse(panierData) : [];
}

// 2. SAUVEGARDE : On enregistre le tableau dans le stockage local
function sauvegarderPanier(panier) {
    // On transforme l'objet JS en texte JSON pour le stockage
    localStorage.setItem('panier_shopy', JSON.stringify(panier));
    
    // On met à jour l'affichage du compteur immédiatement après chaque modif
    mettreAJourCompteurPanier();
}

// 3. ACTION : Ajouter un produit ou augmenter sa quantité
function ajouterAuPanier(id, nom, prix, image, vendeurId) {
    console.log("Ajout au panier - ID:", id, "VendeurID:", vendeurId); // DEBUG
    let panier = obtenirPanier();
    // Toujours comparer les IDs comme des chaînes
    const idStr = String(id);
    const produitExistant = panier.find(item => String(item.id) === idStr);

    if (produitExistant) {
        produitExistant.quantite += 1;
        console.log(`+1 pour ${nom} (Nouvelle qté: ${produitExistant.quantite})`);
    } else {
        const nouveauProduit = {
            id: idStr,
            nom: nom,
            prix: parseFloat(prix),
            image: image,
            quantite: 1,
            vendeurId: vendeurId
        };
        panier.push(nouveauProduit);
        console.log(`${nom} ajouté au panier !`);
    }
    sauvegarderPanier(panier);
}

//  UI : Mettre à jour le badge du bouton Panier dans la Nav
function mettreAJourCompteurPanier() {
    const panier = obtenirPanier();// On récupère le panier actuel pour calculer le total des articles
    
    // On calcule la somme totale des quantités présentes dans le panier
    const totalArticles = panier.reduce((acc, item) => acc + item.quantite, 0);
    
    const badge = document.getElementById('cart-count-badge');
    if (badge) {
        badge.textContent = totalArticles;
        badge.style.display = totalArticles > 0 ? 'inline-flex' : 'none';
    }
}


// Initialisation au chargement de la page pour afficher le compteur stocké sur l'Acer Predator
window.addEventListener('DOMContentLoaded', mettreAJourCompteurPanier);


//barre de recherche
// 1. Déclarer la variable du timer en dehors de la fonction pour qu'elle soit persistante
let timerRecherche; 

// 2. La fonction de recherche (celle qui communique avec le serveur)
async function rechercherProduits() {
    const input = document.getElementById('search-input').value;
    
    // Si la barre est vide, on recharge la liste complète
    if (input.length < 1) return chargerProduits();

    try {
        // On utilise encodeURIComponent pour protéger les caractères spéciaux dans l'URL
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/products/search?q=${encodeURIComponent(input)}`);
        
        if (!response.ok) throw new Error("Erreur lors de la recherche");

        const produitsFiltrés = await response.json();
        
        // On utilise la fonction d'affichage 
        afficherProduits(produitsFiltrés); 
        
    } catch (error) {
        console.error("Erreur recherche :", error);
    }
}

// 3. La fonction "Bouclier" (Debounce)
function filtrerAvecDebounce() {
    // On annule le compte à rebours précédent si l'utilisateur tape une nouvelle lettre
    clearTimeout(timerRecherche); 
    
    // On lance un nouveau compte à rebours de 300ms avant de lancer la recherche
    timerRecherche = setTimeout(() => {
        rechercherProduits(); 
    }, 300);
}//FIN DE LA FONCTION POUR LA BARRE DE RECHERCHE 


function afficherInterfaceSelonRole(role) {
    const adminBtn = document.getElementById('adminBtn');
    const blocVendeur = document.getElementById('bloc-devenir-vendeur');
    const roleNormalise = (role || '').trim().toLowerCase();

    if (roleNormalise === 'vendeur') {
        if (adminBtn) adminBtn.style.display = 'flex';
        if (blocVendeur) blocVendeur.style.display = 'none';
        return;
    }

    if (adminBtn) adminBtn.style.display = 'none';
    if (blocVendeur) {
        blocVendeur.style.display = roleNormalise === 'acheteur' ? 'block' : 'none';
    }
}

// Afficher les bons boutons selon le rôle enregistré puis confirmer le rôle côté serveur.
document.addEventListener('DOMContentLoaded', async () => {
    afficherInterfaceSelonRole(localStorage.getItem('role'));

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return;

        const user = await response.json();
        if (user.role) {
            localStorage.setItem('role', user.role);
            afficherInterfaceSelonRole(user.role);
        }
    } catch (error) {
        console.error('Impossible de synchroniser le rôle utilisateur :', error);
    }
});
















