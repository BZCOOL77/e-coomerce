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

            // 🌟 PETITE UX SYMPA : On adapte un message d'étape selon le statut mis par le vendeur
            let messageSuivi = '';
            if (statutNormalise === 'en attente') messageSuivi = '⏳ Le vendeur doit valider votre commande.';
            else if (statutNormalise === 'en cours') messageSuivi = '📦 Votre colis est en cours d\'emballage chez le partenaire.';
            else if (statutNormalise === 'expédiée' || statutNormalise === 'expediee') messageSuivi = '🚀 Colis remis au transporteur ! Il arrive bientôt.';
            else if (statutNormalise === 'livrée' || statutNormalise === 'livree') messageSuivi = '✅ Colis reçu. Merci de votre confiance !';
            else if (statutNormalise === 'annulée par acheteur' || statutNormalise === 'annulee par acheteur') messageSuivi = '❌ Commande annulée par vous.';
            else if (statutNormalise === 'annulée' || statutNormalise === 'annulee') messageSuivi = '❌ Commande annulée par le vendeur.';
            else messageSuivi = 'ℹ️ Statut inconnu. Contactez le support si besoin.<br><a href="mailto:support@shopycloth.com">Contactez le support</a>';

            // Injection de la carte avec l'attribut data-statut
            const boutonAnnuler = statutNormalise === 'en attente' 
                ? `<button class="btn-annuler" onclick="annulerCommande('${commande._id}')">❌ Annuler cette commande</button>` 
                : '';

            //bouton de validation de la reception de la commande
            //  Si le colis est expédié, l'acheteur peut valider la réception !
            const boutonValider = (statutNormalise === 'expédiée' || statutNormalise === 'expediee')
                ? `<button class="btn-valider-reception" onclick="validerReception('${commande._id}')">🛬 J'ai bien reçu mon colis</button>`
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
                    ${boutonValider}
                </div>
            `;
        });

        // 🟢 LE CODE DU COMPTEUR ACHETEUR :
        let totalAchatsEnCours = 0;
        const statutsHistoriquesAcheteur = ['livrée', 'livree', 'annulée', 'annulee', 'annulée par acheteur', 'annulee par acheteur'];

        commandes.forEach(commande => {
            const statutNormalise = (commande.statut || '').toLowerCase();
            // Si la commande n'est ni livrée ni annulée, elle est toujours active !
            if (!statutsHistoriquesAcheteur.includes(statutNormalise)) {
                totalAchatsEnCours++;
            }
        });

        const badgeAcheteur = document.getElementById('compteur-acheteur');
        if (badgeAcheteur) {
            if (totalAchatsEnCours > 0) {
                badgeAcheteur.textContent = totalAchatsEnCours;
                badgeAcheteur.style.display = 'inline-block'; // On l'affiche fièrement
            } else {
                badgeAcheteur.style.display = 'none'; // S'il n'y a rien en route, on cache
            }
        }

        // Application immédiate du filtre au chargement
        appliquerFiltrageAcheteur();

    } catch (err) {
        console.error(err);
        document.getElementById('liste-achats').innerHTML = "<p style='color:red;'>Erreur lors de la récupération des données.</p>";
    } finally {
        if (loader) loader.style.display = 'none';
    }
}


// Fonction pour valider la réception d'une commande
async function validerReception(commandeId) {
    if (!confirm('📬 Confirmez-vous avoir reçu votre colis en bon état ? Cette action va clôturer la commande.')) {
        return;
    }

    try {
        // On réutilise la même route de changement de statut que ton backend possède déjà !
        const response = await fetch(`http://localhost:3000/api/orders/${commandeId}/statut`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ statut: 'livrée' }) // On force le passage à 'livrée'
        });

        if (response.ok) {
            alert("🎉 Commande validée ! Merci d'avoir partagé la réception.");
            chargerMesAchats(); // On recharge les données pour mettre à jour l'affichage et le badge !
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert("Erreur du serveur : " + (errorData.error || "Impossible de valider la réception."));
        }
    } catch (err) {
        console.error(err);
        alert("Erreur lors de la validation de la commande.");
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
    const statutsHistoriques = ['livree', 'annulee', 'annulee par acheteur'];

    cartes.forEach(carte => {
        const statutRaw = carte.getAttribute('data-statut') || '';
        
        const statutNorm = statutRaw
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        const estDansLhistorique = statutsHistoriques.includes(statutNorm);

        if (filtreActuel === 'en-cours') {
            carte.style.display = estDansLhistorique ? 'none' : 'block';
        } else if (filtreActuel === 'historique') {
            carte.style.display = estDansLhistorique ? 'block' : 'none';
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

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error('Réponse non-JSON:', text);
            throw new Error(`Erreur serveur: ${response.status} - ${response.statusText}`);
        }

        if (!response.ok) {
            throw new Error(data.error || "Erreur lors de l'annulation");
        }

        alert('✅ ' + data.message);
        chargerMesAchats();

    } catch (err) {
        console.error(err);
        alert('❌ ' + err.message);
    }
}