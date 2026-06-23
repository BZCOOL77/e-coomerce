const Order = require('../models/Order');
const Thing = require('../models/Thing');
const User = require('../models/User'); // Import du modèle User pour récupérer les noms
const { genererCodeColisPro } = require('../utilitaire/generercodecolis'); // Importation de la fonction de génération d'ID de colis
const PDFDocument = require('pdfkit');// Importation de PDFKit pour la génération de factures PDF



// =========================================================================
// 1. CRÉER UNE COMMANDE (Gère 1 seul produit OU un panier groupé sans casser l'ancien code)
// =========================================================================
const createOrder = async (req, res, next) => {
    try {
        // Préparer la liste d'articles à traiter
        const articlesToProcess = (Array.isArray(req.body.articles) && req.body.articles.length)
            ? req.body.articles
            : (req.body.produitId ? [{ produitId: req.body.produitId, quantite: req.body.quantite || 1 }] : []);

        if (articlesToProcess.length === 0) {
            return res.status(400).json({ error: 'Aucun article à traiter.' });
        }

       

        
        const colisGroupId = genererCodeColisPro();// Génération d'un ID unique pour ce groupe de commandes

        const createdOrders = [];

        // Pour chaque article : décrémenter le stock de façon atomique, créer la commande
        for (const art of articlesToProcess) {
            const quantite = art.quantite && Number(art.quantite) > 0 ? Number(art.quantite) : 1;

            // Décrément atomique du stock si suffisant
            const produit = await Thing.findOneAndUpdate(
                { _id: art.produitId, stock: { $gte: quantite } },
                { $inc: { stock: -quantite } },
                { returnDocument: 'after' }
            );

            if (!produit) {
                // Si un produit manque ou pas assez de stock, on doit restaurer les stocks pour les commandes créées précédemment
                for (const prev of createdOrders) {
                    await Thing.findByIdAndUpdate(prev.produitId, { $inc: { stock: prev.quantite } });
                    await Order.findByIdAndDelete(prev._id);
                }
                return res.status(400).json({ error: `Produit introuvable ou stock insuffisant pour ${art.produitId}.` });
            }

            // 🛠️ LOGIQUE DE CALCUL DES PRIX CÔTÉ BACKEND (Sécurisé avec TVA 16%)
            const prixUnitaireTTC = produit.price || produit.prix || 0;
            const tauxTVA = 0.16; // 16%

            // 🧮 1. Les calculs de base basés sur la quantité
            const totalTTC = prixUnitaireTTC * quantite;
            const totalHT = totalTTC / (1 + tauxTVA);
            const montantTVA = totalTTC - totalHT;

            // 🧾 2. Extraction des valeurs unitaires pour la facture légale
            const prixUnitaireHT = prixUnitaireTTC / (1 + tauxTVA);

            // ==========================================
            // 📊 ZONE DE LOGS DE SÉCURITÉ FINANCIÈRE (Optionnel mais recommandé pour tes tests)
            // ==========================================
            console.log("\n=========================================");
            console.log("💰 CALCULS DE COMMANDE SÉCURISÉS (BACKEND)");
            console.log("=========================================");
            console.log(`📦 Produit ID     : ${produit._id}`);
            console.log(`🔢 Quantité       : ${quantite}`);
            console.log(`💵 Prix Unit. TTC : ${prixUnitaireTTC.toFixed(2)} €`);
            console.log(`📉 Prix Unit. HT  : ${prixUnitaireHT.toFixed(2)} €`);
            console.log("-----------------------------------------");
            console.log(`📉 TOTAL HT       : ${totalHT.toFixed(2)} €`);
            console.log(`🏦 MONTANT TVA    : ${montantTVA.toFixed(2)} €`);
            console.log(`🚀 TOTAL TTC      : ${totalTTC.toFixed(2)} €`);
            console.log("=========================================\n");


            // 💎 3. Construire les données de la commande parfaitement formatées
            const orderData = {
                produitId: produit._id,
                quantite: quantite,
                
                // --- Éléments de la facture légale ---
                prixUnitaire: prixUnitaireTTC,                         // Prix unitaire TTC affiché sur le site
                prixUnitaireHT: Number(prixUnitaireHT.toFixed(2)),     // Prix unitaire Hors Taxe
                totalHT: Number(totalHT.toFixed(2)),                   // Total Hors Taxe cumulé
                montantTVA: Number(montantTVA.toFixed(2)),             // Part de TVA perçue pour cette ligne
                totalTTC: Number(totalTTC.toFixed(2)),                 // Le montant final payé par le client
                
                acheteurId: req.auth.userId,
                vendeurId: produit.vendeurId || produit.userId,
                colisGroupId: colisGroupId,
                statut: 'en attente'
            };
           

            const newOrder = new Order(orderData);
            try {
                const saved = await newOrder.save();
                createdOrders.push({ _id: saved._id, produitId: saved.produitId, quantite: saved.quantite });
            } catch (err) {
                // En cas d'erreur de sauvegarde, restaurer le stock pour cet article
                await Thing.findByIdAndUpdate(produit._id, { $inc: { stock: quantite } });
                // Et restaurer précédents
                for (const prev of createdOrders) {
                    await Thing.findByIdAndUpdate(prev.produitId, { $inc: { stock: prev.quantite } });
                    await Order.findByIdAndDelete(prev._id);
                }
                console.error(err);
                return res.status(500).json({ error: 'Erreur lors de la création des commandes.' });
            }
        }

        return res.status(201).json({ message: 'Commande(s) enregistrée(s) avec succès.', colisGroupId, commandes: createdOrders });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Erreur lors de la validation de la commande.' });
    }
};


// =========================================================================
// 2. RÉCUPÉRER LES COMMANDES REGROUPÉES PAR COLIS (Action du vendeur)
// =========================================================================
const getVendeurOrders = async (req, res) => {
    try {
        // On récupère toutes les commandes destinées à ce vendeur connecté
        const orders = await Order.find({ vendeurId: req.auth.userId })
            .populate('produitId') // On récupère les infos du produit pour chaque commande
            .populate('acheteurId', 'nom email')// On récupère les infos de l'acheteur pour chaque commande
            .sort({ createdAt: -1 }); // Tri par date de création

        // 🧠 MAGIE DU REGROUPEMENT LOGISTIQUE : On rassemble les lignes par colisGroupId
        const colisRegroupes = {};

        orders.forEach(commande => {
            const idGroupe = commande.colisGroupId || "SANS-COLIS-" + commande._id;

            if (!colisRegroupes[idGroupe]) {
                colisRegroupes[idGroupe] = {
                    colisGroupId: idGroupe,
                    statutGlobal: '', // 🌟 On le laisse vide au départ pour éviter la confusion !
                    dateCommande: commande.createdAt,
                    acheteur: commande.acheteurId, // Infos de l'acheteur commun au colis
                    articles: []
                };
            }

            // On pousse la marchandise unique dans son carton virtuel
            colisRegroupes[idGroupe].articles.push({
                orderId: commande._id,
                produitInfo: commande.produitId,
                quantite: commande.quantite,
                prixUnitaire: commande.prixUnitaire || (commande.produitId ? commande.produitId.price : 0),
                statutIndividuel: commande.statut
            });
        });

        // 🧠 RECALCUL DU STATUT GLOBAL (Plus clair et ultra-sécurisé)
        Object.values(colisRegroupes).forEach(colis => {
            // On extrait tous les statuts des articles en minuscules
            const statuts = colis.articles.map(a => a.statutIndividuel.toLowerCase());

            // 1. Si TOUS les articles sont annulés (par le vendeur ou l'acheteur)
            if (statuts.every(s => s === 'annulée' || s === 'annulée par acheteur')) {
                colis.statutGlobal = 'annulée';
            }
            // 2. S'il reste au moins un article en attente
            else if (statuts.includes('en attente')) {
                colis.statutGlobal = 'en attente';
            }
            // 3. S'il n'y a plus d'attente mais qu'au moins un est en cours de préparation
            else if (statuts.includes('en cours')) {
                colis.statutGlobal = 'En cours';
            }
            // 4. Si tout le reste est expédié
            else if (statuts.includes('expédiée')) {
                colis.statutGlobal = 'expédiée';
            }
            // 5. Si toutes les conditions précédentes échouent, c'est que tout est livré !
            else {
                colis.statutGlobal = 'livrée';
            }
        });

        // On convertit notre dictionnaire en un beau tableau JSON pour le frontend
        return res.status(200).json(Object.values(colisRegroupes));

    } catch (error) {
        console.error(error);
        return res.status(400).json({ error: "Erreur lors de la récupération des colis vendeur." });
    }
};


// =========================================================================
// 3. ENTIER COLIS EN PRÉPARATION (Mise à jour en lot par le vendeur)
// =========================================================================
const updateColisStatut = async (req, res, next) => {
    try {
        const { colisGroupId } = req.params;
        const nouveauStatut = req.body.statut; // Ex: 'En cours', 'Expédiée', 'Livrée'
        const idUtilisateurConnecte = req.auth.userId; // La personne qui fait la requête

        
        const statutNorm = (nouveauStatut || '').toLowerCase();

        // 🛑 LE VERROU DE SÉCURITÉ ANTI-TRICHE
        if (statutNorm === 'livrée' || statutNorm === 'livree' || statutNorm === 'livré' || statutNorm === 'livre') {
            
            // On va chercher une commande de ce carton pour voir qui est l'acheteur
            const commandeTemoin = await Order.findOne({ colisGroupId: colisGroupId });
            
            if (!commandeTemoin) {
                return res.status(404).json({ error: "Aucun colis correspondant trouvé." });
            }

            console.log("📦 Commande témoin trouvée :", commandeTemoin);

            // On vérifie si l'ID de la personne connectée correspond à l'acheteur du carton
            if (commandeTemoin.acheteurId.toString() !== idUtilisateurConnecte.toString()) {
                return res.status(403).json({ 
                    error: "🛑 Sécurité : Seul le client qui a acheté ce colis peut confirmer sa réception !" 
                });
            }
        }

        // 🟢 FIN DE LA SÉCURITÉ : Si on arrive ici, soit ce n'est pas un statut "Livré" (c'est le vendeur qui expédie),
        // soit c'est bien l'acheteur qui a validé la réception. On peut mettre à jour !
        
        
        const result = await Order.updateMany(
            { colisGroupId: colisGroupId },
            { $set: { statut: nouveauStatut } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Aucun colis correspondant trouvé." });
        }

        res.status(200).json({ message: `Le colis complet est passé au statut : ${nouveauStatut} !` });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


// =========================================================================
// 4. ANCIENNE FONCTION DE STATUT UNIQUE (Gardée intacte pour tes boutons au cas par cas)
// =========================================================================
const updateStatut = async (req, res, next) => {
    try {
        const nouveauStatut = req.body.statut;
        const idUtilisateurConnecte = req.auth.userId; // La personne qui clique actuellement

        const statutNorm = (nouveauStatut || '').toLowerCase();

        // 🛑 LE VERROU DE SÉCURITÉ ANTI-TRICHE
        if (statutNorm === 'livrée' || statutNorm === 'livree' || statutNorm === 'livré' || statutNorm === 'livre') {
            
            // On va chercher LA commande en question pour vérifier l'identité de l'acheteur
            const commande = await Order.findOne({ _id: req.params.id });
            
            if (!commande) {
                return res.status(404).json({ error: "Commande introuvable." });
            }

            // On vérifie si l'ID de la personne connectée correspond à l'acheteur
            // ⚠️ Remplace 'userId' par le nom exact de ton champ acheteur dans ton modèle si besoin
            if (commande.acheteurId.toString() !== idUtilisateurConnecte.toString()) {
                return res.status(403).json({ 
                    error: "🛑 Sécurité : Seul le client qui a acheté cet article peut confirmer sa réception !" 
                });
            }
        }

        // 🟢 MISE À JOUR : Si la sécurité est OK (ou si ce n'est pas un statut "Livré")
        const result = await Order.updateOne(
            { _id: req.params.id }, 
            { statut: nouveauStatut }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Commande introuvable." });
        }

        res.status(200).json({ message: `Statut mis à jour : ${nouveauStatut} !` });

    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// =========================================================================
// 5. AFFICHAGE DES ACHATS CLIENT (Acheteur)
// =========================================================================
const getAcheteurOrders = (req, res, next) => {
    Order.find({ acheteurId: req.auth.userId })//fonction pour récupérer les commandes de l'acheteur connecté
        .populate('produitId') // On récupère les infos du produit pour chaque commande
        .populate('acheteurId', 'nom email')// On récupère les infos de l'acheteur pour chaque commande
        .sort({ createdAt: -1 }) // Tri natif via MongoDB Mongoose
        .then(orders => res.status(200).json(orders))
        .catch(error => res.status(400).json({ error }));
};


// =========================================================================
// 6. VENDEUR QUI ANNULE UNE COMMANDE UNIQUE
// =========================================================================
const annulerCommandeParVendeur = async (req, res, next) => {
    try {
        const commande = await Order.findOne({ _id: req.params.id });
        
        if (!commande) {
            return res.status(404).json({ error: "Commande introuvable !" });
        }

        const statutNettoye = (commande.statut || '').toLowerCase();
        if (statutNettoye === 'livrée' || statutNettoye === 'annulée' || statutNettoye === 'annulée par acheteur' || statutNettoye === 'expédiée') {
            return res.status(400).json({ error: "Impossible d'annuler une commande déjà clôturée." });
        }

        // 🌟 Mise à jour propre avec le statut explicite décidé (utilise 'annulée' conforme au schéma)
        commande.statut = 'annulée';
        await commande.save();

        // 📈 Restitution physique au stock
        const produit = await Thing.findOne({ _id: commande.produitId });
        if (produit) {
            const quantiteA_Restituer = commande.quantite || 1;
            produit.stock += quantiteA_Restituer; 
            await produit.save();
        }

        res.status(200).json({ message: "Commande annulée avec succès et stock restitué !" });

    } catch (error) {
        console.error("Erreur lors de l'annulation :", error);
        res.status(500).json({ error: "Erreur serveur lors de l'annulation." });
    }
};


// =========================================================================
// 7. ACHETEUR QUI ANNULE SA COMMANDE UNIQUE
// =========================================================================
const annulerCommandeParAcheteur = async (req, res, next) => {
    try {
        const commande = await Order.findOne({ _id: req.params.id });
        
        if (!commande) {
            return res.status(404).json({ error: "Commande introuvable !" });
        }

        if (commande.acheteurId.toString() !== req.auth.userId) {
            return res.status(403).json({ error: "Vous n'êtes pas autorisé à annuler cette commande." });
        }

        if (commande.statut.toLowerCase() !== 'en attente') {
            return res.status(400).json({ 
                error: "Impossible d'annuler cette commande. Le vendeur a déjà commencé à la traiter !" 
            });
        }

        // 🌟 Mise à jour propre avec le statut explicite décidé (conforme au schéma)
        commande.statut = 'annulée par acheteur';
        await commande.save();

        // 📈 Restitution physique au stock
        const produit = await Thing.findOne({ _id: commande.produitId });
        if (produit) {
            produit.stock += (commande.quantite || 1);
            await produit.save();
        }

        res.status(200).json({ message: "Votre commande a été annulée avec succès." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur serveur lors de l'annulation." });
    }
};


// =========================================================================
//IMPRIMER UNE FACTURE PDF POUR UN ACHETEUR (Optionnel mais pratique)
// =========================================================================
const downloadInvoice = async (req, res) => {
    try {
        // 1. Récupérer les articles associés à ce groupe de colis
        const orders = await Order.find({ colisGroupId: req.params.colisGroupId })
                                  .populate('produitId', 'title name nom'); 
        
        if (!orders || orders.length === 0) {
            // Ici le "return" est crucial pour ARRÊTER le code si rien n'est trouvé !
            return res.status(404).json({ error: "Facture introuvable pour ce colis." });
        }

        // 🛡️ BARRIÈRE DE SÉCURITÉ ANTI-INTRUSION
        const userIdConnecte = req.auth.userId; 
        const estAcheteur = orders[0].acheteurId === userIdConnecte;
        const estVendeur = orders[0].vendeurId === userIdConnecte;

        if (!estAcheteur && !estVendeur) {
            console.warn(`🚨 Tentative d'accès non autorisée au colis ${req.params.colisGroupId}`);
            return res.status(403).json({ error: "Accès refusé." });
        }

        // 🔍 2. ENQUÊTE BDD : Aller chercher les profils utilisateurs
        const [profilAcheteur, profilVendeur] = await Promise.all([
            User.findById(orders[0].acheteurId),
            User.findById(orders[0].vendeurId)
        ]);

        const nomAcheteur = profilAcheteur 
            ? `${profilAcheteur.prenom} ${profilAcheteur.nom}`.toUpperCase() 
            : `CLIENT (ID: #${orders[0].acheteurId.toString().substring(0, 6)}...)`;

        const nomVendeur = profilVendeur 
            ? `${profilVendeur.prenom} ${profilVendeur.nom}`.toUpperCase() 
            : `VENDEUR (ID: #${orders[0].vendeurId.toString().substring(0, 6)}...)`;

        // 3. Configurer les en-têtes HTTP (On le fait juste avant de créer le PDF)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Facture-${req.params.colisGroupId}.pdf`);

        // 4. Initialiser le document PDF
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        
        // 🚨 ATTENTION : On branche le tuyau ICI. 
        // À partir de cette ligne, INTERDICTION d'utiliser "res.json()" ou "res.send()" !
        doc.pipe(res);

        // --- EN-TÊTE DE LA FACTURE ---
        doc.fillColor('#1a365d').fontSize(24).text('SHOPYCLOTH', 50, 50, { bold: true });
        doc.fillColor('#718096').fontSize(10).text('Merci pour votre confiance !', 50, 80);
        
        doc.fillColor('#1a365d').fontSize(20).text('FACTURE', 400, 50, { align: 'right' });
        doc.fillColor('#2d3748').fontSize(10)
           .text(`N° Colis : #${req.params.colisGroupId}`, 400, 75, { align: 'right' })
           .text(`Date : ${new Date(orders[0].createdAt).toLocaleDateString('fr-FR')}`, 400, 90, { align: 'right' });

        doc.moveTo(50, 120).lineTo(550, 120).strokeColor('#e2e8f0').lineWidth(1).stroke();

        // 👥 --- BLOC DES COORDONNÉES ---
        let infoY = 140;
        doc.fillColor('#4a5568').fontSize(10, { bold: true }).text('DE (Vendeur) :', 50, infoY);
        doc.fillColor('#2d3748').fontSize(10, { bold: false })
           .text(nomVendeur, 50, infoY + 15)
           .text(`ID : #${orders[0].vendeurId.toString().substring(0, 10)}...`, 50, infoY + 30);

        doc.fillColor('#4a5568').fontSize(10, { bold: true }).text('À (Acheteur) :', 350, infoY);
        doc.fillColor('#2d3748').fontSize(10, { bold: false })
           .text(nomAcheteur, 350, infoY + 15)
           .text(`ID : #${orders[0].acheteurId.toString().substring(0, 10)}...`, 350, infoY + 30);

        doc.moveTo(50, 200).lineTo(550, 200).strokeColor('#e2e8f0').stroke();

        // --- CRÉATION DU TABLEAU DES ARTICLES ---
        let moveY = 220;

        doc.fillColor('#4a5568').fontSize(10, { bold: true });
        doc.text('Désignation de l\'article', 50, moveY); 
        doc.text('Qté', 300, moveY, { width: 30, align: 'center' });
        doc.text('Prix Unit. TTC', 350, moveY, { width: 90, align: 'right' });
        doc.text('Total TTC', 460, moveY, { width: 90, align: 'right' });

        doc.moveTo(50, moveY + 15).lineTo(550, moveY + 15).strokeColor('#edf2f7').stroke();
        moveY += 25;

        let cumulHT = 0;
        let cumulTVA = 0;
        let cumulTTC = 0;

        // Lignes du tableau
        doc.fillColor('#2d3748').fontSize(10);
        orders.forEach((item) => {
            const detailProduit = item.produitId;
            const nomDuProduit = detailProduit ? (detailProduit.title || detailProduit.name || detailProduit.nom) : `Article #${item._id.toString().substring(0,6)}`;

            doc.text(nomDuProduit.substring(0, 35), 50, moveY);
            doc.text(`${item.quantite}`, 300, moveY, { width: 30, align: 'center' });
            
            // 🚨 SÉCURITÉ EN PLUS : On s'assure que les chiffres sont bien des nombres avant le .toFixed()
            const prixU = item.prixUnitaire || 0;
            const tTTC = item.totalTTC || 0;

            doc.text(`${prixU.toFixed(2)} €`, 350, moveY, { width: 90, align: 'right' });
            doc.text(`${tTTC.toFixed(2)} €`, 460, moveY, { width: 90, align: 'right' });

            cumulHT += item.totalHT || 0;
            cumulTVA += item.montantTVA || 0;
            cumulTTC += tTTC;

            moveY += 20;
        });

        doc.moveTo(50, moveY).lineTo(550, moveY).strokeColor('#e2e8f0').stroke();
        moveY += 15;

        // --- BLOC DES TOTAUX COMPTABLES ---
        doc.text('Total Hors Taxes (HT) :', 320, moveY, { width: 130, align: 'right' });
        doc.text(`${cumulHT.toFixed(2)} €`, 460, moveY, { width: 90, align: 'right' });
        moveY += 15;

        doc.text('TVA (16%) :', 320, moveY, { width: 130, align: 'right' });
        doc.text(`${cumulTVA.toFixed(2)} €`, 460, moveY, { width: 90, align: 'right' });
        moveY += 20;

        doc.rect(310, moveY - 5, 240, 25).fill('#ebf8ff');
        doc.fillColor('#1a365d').fontSize(11, { bold: true });
        doc.text('Total à payer (TTC) :', 320, moveY, { width: 130, align: 'right' });
        doc.text(`${cumulTTC.toFixed(2)} €`, 460, moveY, { width: 90, align: 'right' });

        // --- PIED DE PAGE LÉGAL ---
        doc.fillColor('#a0aec0').fontSize(8)
           .text('ShopyCloth SAS — Capital de 10 000 € — TVA Intracommunautaire FR999999999', 50, 720, { align: 'center' })
           .text('Pour toute réclamation, contactez support@shopycloth.com', 50, 735, { align: 'center' });

        // 5. 🚨 APARTÉ FINAL : doc.end() doit TOUJOURS être le mot de la fin !
        doc.end();

    } catch (error) {
        console.error("Erreur génération PDF", error);
        // On envoie le JSON d'erreur uniquement si le PDF n'a pas commencé à piper
        if (!res.headersSent) {
            res.status(500).json({ error: "Erreur lors de la génération de la facture." });
        }
    }
};
// =========================================================================


// EXPORTS DES FONCTIONS POUR LES ROUTES
module.exports = {
    createOrder,
    getVendeurOrders,
    updateColisStatut, // 🌟 Nouveau pour la mise à jour par carton entier
    updateStatut,
    getAcheteurOrders,
    annulerCommandeParVendeur,
    annulerCommandeParAcheteur,
    downloadInvoice // 🌟 Nouveau pour le téléchargement de la facture PDF
    
};