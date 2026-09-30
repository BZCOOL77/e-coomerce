// =========================================================================
// 🎛️ VARIABLES GLOBALES & NAVIGATION
// =========================================================================
let filtreActuel = 'en-cours';
// Clé utilisée pour conserver les commandes historiques déjà consultées dans le navigateur.
const CLE_HISTORIQUE_LU = 'mes-commandes-historique-lu';
// Liste locale des commandes chargées afin de pouvoir marquer l'historique comme lu au clic.
let commandesAcheteur = [];
// Statuts qui doivent apparaître dans l'onglet historique.
const STATUTS_HISTORIQUES = ['annulee', 'annulee par acheteur', 'recue', 'livree', 'echec de livraison'];

// Lancement automatique dès que la page HTML est prête
document.addEventListener('DOMContentLoaded', chargerMesAchats);

// =========================================================================
// 🛠️ FONCTIONS UTILITAIRES
// =========================================================================
function normaliserStatut(statut = '') {
    return (statut || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

// Échappe les caractères spéciaux avant d’insérer une donnée utilisateur dans un template HTML.
function echapperHTML(valeur = '') {
    return String(valeur).replace(/[&<>"']/g, caractere => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caractere]);
}

// Récupère les identifiants historiques déjà consultés sans interrompre la page si le stockage est invalide.
function obtenirHistoriqueLu() {
    try {
        const historiqueLu = JSON.parse(localStorage.getItem(CLE_HISTORIQUE_LU) || '[]');
        return Array.isArray(historiqueLu) ? historiqueLu : [];
    } catch (err) {
        console.warn('Impossible de lire les commandes historiques déjà consultées.', err);
        return [];
    }
}

// Indique si un statut (d'article ou de colis) appartient à l'historique affiché par l'onglet.
function estStatutHistorique(statut) {
    return STATUTS_HISTORIQUES.includes(normaliserStatut(statut));
}

// Actualise le badge historique avec le nombre d'éléments historiques non consultés.
function mettreAJourCompteurHistorique() {
    const historiqueLu = obtenirHistoriqueLu();
    let totalHistoriqueNonLu = 0;

    commandesAcheteur.forEach(commande => {
        (commande.vendorsOrders || []).forEach(sousCommande => {
            (sousCommande.items || []).forEach(item => {
                const statutEffectif = item.statut || sousCommande.statutVendeur;
                const idItem = item._id || `${sousCommande._id}-${item.produitId?._id || item.produitId}`;

                if (estStatutHistorique(statutEffectif) && !historiqueLu.includes(idItem)) {
                    totalHistoriqueNonLu++;
                }
            });
        });
    });

    const badgeHistorique = document.getElementById('compteur-historique');
    if (badgeHistorique) {
        badgeHistorique.textContent = totalHistoriqueNonLu;
        badgeHistorique.style.display = totalHistoriqueNonLu > 0 ? 'inline-block' : 'none';
    }
}

// Marque tous les articles/colis historiques actuellement chargés comme consultés.
function marquerHistoriqueCommeLu() {
    const historiqueLu = obtenirHistoriqueLu();
    const nouveauxIdsLus = [];

    commandesAcheteur.forEach(commande => {
        (commande.vendorsOrders || []).forEach(sousCommande => {
            (sousCommande.items || []).forEach(item => {
                const statutEffectif = item.statut || sousCommande.statutVendeur;
                if (estStatutHistorique(statutEffectif)) {
                    const idItem = item._id || `${sousCommande._id}-${item.produitId?._id || item.produitId}`;
                    nouveauxIdsLus.push(idItem);
                }
            });
        });
    });

    const historiqueMisAJour = [...new Set([...historiqueLu, ...nouveauxIdsLus])];
    localStorage.setItem(CLE_HISTORIQUE_LU, JSON.stringify(historiqueMisAJour));
    mettreAJourCompteurHistorique();
}

// Génère le message et l'icône logistique
function obtenirMessageSuivi(statut) {
    const statutNormalise = normaliserStatut(statut);

    if (statutNormalise === 'en attente') return '⏳ En attente de validation du vendeur.';
    if (statutNormalise === 'en cours' || statutNormalise === 'encours') return '📦 Le vendeur prépare votre colis.';
    if (statutNormalise === 'expédiée' || statutNormalise === 'expediee') return '🚀 Colis remis au transporteur ! En chemin.';
    if (statutNormalise === 'livrée' || statutNormalise === 'livree') return '✅ Article reçu. Merci !';
    if (statutNormalise === 'annulée par acheteur' || statutNormalise === 'annulee par acheteur') return '❌ Vous avez annulé cet article.';
    if (statutNormalise === 'annulée' || statutNormalise === 'annulee') return '❌ Le vendeur a annulé cet article.';
    if (statutNormalise === 'attribuéealivreur' || statutNormalise === 'attribueealivreur') return '🚚 Article attribué à un livreur.';
    if (statutNormalise === 'prise en charge') return '📦 Le transporteur a pris en charge votre colis.';
    if (statutNormalise === 'reçue' || statutNormalise === 'recue') return 'Vous avez confirmé la réception du colis.';
    if (statutNormalise === 'echec de livraison') return 'La livraison a échoué.';
    return 'ℹ️ Statut inconnu.';
}

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

        if (!response.ok) {
            const erreurApi = await response.json().catch(() => ({}));
            throw new Error(erreurApi.error || `Impossible de charger vos commandes (${response.status})`);
        }

        const commandes = await response.json();
        if (!Array.isArray(commandes)) {
            throw new Error('Le serveur a renvoyé un format de commandes inattendu.');
        }
        commandesAcheteur = commandes;
        const container = document.getElementById('liste-achats');
        container.innerHTML = '';

        if (!commandes || commandes.length === 0) {
            container.innerHTML = "<p>Vous n'avez effectué aucun achat pour le moment. 🛍️</p>";
            if (loader) loader.style.display = 'none';
            return;
        }

        // =========================================================================
        // 🏗️ INJECTION DU CODE HTML (Structure Panier -> Colis Vendeurs -> Articles)
        // =========================================================================
        commandes.forEach(commandeGlobale => {
            const dateCommande = new Date(commandeGlobale.createdAt || commandeGlobale.dateCommande).toLocaleDateString('fr-FR');
            // Une valeur reçue par JSON peut venir d'une ancienne donnée
            // stockée comme texte. Number() garantit que toFixed() fonctionne.
            const totalTTC = Number(commandeGlobale.totalTTCGlobal) || 0;
            // Le nouveau backend renvoie vendorsOrders. Le fallback transforme
            // une ancienne commande plate en colis unique pour préserver l'historique.
            const commandeLegacy = !commandeGlobale.vendorsOrders?.length;
            const vendorsOrders = !commandeLegacy
                ? commandeGlobale.vendorsOrders
                : (commandeGlobale.produitId ? [{
                    _id: commandeGlobale._id,
                    // Les anciennes commandes possèdent le vendeur à la
                    // racine. On le transmet au colis reconstruit afin que
                    // le nom de la boutique puisse être affiché.
                    vendeurId: commandeGlobale.vendeurId || null,
                    colisGroupId: commandeGlobale.colisGroupId || `LEGACY-${commandeGlobale._id}`,
                    statutVendeur: commandeGlobale.statut || 'en attente',
                    items: [{
                        produitId: commandeGlobale.produitId,
                        quantite: commandeGlobale.quantite || 1,
                        prixUnitaire: commandeGlobale.prixUnitaire || 0,
                        totalTTC: commandeGlobale.totalTTC || 0
                    }]
                }] : []);

            let sousCommandesHtml = '';// Conteneur HTML pour les sous-commandes (colis vendeurs)

            vendorsOrders.forEach((sousCommande, index) => {
                const idColis = sousCommande.colisGroupId || sousCommande._id || `COLIS-${index + 1}`;
                const statutColis = sousCommande.statutVendeur || 'en attente';
                const vendeur = sousCommande.vendeurId && typeof sousCommande.vendeurId === 'object'
                    ? sousCommande.vendeurId
                    : null;
                const nomBoutique = vendeur?.boutique?.nomBoutique
                    || vendeur?.nomBoutique
                    || [vendeur?.prenom, vendeur?.nom].filter(Boolean).join(' ')
                    || 'Boutique inconnue';
                const nomBoutiqueHTML = echapperHTML(nomBoutique);

                // Recherche le code OTP associé au colis (si en prise en charge)
                const codeOtpColis = sousCommande.codeOtp || '';
                const affichageOtpColis = (normaliserStatut(statutColis) === 'prise en charge' && codeOtpColis)
                    ? `<span style="display: block; margin-top: 8px; font-weight: 700; color: #2b6cb0;">Code OTP : ${codeOtpColis}</span>`
                    : '';

                let articlesHtml = '';

                (sousCommande.items || []).forEach(item => {
                    const produit = item.produitId || {};

                    // Statut de l'article individuel s'il existe, sinon celui de sa sous-commande
                    const statutArticle = item.statut || statutColis;
                    const statutArticleNorm = normaliserStatut(statutArticle);
                    const messageSuivi = obtenirMessageSuivi(statutArticle);
                    const produitId = produit._id || item.produitId;
                    const boutonAnnuler = statutArticleNorm === 'en attente' && normaliserStatut(statutColis) === 'en attente'
                        ? `<button class="btn-annuler" onclick="annulerArticleIndividuel('${commandeGlobale._id}', '${commandeLegacy ? '' : idColis}', '${item._id || ''}', '${produitId}')">❌ Annuler cet article</button>`
                        : '';

                    articlesHtml += `
                        <div class="article-ligne-achat" data-statut="${statutArticle}" style="display: flex; gap: 15px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #e2e8f0; align-items: center;">
                            <img src="${produit.image || 'placeholder.jpg'}" style="width: 65px; height: 65px; object-fit: cover; border-radius: 8px;">
                            <div style="flex-grow: 1;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                                    <h4 style="margin: 0; color: #2d3748; font-size: 1rem;">${produit.nom || 'Article'}</h4>
                                    <span class="badge statut-${statutArticleNorm.replace(/ /g, '-')}" style="padding: 3px 8px; font-size: 0.75rem; font-weight: 700; border-radius: 12px;">
                                        statut : ${statutArticle.toUpperCase()}
                                    </span>
                                </div>
                                <p style="margin: 0 0 4px 0; font-size: 0.85rem; color: #718096;">Quantité : ${item.quantite || 1} | Prix : ${item.prixUnitaire || produit.prix || 0} €</p>
                                <span style="font-size: 0.85rem; font-weight: 500; color: #4a5568;">${messageSuivi}</span>
                            </div>
                            <div class="article-actions" style="display: flex; flex-direction: column; gap: 5px;">
                                ${boutonAnnuler}
                            </div>
                        </div>
                    `;
                });

                // Bloc du Colis Vendeur
                sousCommandesHtml += `
                    <div class="colis-vendeur-block" data-colis-id="${idColis}" style="margin-bottom: 15px; background: #faf5ff; border: 1px solid #e9d8fd; border-radius: 8px; padding: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9d8fd;">
                            <div>
                                <span style="font-size: 0.75rem; text-transform: uppercase; color: #805ad5; font-weight: bold;">Colis boutique </span>
                                <p style="margin: 2px 0; color: #4a5568; font-size: 0.85rem;">Boutique : ${nomBoutiqueHTML}</p>
                                <h4 style="margin: 0; color: #2d3748; font-size: 0.95rem;">📦 N° Colis : #${idColis.toString().substring(0, 15)}</h4>
                            </div>
                            <div>
                                <button onclick="telechargerFacturePDF('${idColis}')" class="btn-pdf">
                                    📥 Facture de ce colis (PDF)
                                </button>
                                ${affichageOtpColis}
                            </div>
                        </div>
                        <div class="colis-articles-list">
                            ${articlesHtml}
                        </div>
                    </div>
                `;
            });

            // Container principal du panier d'achat
            container.innerHTML += `
                <div class="commande-card-wrapper" style="margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                    <div class="commande-header" style="background: #f8fafc; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7;">
                        <div>
                            <span style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; color: #a0aec0; font-weight: bold;">Commande Groupée</span>
                            <h3 style="margin: 2px 0 5px 0; color: #1a202c; font-size: 1.15rem;">🛒 Total Panier : ${totalTTC.toFixed(2)} €</h3>
                            <p class="date-commande" style="margin: 0; font-size: 0.85rem; color: #718096;">Passée le : ${dateCommande}</p>
                        </div>
                    </div>
                    <div style="padding: 20px 20px 5px 20px;">
                        ${sousCommandesHtml}
                    </div>
                </div>
            `;
        });

        // =========================================================================
        // 🟢 COMPTEUR DE NOTIFICATIONS DES ACHATS EN COURS
        // =========================================================================
        let totalArticlesEnCours = 0;

        commandes.forEach(commande => {
            (commande.vendorsOrders || []).forEach(sousCommande => {
                (sousCommande.items || []).forEach(item => {
                    const st = item.statut || sousCommande.statutVendeur;
                    if (!estStatutHistorique(st)) {
                        totalArticlesEnCours++;
                    }
                });
            });
        });

        const badgeAcheteur = document.getElementById('compteur-acheteur');
        if (badgeAcheteur) {
            if (totalArticlesEnCours > 0) {
                badgeAcheteur.textContent = totalArticlesEnCours;
                badgeAcheteur.style.display = 'inline-block';
            } else {
                badgeAcheteur.style.display = 'none';
            }
        }

        // Mise à jour du compteur historique & filtres
        mettreAJourCompteurHistorique();
        if (filtreActuel === 'historique') marquerHistoriqueCommeLu();

        appliquerFiltrageAcheteur();

    } catch (err) {
        console.error('Erreur détaillée lors du chargement des achats :', err);
        document.getElementById('liste-achats').innerHTML = `<p style='color:red;'>${echapperHTML(err.message || 'Erreur lors de la récupération des données.')}</p>`;
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
        marquerHistoriqueCommeLu();
    }
    appliquerFiltrageAcheteur();
}

function appliquerFiltrageAcheteur() {
    const lignesArticles = document.querySelectorAll('.article-ligne-achat');

    // 1. Filtrer chaque ligne d'article de façon autonome selon son statut
    lignesArticles.forEach(ligne => {
        const statutRaw = ligne.getAttribute('data-statut') || '';
        const estHistorique = estStatutHistorique(statutRaw);

        if (filtreActuel === 'en-cours') {
            ligne.style.display = estHistorique ? 'none' : 'flex';
        } else if (filtreActuel === 'historique') {
            ligne.style.display = estHistorique ? 'flex' : 'none';
        }
    });

    // 2. Masquer les blocs "Colis Vendeur" si tous leurs articles sont masqués
    document.querySelectorAll('.colis-vendeur-block').forEach(colisBlock => {
        const aDesArticlesVisibles = Array.from(colisBlock.querySelectorAll('.article-ligne-achat'))
            .some(l => l.style.display !== 'none');
        colisBlock.style.display = aDesArticlesVisibles ? 'block' : 'none';
    });

    // 3. Masquer la carte de commande globale si tous ses colis sont masqués
    document.querySelectorAll('.commande-card-wrapper').forEach(wrapper => {
        const aDesColisVisibles = Array.from(wrapper.querySelectorAll('.colis-vendeur-block'))
            .some(c => c.style.display !== 'none');
        wrapper.style.display = aDesColisVisibles ? 'block' : 'none';
    });
}

// =========================================================================
// 🛫 INTERACTION BACKEND (Annulation d'un article)
// =========================================================================
async function annulerArticleIndividuel(orderId, colisGroupId, itemId, produitId) {
    if (!confirm('⚠️ Êtes-vous sûr de vouloir annuler cet article ? Cette action est irréversible.')) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/orders/${orderId}/annuler-acheteur`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ colisGroupId, itemId, produitId })
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
        // Rechargement immédiat des données depuis la BD pour actualiser l'IHM
        chargerMesAchats();

    } catch (err) {
        console.error(err);
        alert('❌ ' + err.message);
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