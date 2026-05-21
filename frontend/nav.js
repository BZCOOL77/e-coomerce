// ========== INITIALISATION DES ÉLÉMENTS DU DOM ==========
// On déclare les variables globales pour le loader et l'overlay
// Elles seront initialisées plus tard une fois que le DOM sera prêt
let loader, overlay;

// Fonction pour initialiser tous les éléments du DOM quand il est complètement chargé
function initDOM() {
    // On récupère les éléments loader et overlay du HTML
    loader = document.getElementById('loader');
    overlay = document.getElementById('overlay');
    
    // On récupère le bouton commande et on ajoute un écouteur pour redirection
    const commandepage = document.getElementById('commande');
    if (commandepage) {
        commandepage.addEventListener('click', () => {
            // Quand on clique sur commande, redirection vers commande.html
            window.location.href = 'commande.html';
        });
    }
    
    // Récupération des éléments de navigation
    // ⚠️ CORRECTION : Ces déclarations sont déjà DANS initDOM() et non en global
    // Cela garantit que le DOM est chargé avant d'essayer d'accéder aux éléments
    // Avant, ces déclarations étaient en haut du fichier et causaient une erreur
    // car les éléments n'existaient pas encore quand le script s'exécutait
    const menu = document.getElementById('menu');
    const hist = document.getElementById('hist');
    const compte = document.getElementById('compte');
    const panier = document.getElementById('panier');
    
    // Ajout de l'écouteur au bouton panier pour afficher un message
    // ⚠️ CORRECTION : Vérification 'if (panier)' pour éviter une erreur si l'élément n'existe pas
    // Avant, on essayait d'ajouter un écouteur sur panier sans vérifier s'il existait
    // Cela causait un crash du script : "Cannot read property 'addEventListener' of null"
    if (panier) {
        panier.addEventListener('click', () => {
            alert('vous devez d abord creer un panier');
        });
    }
    
    // Ajout de l'écouteur au bouton menu pour redirection
    // ⚠️ CORRECTION : Vérification 'if (menu)' pour éviter une erreur
    // Avant, cet écouteur était dupliqué en bas du fichier avec une déclaration redondante
    // Maintenant on le centralise ici avec une vérification de sécurité
    if (menu) {
        menu.addEventListener('click', () => {
            window.location.href = '../client/html/client.html';
        });
    }
}

// ========== FONCTIONS DE GESTION DU LOADER (SPINNER) ==========
// Cette fonction affiche le spinner de chargement
function showLoading() {
    // On affiche le loader seulement s'il existe pour éviter les erreurs
    if (loader) loader.style.display = 'block';
    // On affiche aussi l'overlay (arrière-plan semi-transparent)
    if (overlay) overlay.style.display = 'block';
}

// Cette fonction cache le spinner de chargement
function hideLoading() {
    // On cache le loader
    if (loader) loader.style.display = 'none';
    // On cache aussi l'overlay
    if (overlay) overlay.style.display = 'none';
}


// on automatise le placement des produits sur le site
async function chargerproduit() {
    showLoading(); // On lance le spinner dès le début
    try {
    const response = await fetch('http://localhost:3000/api/products/me', {
        method: 'GET',
        headers: getHeaders() // le token est ajouté automatiquement !
    });
    console.log("URL appelée :", response.url); // Ajoute ce log pour voir l'URL réelle
    const produits = await response.json();

    const container = document.getElementById('catalogue')

    //on vide le container avant de le remplir
    container.innerHTML = '';

    produits.forEach(produit => {//html pour chaque produit dans la liste des produits
        container.innerHTML += `
        <article class="carte">
            <div class="produit-image">
                <img src="${produit.image}" alt="${produit.nom}">
            </div>
            <div class="produit-info">
            <h3 class="nom">${produit.nom}</h3>
            <p class="prix">${produit.prix} €</p>
            <p class="description">${produit.description}</p>
            
            <a href="modifier.html?id=${produit._id}"><button class="modifier">Modifier</button></a>
            <button onclick="deleteProduct('${produit._id}')" class="supprimer">Supprimer</button>
            </div>
        </article>
    `;
});
} catch (error) {
    console.error("Erreur chargement :", error);
    } finally {
        hideLoading(); // On l'arrête dès que les produits sont là ou en cas d'erreur
    }
}




//========== VÉRIFICATION DE SÉCURITÉ DE ACCÈS À LA PAGE VENDEUR ==========
// 1. CONTRÔLE IMMÉDIAT (Pas d'attente du DOM pour bloquer les intrus rapidement)

// On récupère le rôle de l'utilisateur depuis le localStorage
const role = localStorage.getItem('role');
// On récupère le token d'authentification depuis le localStorage
const token = localStorage.getItem('token');

// Logs de debug pour voir la valeur du rôle et si le token existe
console.log("🔍 DEBUG - Role:", role);
console.log("🔍 DEBUG - Token présent:", !!token);

// ========== VÉRIFICATION 1 : Token manquant ==========
if (!token) {
    // Le token n'existe pas, donc l'utilisateur n'est pas connecté
    console.error("❌ Token manquant ! Redirection vers login...");
    alert("Vous devez d'abord vous connecter !");
    // Redirection vers la page de login
    window.location.replace('login.html');
}
// ========== VÉRIFICATION 2 : Rôle non-vendeur ==========
else if (!role || role !== 'vendeur') {
    // Le rôle n'existe pas OU le rôle n'est pas 'vendeur'
    console.error("❌ Accès refusé ! Rôle requis: 'vendeur', rôle actuel:", role);
    // On arrête l'exécution du script
    window.stop();
    alert("Accès refusé ! Vous n'êtes pas vendeur.");
    // Redirection vers la page client
    window.location.replace('../client/html/client.html'); 
}
// ========== VÉRIFICATION 3 : Accès autorisé (l'utilisateur est vendeur) ==========
else {
    // Toutes les vérifications sont passées !
    console.log("✅ Accès vendeur autorisé !");
    
    // Fonction qui affiche la page et charge les produits
    function displayAndLoad() {
        // On affiche la page en mettant display à 'block' (elle était cachée par défaut dans le CSS)
        document.body.style.display = 'block';
        console.log("✅ Page affichée");
        // On initialise tous les éléments du DOM (loader, overlay, bouton commande, etc.)
        initDOM();
        // On charge les produits du vendeur depuis l'API
        chargerproduit();
    }
    
    // CORRECTION DU BUG PRINCIPAL : Vérification du statut du DOM
    // =========================================================================
    // Le problème : Si le script s'exécutait APRÈS que DOMContentLoaded soit déclenché,
    // l'écouteur addEventListener('DOMContentLoaded') ne s'exécutait JAMAIS
    // car cet événement ne se déclenche qu'une seule fois au démarrage de la page.
    // Résultat : document.body.style.display restait à 'none' et la page restait cachée !
    // 
    // La solution : On utilise 'document.readyState' pour vérifier l'état actuel du DOM :
    // - 'loading' : Le DOM est encore en cours de chargement
    // - 'interactive' ou 'complete' : Le DOM est déjà entièrement chargé
    // =========================================================================
    if (document.readyState === 'loading') {
        // ✅ CAS 1 : Le DOM n'est PAS encore complètement chargé
        // On ATTEND que DOMContentLoaded soit déclenché avant d'afficher la page
        // C'est la situation normale quand le script est chargé avant la fin du HTML
        document.addEventListener('DOMContentLoaded', displayAndLoad);
    } else {
        // ✅ CAS 2 : Le DOM EST DÉJÀ complètement chargé
        // C'est le cas quand :
        // - Le script a l'attribut 'defer' et s'exécute après la fin du HTML
        // - ou le script est chargé dynamiquement après le chargement complet
        // Dans ce cas, on appelle displayAndLoad() IMMÉDIATEMENT sans attendre
        displayAndLoad();
    }
}









//suppression d un produit
function deleteProduct(id) {
    if (confirm("Es-tu sûr de vouloir supprimer ce chef-d'œuvre ?")) {

        showLoading(); // On affiche l'icône dès qu'on clique

        fetch(`http://localhost:3000/api/products/${id}`, {
            method: 'DELETE',
            headers: getHeaders() // le token est ajouté automatiquement !
        })
        .then(res => res.json())//on parse la réponse en json
        .then(data => {
            hideLoading(); // On cache l'icône une fois fini
            alert(data.message);// On affiche le message de succès
            window.location.reload(); // On rafraîchit la page pour voir la disparition
            
        })
        .catch(err => {
            
            console.error("Erreur suppression :", err);
        })
        .finally(() => {
            hideLoading(); // On l'arrête dès que les produits sont là ou en cas d'erreur
        });
    }
};

