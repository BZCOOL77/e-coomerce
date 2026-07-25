// =========================================================================
// 🎛️ VARIABLES GLOBALES & NAVIGATION
// =========================================================================
let filtreActuel = 'en-cours';

// Lancement automatique dès que la page HTML est prête
document.addEventListener('DOMContentLoaded', chargerMesAchats);

// =========================================================================
// 🔄 FONCTION PRINCIPALE : CHARGEMENT DES ACHATS
// =========================================================================
async function chargerMesAchats() {
    const loader = document.getElementById('loader-mes-commandes');
    if (loader) loader.style.display = 'flex';
    
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/orders/acheteur`, {
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

        // =========================================================================
        // 🔮 REGROUPEMENT PAR SESSION D'ACHAT (PANIER GLOBAL)
        // =========================================================================
        const colisRegroupes = {};

        commandes.forEach(commande => {
            const idColis = commande.colisGroupId || `SANS-COLIS-${commande._id}`;
            
            if (!colisRegroupes[idColis]) {
                colisRegroupes[idColis] = {
                    colisGroupId: idColis,
                    dateCommande: commande.dateCommande || commande.createdAt,
                    articles: []
                };
            }
            colisRegroupes[idColis].articles.push(commande);
        });

        // =========================================================================
        // 🏗️ INJECTION DU CODE HTML (Un bloc par panier, suivi par article)
        // =========================================================================
        Object.values(colisRegroupes).forEach(colis => {
            let articlesHtml = '';

            colis.articles.forEach(article => {
                const produit = article.produitId || {};
                const statutNormalise = (article.statut || '').toLowerCase();

                // 🚚 Message logistique sur-mesure pour chaque article
                let messageSuivi = '';
                if (statutNormalise === 'en attente') messageSuivi = '⏳ En attente de validation du vendeur.';
                else if (statutNormalise === 'en cours') messageSuivi = '📦 Le vendeur prépare votre colis.';
                else if (statutNormalise === 'expédiée' || statutNormalise === 'expediee') messageSuivi = '🚀 Colis remis au transporteur ! En chemin.';
                else if (statutNormalise === 'livrée' || statutNormalise === 'livree') messageSuivi = '✅ Article reçu. Merci !';
                else if (statutNormalise === 'annulée par acheteur' || statutNormalise === 'annulee par acheteur') messageSuivi = '❌ Vous avez annulé cet article.';
                else if (statutNormalise === 'annulée' || statutNormalise === 'annulee') messageSuivi = '❌ Le vendeur a annulé cet article.';
                else messageSuivi = 'ℹ️ Statut inconnu.';

                // Bouton individuel d'annulation (si l'article est toujours en attente)
                const boutonAnnuler = statutNormalise === 'en attente' 
                    ? `<button class="btn-annuler" onclick="annulerCommande('${article._id}')">❌ Annuler</button>` 
                    : '';

                // Bouton individuel de confirmation de réception (si l'article est expédié)
                const boutonValider = (statutNormalise === 'expédiée' || statutNormalise === 'expediee')
                    ? `<button class="btn-valider-reception" onclick="validerReception('${article._id}')">🛬 Confirmer la réception</button>`
                    : '';

                // Génération de la rangée de l'article avec son propre Badge de Statut autonome
                articlesHtml += `
                    <div class="article-ligne-achat" data-statut="${article.statut}" style="display: flex; gap: 15px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #e2e8f0; align-items: center;">
                        <img src="${produit.image || 'placeholder.jpg'}" style="width: 65px; height: 65px; object-fit: cover; border-radius: 8px;">
                        <div style="flex-grow: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                                <h4 style="margin: 0; color: #2d3748; font-size: 1rem;">${produit.nom || 'Article'}</h4>
                                <span class="badge statut-${statutNormalise.replace(/ /g,'-')}" style="padding: 3px 8px; font-size: 0.75rem; font-weight: 700; border-radius: 12px;">
                                    statut : ${article.statut ? article.statut.toUpperCase() : 'N/A'}
                                </span>
                            </div>
                            <p style="margin: 0 0 4px 0; font-size: 0.85rem; color: #718096;">Quantité : ${article.quantite || 1} | Prix : ${produit.prix || 0} €</p>
                            <span style="font-size: 0.85rem; font-weight: 500; color: #4a5568;">${messageSuivi}</span>
                        </div>
                        <div class="article-actions" style="display: flex; flex-direction: column; gap: 5px;">
                            ${boutonAnnuler}
                            ${boutonValider}
                        </div>
                    </div>
                `;
            });

            // Bouton de facture PDF lié à l'ID de commande globale
            let boutonFacture = `<button onclick="telechargerFacturePDF('${colis.colisGroupId}')" class="btn-pdf">
                📥 Facture (PDF)
            </button>`;

            // Injection du container général de la session d'achat
            container.innerHTML += `
                <div class="commande-card-wrapper" style="margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                    <div class="commande-header" style="background: #f8fafc; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7;">
                        <div>
                            <span style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; color: #a0aec0; font-weight: bold;">Commande Groupée</span>
                            <h3 style="margin: 2px 0 5px 0; color: #1a202c; font-size: 1.15rem;">🛒 N° : #${colis.colisGroupId.substring(0, 15)}</h3>
                            <p class="date-commande" style="margin: 0; font-size: 0.85rem; color: #718096;">Passée le : ${new Date(colis.dateCommande).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <div>
                            ${boutonFacture}
                        </div>
                    </div>
                    <div class="colis-articles-list" style="padding: 20px 20px 5px 20px;">
                        ${articlesHtml}
                    </div>
                </div>
            `;
        });

        // =========================================================================
        // 🟢 COMPTEUR DE NOTIFICATIONS DES ACHATS EN COURS
        // =========================================================================
        let totalAchatsEnCours = 0;
        const statutsHistoriquesAcheteur = ['livrée', 'livree', 'annulée', 'annulee', 'annulée par acheteur', 'annulee par acheteur'];

        commandes.forEach(commande => {
            const statutNormalise = (commande.statut || '').toLowerCase();
            if (!statutsHistoriquesAcheteur.includes(statutNormalise)) {
                totalAchatsEnCours++;
            }
        });

        const badgeAcheteur = document.getElementById('compteur-acheteur');
        if (badgeAcheteur) {
            if (totalAchatsEnCours > 0) {
                badgeAcheteur.textContent = totalAchatsEnCours;
                badgeAcheteur.style.display = 'inline-block';
            } else {
                badgeAcheteur.style.display = 'none';
            }
        }

        // Application immédiate des filtres d'onglets ("En cours" / "Historique")
        appliquerFiltrageAcheteur();

    } catch (err) {
        console.error(err);
        document.getElementById('liste-achats').innerHTML = "<p style='color:red;'>Erreur lors de la récupération des données.</p>";
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// =========================================================================
// 🎚️ GESTION DES FILTRES ET ONGLET (En cours / Historique)
// =========================================================================
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

function appliquerFiltrageAcheteur() {
    const lignesArticles = document.querySelectorAll('.article-ligne-achat');
    const statutsHistoriques = ['livree', 'annulee', 'annulee par acheteur'];

    lignesArticles.forEach(ligne => {
        const statutRaw = ligne.getAttribute('data-statut') || '';
        const statutNorm = statutRaw
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        const estDansLhistorique = statutsHistoriques.includes(statutNorm);

        if (filtreActuel === 'en-cours') {
            ligne.style.display = estDansLhistorique ? 'none' : 'flex';
        } else if (filtreActuel === 'historique') {
            ligne.style.display = estDansLhistorique ? 'flex' : 'none';
        }
    });

    // Masquage ou affichage dynamique de la carte entière si elle est vide sous le filtre actuel
    document.querySelectorAll('.commande-card-wrapper').forEach(wrapper => {
        const articlesVisibles = Array.from(wrapper.querySelectorAll('.article-ligne-achat')).some(l => l.style.display !== 'none');
        wrapper.style.display = articlesVisibles ? 'block' : 'none';
    });
}

// =========================================================================
// 🛫 INTERACTIONS BACKEND (Annulation / Validation Réception)
// =========================================================================
async function annulerCommande(commandeId) {
    if (!confirm('⚠️ Êtes-vous sûr de vouloir annuler cette commande ? Cette action est irréversible.')) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/orders/${commandeId}/annuler-acheteur`, {
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
            console.error('Réponse non-JSON reçue du serveur:', text);
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

async function validerReception(commandeId) {
    if (!confirm('📬 Confirmez-vous avoir reçu votre colis en bon état ? Cette action va clôturer la commande.')) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/orders/${commandeId}/statut`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ statut: 'livrée' })
        });

        if (response.ok) {
            alert("🎉 Commande validée ! Merci d'avoir partagé la réception.");
            chargerMesAchats();
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert("Erreur du serveur : " + (errorData.error || "Impossible de valider la réception."));
        }
    } catch (err) {
        console.error(err);
        alert("Erreur lors de la validation de la commande.");
    }
}

// =========================================================================
// 📄 EXPORT ET TÉLÉCHARGEMENT DE LA FACTURE PDF
// =========================================================================
async function telechargerFacturePDF(colisGroupId) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert("Session expirée. Veuillez vous reconnecter.");
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/orders/${colisGroupId}/invoice?role=client`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Impossible de récupérer le fichier PDF.");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture-${colisGroupId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Erreur de téléchargement :", error);
        alert("Erreur lors du téléchargement de la facture PDF.");
    }
}