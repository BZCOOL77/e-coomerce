let filtreActuel = 'en-cours';

async function chargerMesAchats() {
    const loader = document.getElementById('loader-mes-commandes');
    if (loader) loader.style.display = 'flex';
    try {
        const response = await fetch('http://localhost:3000/api/orders/acheteur', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error("Impossible de charger vos commandes");

        const commandes = await response.json();
        const container = document.getElementById('liste-achats');
        container.innerHTML = '';

        if (commandes.length === 0) {
            container.innerHTML = "<p>Vous n'avez effectué aucun achat pour le moment. 🛍️</p>";
            if (loader) loader.style.display = 'none';
            return;
        }

        commandes.forEach(commande => {
            const produit = commande.produitId || {};
            const statutNormalise = (commande.statut || '').toLowerCase();
            const estLivree = statutNormalise === 'livrée' || statutNormalise === 'livree';

            // 🌟 PETITE UX SYMPA : On adapte un message d'étape selon le statut mis par le vendeur
            let messageSuivi = '';
            if (statutNormalise === 'en attente') messageSuivi = '⏳ Le vendeur doit valider votre commande.';//le mot normalise veut dire que même si le vendeur a écrit "En attente" ou "en attente" ou "EN ATTENTE", on comprend tous la même chose gerer la casse et les accents pour éviter les problèmes de comparaison
            else if (statutNormalise === 'en cours') messageSuivi = '📦 Votre colis est en cours d\'emballage chez le partenaire.';
            else if (statutNormalise === 'expédiée' || statutNormalise === 'expediee') messageSuivi = '🚀 Colis remis au transporteur ! Il arrive bientôt.';
            else if (statutNormalise === 'livrée' || statutNormalise === 'livree') messageSuivi = '✅ Colis reçu. Merci de votre confiance !';
            else if (statutNormalise === 'annulée par acheteur' || statutNormalise === 'annulee par acheteur') messageSuivi = '❌ Commande annulée par vous.';
            else if (statutNormalise === 'annulée' || statutNormalise === 'annulee') messageSuivi = '❌ Commande annulée par le vendeur.';
            else messageSuivi = 'ℹ️ Statut inconnu. Contactez le support si besoin.';

            // Injection de la carte avec l'attribut data-statut
            const boutonAnnuler = statutNormalise === 'en attente' 
                ? `<button class="btn-annuler" onclick="annulerCommande('${commande._id}')">❌ Annuler cette commande</button>` 
                : '';
            
            container.innerHTML += `
                <div class="commande-card" data-statut="${commande.statut}">
                    <div class="commande-header">
                        <img src="${produit.image || 'placeholder.jpg'}">
                        <div>
                            <h3>${produit.nom || 'Article'}</h3>
                            <p>Quantité : ${commande.quantite || 1} | Total : ${(produit.prix || 0) * (commande.quantite || 1)} €</p>
                            <p class="date-commande">Commandé le : ${new Date(commande.dateCommande).toLocaleDateString('fr-FR')}</p>
                        </div>
                    </div>
                    <div class="suivi-colis">
                        <strong>Statut de la commande :</strong> ${commande.statut}<br>
                        <span>${messageSuivi}</span>
                    </div>
                    ${boutonAnnuler}
                </div>
            `;
        });

        // Application immédiate du filtre au chargement
        appliquerFiltrageAcheteur();

    } catch (err) {
        console.error(err);
        document.getElementById('liste-achats').innerHTML = "<p style='color:red;'>Erreur lors de la récupération des données.</p>";
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// Fonction pour alterner visuellement les onglets
function basculerOnglet(typeOnglet) {
    filtreActuel = typeOnglet;
    document.getElementById('onglet-en-cours').classList.remove('active');
    document.getElementById('onglet-historique').classList.remove('active');

    if (typeOnglet === 'en-cours') {
        document.getElementById('onglet-en-cours').classList.add('active');
    } else {
        document.getElementById('onglet-historique').classList.add('active');
    }
    appliquerFiltrageAcheteur();
}

// Fonction magique de masquage
function appliquerFiltrageAcheteur() {
    const cartes = document.querySelectorAll('.commande-card');

    cartes.forEach(carte => {
        const statut = carte.getAttribute('data-statut');

        if (filtreActuel === 'en-cours') {
            // L'acheteur veut voir ce qui bouge encore (Tout SAUF 'Livrée')
            if (statut === 'Livrée') {
                carte.style.display = 'none';
            } else {
                carte.style.display = 'block';
            }
        } else if (filtreActuel === 'historique') {
            // L'historique ne montre QUE les commandes closes ('Livrée')
            if (statut === 'Livrée') {
                carte.style.display = 'block';
            } else {
                carte.style.display = 'none';
            }
        }
    });
}

// Lancement automatique
document.addEventListener('DOMContentLoaded', chargerMesAchats);

// 🛑 Fonction pour annuler une commande
async function annulerCommande(commandeId) {
    if (!confirm('⚠️ Êtes-vous sûr de vouloir annuler cette commande ? Cette action est irréversible.')) {
        return;
    }

    console.log('🔍 ID envoyé:', commandeId);
    console.log('🔍 URL complète:', `http://localhost:3000/api/orders/${commandeId}/annuler-acheteur`);
    console.log('🔍 Token:', localStorage.getItem('token') ? 'Présent' : 'ABSENT');

    try {
        const response = await fetch(`http://localhost:3000/api/orders/${commandeId}/annuler-acheteur`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        const contentType = response.headers.get('content-type');
        let data;

        // Vérifier si la réponse est du JSON
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // Si ce n'est pas du JSON, récupérer le texte
            const text = await response.text();
            console.error('Réponse non-JSON:', text);
            throw new Error(`Erreur serveur: ${response.status} - ${response.statusText}`);
        }

        if (!response.ok) {
            throw new Error(data.error || "Erreur lors de l'annulation");
        }

        alert('✅ ' + data.message);
        
        // Recharger la liste des commandes
        chargerMesAchats();

    } catch (err) {
        console.error(err);
        alert('❌ ' + err.message);
    }
}