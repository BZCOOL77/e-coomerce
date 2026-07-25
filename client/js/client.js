// On récupère le bouton panier de la barre de navigation ou du header
const navbarre = document.getElementById('navbarre');
const header = document.querySelector('header');

function gererNavigationPrincipale(event) {
    const vendeurBtn = event.target.closest('.vendeur');
    const mescommandesBtn = event.target.closest('.mescommandes');
    const adminBtn = event.target.closest('.adminBtn');
    const panierBtn = event.target.closest('.panier');

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





// evenement de délégation pour gérer les clics sur les boutons DÉTAILS et AJOUTER AU PANIER
const catalogue = document.getElementById('catalogue');
if (catalogue) {
    catalogue.addEventListener('click', (event) => {
        // 1. On cherche si l'élément cliqué est un de nos deux boutons
        const btnDetail = event.target.closest('.btn-detail');
        const btnPanier = event.target.closest('.ajouter-panier');

        // 2. Logique pour le bouton DÉTAILS
        if (btnDetail) {
            const id = btnDetail.dataset.id;
            console.log("Direction -> Page Détails pour :", id);
            window.location.href = `detail.html?id=${id}`;
        }

        // 3. Logique pour le bouton AJOUTER AU PANIER
        if (btnPanier) {
            // On récupère les IDs stockés dans les attributs data-
            const id = btnPanier.dataset.id;
            const vendeurId = btnPanier.dataset.vendeur;
            
            console.log("DEBUG - dataset.id :", id); // DEBUG
            console.log("DEBUG - dataset.vendeur :", vendeurId); // DEBUG
            
            // On récupère les infos du produit directement dans la "carte" parente
            const carte = btnPanier.closest('.carte');
            const nom = carte.querySelector('.nom').innerText;
            const prixTexte = carte.querySelector('.prix').innerText;
            const prix = prixTexte.replace(/[^\d.]/g, ''); // On garde juste les chiffres et le point
            const image = carte.querySelector('img').src;

            // On lance la fonction d'ajout avec toutes les données
            ajouterAuPanier(id, nom, prix, image, vendeurId);
            // Optionnel : Petit effet visuel pour confirmer l'ajout
            btnPanier.innerHTML = '<i class="fa-solid fa-check"></i><span>Ajouté !</span>';
            setTimeout(() => {
                btnPanier.innerHTML = '<i class="fa-solid fa-cart-plus"></i><span>Ajouter au panier</span>';
            }, 2000);
        }
    });
}




// Fonctions pour gérer l'affichage du loader (pour éviter les erreurs)
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

// 1. Fonction pour CHARGER les produits depuis le serveur
async function chargerProduits() {
    showLoading(); 

    // 1. On analyse l'URL actuelle à la recherche de '?vendeurId=...'
    const urlParams = new URLSearchParams(window.location.search);
    const vendeurId = urlParams.get('vendeurId');

    // 2. On prépare l'URL de notre API backend
    // Si vendeurId existe, on l'ajoute à l'URL du fetch, sinon on garde l'URL normale
    let urlAPI = `${CONFIG.API_BASE_URL}/api/products`;
    if (vendeurId) {
        urlAPI += `?vendeurId=${vendeurId}`;
    }
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

// 2. Fonction pour AFFICHER les produits (utilisée par le chargement ET la recherche)
function afficherProduits(produits) {
    const container = document.getElementById('catalogue');
    if (!container) return; // Sécurité si l'élément n'existe pas

    container.innerHTML = ''; // On vide pour repartir à zéro

    if (produits.length === 0) {
            container.innerHTML = "<p style='color: white;'>Ce vendeur n'a aucun produit en vente pour le moment.</p>";
            return;
        }

    produits.forEach(produit => {
        // On vérifie si le produit est épuisé
        const estEpuise = produit.stock <= 0;
        console.log("Produit complet :", produit); // DEBUG - Affiche TOUT
        console.log("VendeurId du produit :", produit.vendeurId); // DEBUG - Affiche le vendeurId
        
        container.innerHTML += `
            <article class="carte">
                <div class="produit-image">
                    <img src="${produit.image}" alt="${produit.nom}">
                </div>
                <div class="produit-info">
                    <h3 class="nom">${produit.nom}</h3>
                    <p class="prix">${produit.prix} €</p>
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
}


// On lance tout au chargement de la page
window.onload = chargerProduits;

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


//l'ecouteur pour voir si vendeur ou si client
 document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('role');
    const adminBtn = document.getElementById('adminBtn');

    if (adminBtn) {
        if (role === 'vendeur') {
            // 1. On le rend visible
            adminBtn.style.display = 'block'; 
        } else {
            // Un client ne doit même pas voir que ce bouton existe dans le DOM
            adminBtn.remove(); 
        }
    }
});