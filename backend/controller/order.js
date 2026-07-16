const Order = require('../models/Order');
const Thing = require('../models/Thing');
const mongoose = require('mongoose');
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
        const userIdConnecte = req.auth.userId.toString(); 
        
        // 🎛️ EXTRACTEUR DE CONTEXTE : On récupère le rôle demandé dans l'URL (?role=vendeur)
        // Si rien n'est spécifié, on considère par défaut que c'est un client.
        const roleDemande = req.query.role === 'vendeur' ? 'vendeur' : 'client';

        // 🟢 1. RECHERCHE ET POPULATE DES LIENS
        const allOrders = await Order.find({ colisGroupId: req.params.colisGroupId })
                                     .populate('produitId', 'nom prix description')
                                     .populate('acheteurId', 'nom prenom email')
                                     .populate('vendeurId', 'nom prenom'); 
        
        if (!allOrders || allOrders.length === 0) {
            return res.status(404).json({ error: "Facture introuvable." });
        }

        // 🧙‍♂️ LE NETTOYEUR SÉCURISÉ (Extrait l'ID de 24 caractères du texte corrompu ou de l'objet)
        const extraireIdPur = (vendeurField) => {
            if (!vendeurField) return 'INCONNU';
            if (vendeurField._id) return vendeurField._id.toString();
            
            const rawString = vendeurField.toString();
            const match = rawString.match(/[0-9a-fA-F]{24}/);
            if (match) {
                return match[0];
            }
            return rawString.trim();
        };

        // 🛡️ ANALYSE SÉCURISÉE DES ACCÈS
        const estAcheteur = allOrders[0].acheteurId && allOrders[0].acheteurId._id?.toString() === userIdConnecte;
        
        const estUnDesVendeurs = allOrders.some(order => {
            return extraireIdPur(order.vendeurId) === userIdConnecte;
        });

        // Si l'utilisateur n'a rien à faire ici, on bloque direct !
        if (!estAcheteur && !estUnDesVendeurs) {
            console.warn(`🚨 Intrusion bloquée pour le colis ${req.params.colisGroupId}`);
            return res.status(403).json({ error: "Accès refusé. Vous n'avez aucun droit sur ce colis." });
        }

        // 🔮 FILTRAGE ULTRA-ÉTANCHE : Basé sur l'intention (roleDemande) !
        let ordersAFFICHEES = [];
        
        if (roleDemande === 'client' && estAcheteur) {
            // L'utilisateur demande l'interface client ET il est bien l'acheteur -> Il voit tout le panier global
            ordersAFFICHEES = allOrders; 
        } else {
            // L'utilisateur demande l'interface vendeur (ou il n'est pas l'acheteur de toute façon)
            // -> VERROU STRICT : On ne lui montre QUE ses propres articles, même s'il est aussi l'acheteur !
            ordersAFFICHEES = allOrders.filter(order => {
                return extraireIdPur(order.vendeurId) === userIdConnecte;
            });
        }

        // Sécurité finale : si après filtre un vendeur essaie de forcer l'accès sur un colis où il n'a rien vendu
        if (ordersAFFICHEES.length === 0) {
            return res.status(403).json({ error: "Aucun produit ne vous appartient dans cette facture." });
        }

        // 👥 2. FORMATTAGE DES COORDONNÉES DE L'ACHETEUR
        const client = ordersAFFICHEES[0].acheteurId;
        const nomAcheteur = client 
            ? `${client.prenom || ''} ${client.nom || ''}`.trim().toUpperCase() 
            : `CLIENT (ID: #${ordersAFFICHEES[0].acheteurId?.toString().substring(0, 6)}...)`;

        // 🔄 3. REGROUPEMENT PAR BLOC VENDEUR (Sur le tableau filtré ordersAFFICHEES !)
        const groupeParVendeur = {};
        
        for (const item of ordersAFFICHEES) {
            const vId = extraireIdPur(item.vendeurId);

            if (!groupeParVendeur[vId]) {
                let nomV = `BOUTIQUE (ID: #${vId.substring(0,6)})`;
                
                if (item.vendeurId && item.vendeurId.nom) {
                    nomV = `${item.vendeurId.prenom || ''} ${item.vendeurId.nom || ''}`.trim().toUpperCase();
                } else if (vId.length === 24) {
                    try {
                        const MongooseUser = mongoose.model('User');
                        const demerdaProfil = await MongooseUser.findById(vId);
                        if (demerdaProfil) {
                            nomV = `${demerdaProfil.prenom || ''} ${demerdaProfil.nom || ''}`.trim().toUpperCase();
                        }
                    } catch (e) {
                        // Plan de secours silencieux
                    }
                }
                
                groupeParVendeur[vId] = { nom: nomV, articles: [] };
            }
            groupeParVendeur[vId].articles.push(item);
        }

        // 4. PRÉPARATION DES EN-TÊTES DE TÉLÉCHARGEMENT PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Facture-${req.params.colisGroupId}.pdf`);

        // 5. INITIALISATION DU DOCUMENT PDFKIT
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.pipe(res);

        // --- DESIGN : EN-TÊTE DE LA FACTURE ---
        doc.fillColor('#1a365d').fontSize(24).text('SHOPYCLOTH', 50, 50, { bold: true });
        doc.fillColor('#718096').fontSize(10).text('Plateforme de Marketplace sécurisée', 50, 80);
        
        doc.fillColor('#1a365d').fontSize(20).text('FACTURE', 400, 50, { align: 'right' });
        doc.fillColor('#2d3748').fontSize(10)
           .text(`N° Colis : #${req.params.colisGroupId}`, 400, 75, { align: 'right' })
           .text(`Date : ${new Date(ordersAFFICHEES[0].createdAt).toLocaleDateString('fr-FR')}`, 400, 90, { align: 'right' });

        doc.moveTo(50, 120).lineTo(550, 120).strokeColor('#e2e8f0').lineWidth(1).stroke();

        // --- DESIGN : BLOC DESTINATAIRE ---
        let infoY = 140;
        doc.fillColor('#4a5568').fontSize(10, { bold: true }).text('FACTURÉ À (Acheteur) :', 50, infoY);
        doc.fillColor('#2d3748').fontSize(10, { bold: false })
           .text(nomAcheteur, 50, infoY + 15)
           .text(`Email : ${client?.email || 'Non renseigné'}`, 50, infoY + 30);

        doc.moveTo(50, 195).lineTo(550, 195).strokeColor('#e2e8f0').stroke();

        // --- DESIGN : TABLEAU SÉCTORISÉ ---
        let moveY = 215;
        let cumulHT = 0, cumulTVA = 0, cumulTTC = 0;

        Object.keys(groupeParVendeur).forEach((vendeurId) => {
            const vendeurEnCours = groupeParVendeur[vendeurId];

            doc.rect(50, moveY, 500, 18).fill('#f8fafc');
            doc.fillColor('#4a5568').fontSize(9, { bold: true }).text(`VENDEUR : ${vendeurEnCours.nom}`, 55, moveY + 4);
            moveY += 25;

            doc.fillColor('#718096').fontSize(8, { bold: true });
            doc.text('Désignation de l\'article', 50, moveY); 
            doc.text('Qté', 300, moveY, { width: 30, align: 'center' });
            doc.text('Prix U. TTC', 350, moveY, { width: 90, align: 'right' });
            doc.text('Total TTC', 460, moveY, { width: 90, align: 'right' });
            
            doc.moveTo(50, moveY + 11).lineTo(550, moveY + 11).strokeColor('#edf2f7').lineWidth(0.5).stroke();
            moveY += 18;

            doc.fillColor('#2d3748').fontSize(9, { bold: false });
            vendeurEnCours.articles.forEach((item) => {
                const nomDuProduit = item.produitId ? (item.produitId.nom || item.produitId.title) : `Article #${item._id.toString().substring(0,6)}`;

                doc.text(nomDuProduit.substring(0, 38), 50, moveY);
                doc.text(`${item.quantite}`, 300, moveY, { width: 30, align: 'center' });
                
                const prixU = item.prixUnitaire || 0;
                const tTTC = item.totalTTC || 0;

                doc.text(`${prixU.toFixed(2)} €`, 350, moveY, { width: 90, align: 'right' });
                doc.text(`${tTTC.toFixed(2)} €`, 460, moveY, { width: 90, align: 'right' });

                cumulHT += item.totalHT || 0;
                cumulTVA += item.montantTVA || 0;
                cumulTTC += tTTC;

                moveY += 18;
            });

            moveY += 10; 
        });

        doc.moveTo(50, moveY).lineTo(550, moveY).strokeColor('#e2e8f0').lineWidth(1).stroke();
        moveY += 15;

        // --- DESIGN : ACCUMULATIONS COMPTABLES ---
        doc.fillColor('#4a5568').fontSize(10, { bold: false });
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

        doc.fillColor('#a0aec0').fontSize(8)
           .text('ShopyCloth SA -- TVA Intracommunautaire FR999999999', 50, 720, { align: 'center' })
           .text('Document généré électroniquement — Pour toute réclamation, contactez support@shopycloth.com', 50, 735, { align: 'center' });

        doc.end();

    } catch (error) {
        console.error("Erreur génération PDF multi-vendeurs", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Erreur lors de la génération de la facture." });
        }
    }
};



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