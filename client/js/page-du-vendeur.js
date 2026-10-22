const vendeurIdPage = new URLSearchParams(window.location.search).get('vendeurId');
const imageParDefaut = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 700"%3E%3Crect width="600" height="700" fill="%23eeedf5"/%3E%3Ctext x="300" y="360" text-anchor="middle" font-family="Arial" font-size="32" fill="%237765a8"%3EBoutique%3C/text%3E%3C/svg%3E';

function echapperHTML(valeur = '') {
    return String(valeur).replace(/[&<>"']/g, caractere => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caractere]);
}

function obtenirImageSecurisee(image) {
    const valeur = String(image || '').trim();
    if (!valeur || /^(javascript|vbscript):/i.test(valeur)) return imageParDefaut;
    if (/^data:/i.test(valeur) && !/^data:image\//i.test(valeur)) return imageParDefaut;
    return valeur;
}

function afficherErreur(message) {
    const etat = document.getElementById('products-state');
    etat.textContent = message;
}

function afficherProfil(vendeur) {
    const boutique = vendeur.boutique || {};
    const nomBoutique = boutique.nomBoutique || 'Boutique sans nom';
    const photo = obtenirImageSecurisee(boutique.photoBoutique);

    document.title = `${nomBoutique} | Shopy-Cloths`;
    document.getElementById('nom-boutique').textContent = nomBoutique;
    document.getElementById('nom-vendeur').textContent = [vendeur.prenom, vendeur.nom]
        .filter(Boolean)
        .join(' ');
    document.getElementById('description-boutique').textContent =
        boutique.descriptionBoutique || 'Découvrez la sélection de cette boutique.';
    document.getElementById('avatar-placeholder').textContent = nomBoutique.charAt(0).toUpperCase();//ici on met la première lettre du nom de la boutique en majuscule comme avatar par défaut

    if (photo !== imageParDefaut) {
        const cover = document.getElementById('photo-couverture');
        cover.src = photo;
        cover.hidden = false;
        cover.addEventListener('error', () => {
            cover.hidden = true;
        }, { once: true });

        const avatar = document.getElementById('photo-boutique');
        avatar.src = photo;
        avatar.hidden = false;
        document.getElementById('avatar-placeholder').hidden = true;
        avatar.addEventListener('error', () => {
            avatar.hidden = true;
            document.getElementById('avatar-placeholder').hidden = false;
        }, { once: true });
    }

    const categorie = boutique.categorieBoutique;
    if (categorie) {
        const categorieTag = document.getElementById('categorie-boutique');
        categorieTag.textContent = categorie;
        categorieTag.hidden = false;
    }

    const localisation = [boutique.communeBoutique, boutique.villeBoutique]
        .filter(Boolean)
        .join(', ');
    if (localisation) {
        const localisationTag = document.getElementById('localisation-boutique');
        localisationTag.textContent = localisation;
        localisationTag.hidden = false;
    }

    if (boutique.telephoneBoutique) {
        const contact = document.getElementById('contact-boutique');
        contact.href = `tel:${String(boutique.telephoneBoutique).replace(/[^\d+]/g, '')}`;
        contact.hidden = false;
    }
}

function afficherProduits(produits) {
    const grille = document.getElementById('products-grid');
    const compteur = document.getElementById('product-count');
    const etat = document.getElementById('products-state');

    if (!Array.isArray(produits)) {
        throw new Error('Le serveur a renvoyé une liste de produits invalide.');
    }

    compteur.textContent = `${produits.length} produit${produits.length === 1 ? '' : 's'}`;
    if (produits.length === 0) {
        etat.textContent = 'Cette boutique ne propose pas encore de produits.';
        return;
    }

    etat.textContent = '';
    grille.innerHTML = produits.map(produit => {
        const id = String(produit._id || '');
        const nom = produit.nom || 'Produit sans nom';
        const image = obtenirImageSecurisee(produit.image);
        const variantes = Array.isArray(produit.variantes) ? produit.variantes : [];
        const aDesVariantes = variantes.length > 0;
        const variantesDisponibles = variantes.filter(variante => Number(variante.stock) > 0).length;
        const estDisponible = aDesVariantes
            ? variantesDisponibles > 0
            : Number(produit.stock) > 0;
        const stockTexte = aDesVariantes
            ? `${variantesDisponibles} taille${variantesDisponibles === 1 ? '' : 's'} disponible${variantesDisponibles === 1 ? '' : 's'}`
            : estDisponible ? 'En stock' : 'Épuisé';
        const note = Number(produit.averageRating || 0);
        const affichageNote = Number.isFinite(note) && note >= 3 ? `
            <div class="product-rating" aria-label="Note moyenne">
                <span class="rating-stars"></span>
                <span class="rating-value">${note.toFixed(1)}/5</span>
            </div>
        ` : '';

        return `
            <article class="product-card" data-rating="${Number.isFinite(note) ? note : 0}">
                <a class="product-image-link" href="detail.html?id=${encodeURIComponent(id)}" aria-label="Voir ${echapperHTML(nom)}">
                    <img class="product-image" src="${echapperHTML(image)}" alt="${echapperHTML(nom)}" loading="lazy">
                </a>
                <div class="product-body">
                    <span class="product-category">${echapperHTML(produit.categorie || 'Sélection')}</span>
                    <h3 class="product-name">${echapperHTML(nom)}</h3>
                    ${affichageNote}
                    <p class="product-price">${echapperHTML(produit.prix ?? 0)} ${echapperHTML(produit.devise || 'FC')}</p>
                    <p class="product-stock${estDisponible ? '' : ' out-of-stock'}">${echapperHTML(stockTexte)}</p>
                    <a class="product-detail-link" href="detail.html?id=${encodeURIComponent(id)}">Découvrir le produit</a>
                </div>
            </article>
        `;
    }).join('');

    grille.querySelectorAll('.product-image').forEach(image => {
        image.addEventListener('error', () => {
            image.src = imageParDefaut;
        }, { once: true });
    });

    if (typeof window.renderProductRating === 'function') {
        grille.querySelectorAll('.product-card').forEach(card => {
            window.renderProductRating(
                Number(card.dataset.rating),
                card.querySelector('.rating-stars'),
                card.querySelector('.rating-value')
            );
        });
    }
}

async function chargerPageVendeur() {
    if (!vendeurIdPage) {
        document.getElementById('nom-boutique').textContent = 'Boutique introuvable';
        afficherErreur('Aucun vendeur n’a été indiqué. Retournez à la liste des boutiques pour en choisir un.');
        return;
    }

    try {
        const [vendeursResponse, produitsResponse] = await Promise.all([
            fetch(`${CONFIG.API_BASE_URL}/api/auth/vendeurs`),
            fetch(`${CONFIG.API_BASE_URL}/api/products?vendeurId=${encodeURIComponent(vendeurIdPage)}`)
        ]);

        if (!vendeursResponse.ok) {
            throw new Error('Impossible de récupérer les informations de la boutique.');
        }
        if (!produitsResponse.ok) {
            throw new Error('Impossible de récupérer les produits de cette boutique.');
        }

        const vendeurs = await vendeursResponse.json();
        const produits = await produitsResponse.json();
        if (!Array.isArray(vendeurs)) {
            throw new Error('Le serveur a renvoyé une liste de vendeurs invalide.');
        }

        const vendeur = vendeurs.find(entree => String(entree._id) === vendeurIdPage);
        if (!vendeur) {
            document.getElementById('nom-boutique').textContent = 'Boutique introuvable';
            afficherErreur('Cette boutique n’existe pas ou n’est plus disponible.');
            return;
        }

        afficherProfil(vendeur);
        afficherProduits(produits);
    } catch (error) {
        console.error('Erreur lors du chargement de la boutique :', error);
        afficherErreur(error.message || 'Une erreur est survenue pendant le chargement de la boutique.');
    }
}

document.addEventListener('DOMContentLoaded', chargerPageVendeur);
