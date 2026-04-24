//pour le loader de suppression 
// 1. On déclare les éléments
const loader = document.getElementById('loader');
const overlay = document.getElementById('overlay');

// 2. On définit les outils de chargement (AVANT)
function showLoading() {
    loader.style.display = 'block';
    overlay.style.display = 'block';
}

function hideLoading() {
    loader.style.display = 'none';
    overlay.style.display = 'none';
}





const menu = document.getElementById('menu')
const hist = document.getElementById('hist')
const compte = document.getElementById('compte')
const panier = document.getElementById('panier')

panier.addEventListener(
    'click', () => {alert('vous devez d abord creer un panier')});
    

// on automatise le placement des produits sur le site
async function chargerproduit() {
    showLoading(); // On lance le spinner dès le début
    try {
    const response = await fetch('http://localhost:3000/api/products');
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
            <button class="ajouter-panier">Ajouter au panier</button>
            <a href="modifier.html?id=${produit._id}"><button class="modifier">Modifier</button></a>
            <button onclick="deleteProduct('${produit._id}')" class="supprimer">Supprimer</button>
            </div>
        </article>
    `;
});
} catch (error) {
    console.error("Erreur chargement :", err);
    } finally {
        hideLoading(); // On l'arrête dès que les produits sont là ou en cas d'erreur
    }
}

//appel de la fonction pour charger les produits
chargerproduit();





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
}