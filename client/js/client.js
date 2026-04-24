// On récupère le bouton panier de la barre de navigation
const btnNavPanier = document.getElementById('panier');

if (btnNavPanier) {
    btnNavPanier.addEventListener('click', () => {
        // Redirection vers la page panier.html
        window.location.href = 'panier.html';
    });
}




// evenement de délégation pour gérer les clics sur les boutons DÉTAILS et AJOUTER AU PANIER
const catalogue = document.getElementById('catalogue');

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
        const id = btnPanier.dataset.id;
        
        // On récupère les infos du produit directement dans la "carte" parente
        const carte = btnPanier.closest('.carte');
        const nom = carte.querySelector('.nom').innerText;
        const prixTexte = carte.querySelector('.prix').innerText;
        const prix = prixTexte.replace(/[^\d.]/g, ''); // On garde juste les chiffres et le point
        const image = carte.querySelector('img').src;

        // On lance la fonction d'ajout avec toutes les données
        ajouterAuPanier(id, nom, prix, image);
        // Optionnel : Petit effet visuel pour confirmer l'ajout
        btnPanier.innerText = "Ajouté ! ✅";
        setTimeout(() => btnPanier.innerText = "Ajouter au panier", 2000);
    }
});




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
    try {
        const response = await fetch('http://localhost:3000/api/products');
        if (!response.ok) throw new Error("Le serveur ne répond pas correctement");

        const produits = await response.json();
        
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

    produits.forEach(produit => {
        container.innerHTML += `
            <article class="carte">
                <div class="produit-image">
                    <img src="${produit.image}" alt="${produit.nom}">
                </div>
                <div class="produit-info">
                    <h3 class="nom">${produit.nom}</h3>
                    <p class="prix">${produit.prix} €</p>
                    <p class="description">${produit.description}</p>
                    <button class="btn-detail" data-id="${produit._id}">Détails</button>
                    <button class="ajouter-panier" data-id="${produit._id}">Ajouter au panier</button>
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
function ajouterAuPanier(id, nom, prix, image) {
    let panier = obtenirPanier();

    // On vérifie si l'article est déjà présent via son ID unique
    const produitExistant = panier.find(item => item.id === id);

    if (produitExistant) {
        // Si le produit est déjà là, on incrémente juste la quantité
        produitExistant.quantite += 1;
        console.log(`+1 pour ${nom} (Nouvelle qté: ${produitExistant.quantite})`);
    } else {
        // Sinon, on crée un nouvel objet produit et on l'ajoute au tableau
        const nouveauProduit = {
            id: id,
            nom: nom,
            prix: parseFloat(prix), // On s'assure que le prix est un nombre
            image: image,
            quantite: 1
        };
        panier.push(nouveauProduit);
        console.log(`${nom} ajouté au panier !`);
    }

    // On enregistre les modifications
    sauvegarderPanier(panier);
}

//  UI : Mettre à jour le badge du bouton Panier dans la Nav
function mettreAJourCompteurPanier() {
    const panier = obtenirPanier();// On récupère le panier actuel pour calculer le total des articles
    
    // On calcule la somme totale des quantités présentes dans le panier
    const totalArticles = panier.reduce((acc, item) => acc + item.quantite, 0);
    
    const btnPanier = document.getElementById('panier');
    if (btnPanier) {
        // On change le texte du bouton dynamiquement
        btnPanier.innerText = `Panier (${totalArticles})`;
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
        const response = await fetch(`http://localhost:3000/api/products/search?q=${encodeURIComponent(input)}`);
        
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
}