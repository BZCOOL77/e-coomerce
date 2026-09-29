const Order = require('../models/Order');
const Thing = require('../models/Thing');
const mongoose = require('mongoose');
const User = require('../models/user'); // Import du modèle User pour récupérer les noms
const Expedition = require('../models/expedition'); // Import du modèle d'expédition pour suivre le workflow livraison
const { genererCodeColisPro } = require('../utilitaire/generercodecolis'); // Importation de la fonction de génération d'ID de colis
const PDFDocument = require('pdfkit');// Importation de PDFKit pour la génération de factures PDF

// =============================================================
// ARCHITECTURE DU FICHIER
// =============================================================
// Ce contrôleur est le cœur de la logique de commande du marketplace.
// Il gère plusieurs cas importants :
// 1) Créer une commande globale pour un acheteur
// 2) Séparer les produits par vendeur dans la structure vendorsOrders
// 3) Suivre les colis logistiques pour chaque vendeur avec Expedition
// 4) Faire évoluer le statut du colis selon le rôle (vendeur ou livreur)
// 5) Afficher les commandes côté acheteur/vendeur
// 6) Générer une facture PDF personnalisée
//
// IMPORTANT :
// - Order = commande parent du client (facture globale + achat global)
// - vendorsOrders = sous-commandes, une par vendeur
// - colisGroupId = identifiant unique d’un colis pour un vendeur donné
// - Expedition = document de suivi logistique pour ce colis d’un vendeur
//
// Donc, une commande client peut contenir plusieurs vendeurs, et chaque vendeur
// a son propre colis, son propre statut et son propre livreur.

// =========================================================================
// FONCTIONS UTILES POUR LA SYNCHRONISATION AVEC LE MODÈLE EXPEDITION
// =========================================================================

// -------------------------------------------------------------------------
// FONCTION : normaliserStatutExpedition
// -------------------------------------------------------------------------
// But : convertir les statuts envoyés par le front ou le formulaire en
// un format unique et fiable pour le modèle Expedition.
//
// Pourquoi c’est utile ?
// Parce que le frontend peut envoyer des variantes comme :
// - "prise en charge"
// - "prise-en-charge"
// - "priseencharge"
// - "attribuéeAlivreur"
// - "echec de livraison"
//
// Sans cette normalisation, on aurait des doublons, des erreurs de comparaison,
// et des données incohérentes en base.
const normaliserStatutExpedition = (statut) => {
    const statutNettoye = (statut || '').toString().toLowerCase().trim();

    if (['prise en charge', 'prise-en-charge', 'priseencharge'].includes(statutNettoye)) {
        return 'prise en charge';
    }

    if (['attribuéealivreur', 'attribueealivreur', 'attribuee a livreur', 'attribuee alivreur', 'attribuee au livreur', 'attribuée au livreur', 'attribuée a livreur'].includes(statutNettoye)) {
        return 'attribuéeAlivreur';
    }

    if (['livrée', 'livree', 'livré', 'livre'].includes(statutNettoye)) {
        return 'livrée';
    }

    if (['echec de livraison', 'échec de livraison', 'echecdelivraison', 'échecdelivraison'].includes(statutNettoye)) {
        return 'échec de livraison';
    }

    return null;
};

// Normalise les statuts côté backend pour les comparer proprement,
// même avec des accents, des majuscules ou des tirets.
const normaliserStatutWorkflow = (statut) => {
    return (statut || '')
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ');
};

// Définit une priorité métier pour chaque statut afin de calculer
// un statut global du colis sans sauter les étapes intermédiaires.
const prioriteStatutGlobal = (statut) => {
    const statutNorm = normaliserStatutWorkflow(statut);

    if (!statutNorm) return 0;
    if (['annulee', 'annulee par acheteur', 'annulee par l acheteur'].includes(statutNorm)) return 0;
    if (statutNorm === 'en attente') return 1;
    if (statutNorm === 'en cours') return 2;
    if (statutNorm === 'expediee') return 3;
    if (['attribuee alivreur', 'attribuee a livreur', 'attribuee au livreur', 'attribueealivreur'].includes(statutNorm)) return 4;
    if (['prise en charge', 'prise encharge', 'priseencharge'].includes(statutNorm)) return 5;
    if (['livree', 'livreee', 'livre'].includes(statutNorm)) return 6;
    if (statutNorm === 'recue') return 7;
    if (['echec de livraison', 'echec livraison', 'echec de livraisons', 'echec_de_livraison'].includes(statutNorm)) return 8;

    return 2;
};

// Calcule le statut global d’un colis à partir des statuts de ses articles.
// Cela permet d’afficher correctement les étapes : en attente → en cours → expédiée → attribuéeAlivreur → prise en charge → livrée.
const calculerStatutGlobalDepuisArticles = (articles = []) => {
    if (!Array.isArray(articles) || articles.length === 0) {
        return 'en attente';// Si aucun article, on considère le colis comme "en attente" par défaut.
    }

    const statuts = articles.map(article => article?.statutIndividuel || article?.statut || 'en attente');
    const statutsAnnulesParAcheteur = statuts.every(statut => {
        const statutNorm = normaliserStatutWorkflow(statut);
        return ['annulee par acheteur', 'annulee par l acheteur'].includes(statutNorm);
    });

    if (statutsAnnulesParAcheteur) {
        return 'annulée par acheteur';
    }

    const statutsAnnules = statuts.every(statut => {
        const statutNorm = normaliserStatutWorkflow(statut);
        return ['annulee', 'annulee par acheteur', 'annulee par l acheteur'].includes(statutNorm);
    });

    if (statutsAnnules) {
        return 'annulée';
    }

    // On calcule la priorité maximale parmi les statuts des articles pour déterminer le statut global du colis.

    const priorites = statuts.map(prioriteStatutGlobal);// On récupère la priorité de chaque statut individuel pour déterminer le statut global du colis.
    const prioriteMax = Math.max(...priorites);// On prend la priorité maximale pour déterminer le statut global du colis.

    switch (prioriteMax) {
        case 8:
            return 'echec de livraison';
        case 7:
            return 'reçue';//statut supprimer 
        case 6:
            return 'livrée';
        case 5:
            return 'prise en charge';
        case 4:
            return 'attribuéeAlivreur';
        case 3:
            return 'expédiée';
        case 2:
            return 'En cours';
        case 1:
        default:
            return 'en attente';
    }
};

// -------------------------------------------------------------------------
// FONCTION : recupererSousCommandesDuColis
// -------------------------------------------------------------------------
// But : retrouver la bonne sous-commande liée à un colisGroupId.
//
// Exemple de logique métier :
// - L’acheteur a une commande parent globale
// - Sous cette commande, il peut y avoir plusieurs vendeurs
// - Chaque vendeur a son propre colisGroupId
// - Si le livreur demande le colis X, on doit retrouver :
//     * l’Order parent
//     * la sous-commande correspondant à ce colis
//     * les produits de cette sous-commande seulement
//
// Cette fonction gère aussi le mode legacy (ancienne architecture) pour ne pas
// casser les anciennes commandes déjà enregistrées en base.
const recupererSousCommandesDuColis = async (colisGroupId, queryOptions = {}) => {
    if (!colisGroupId) return [];

    const orders = await Order.find({ 'vendorsOrders.colisGroupId': colisGroupId }, null, queryOptions).lean();

    const result = [];

    for (const order of orders) {
        const sousCommande = (order.vendorsOrders || []).find(sub => sub.colisGroupId === colisGroupId);
        if (!sousCommande) continue;

        result.push({
            _id: order._id,
            parentId: order._id,
            sousCommandeId: sousCommande._id,
            produitId: sousCommande.items?.[0]?.produitId || null,
            quantite: (sousCommande.items || []).reduce((total, item) => total + (Number(item.quantite) || 0), 0),
            vendeurId: sousCommande.vendeurId || order.vendeurId,
            acheteurId: order.acheteurId,
            adresseLivraison: order.adresseLivraison || null,
            createdAt: order.createdAt,
            statut: sousCommande.statutVendeur || order.statut,
            livreurAssignationId: sousCommande.livreurAssignationId || order.livreurAssignationId,
            codeOtp: sousCommande.codeOtp || order.codeOtp,
            items: sousCommande.items || [],
            parentOrder: order
        });
    }

    if (result.length === 0) {
        const legacyOrders = await Order.find({ colisGroupId }).sort({ createdAt: 1 }).lean(queryOptions);
        for (const order of legacyOrders) {
            result.push({
                _id: order._id,
                parentId: order._id,
                produitId: order.produitId,
                quantite: order.quantite || 1,
                vendeurId: order.vendeurId,
                acheteurId: order.acheteurId,
                adresseLivraison: order.adresseLivraison || null,
                createdAt: order.createdAt,
                statut: order.statut,
                livreurAssignationId: order.livreurAssignationId,
                codeOtp: order.codeOtp,
                items: order.items || [],
                parentOrder: order
            });
        }
    }

    return result;
};

// -------------------------------------------------------------------------
// FONCTION : synchroniserExpeditionDepuisColis
// -------------------------------------------------------------------------
// But : mettre à jour le document Expedition avec les informations de suivi.
//
// C’est la fonction qui relie le monde "commande" et le monde "livraison".
// Quand un vendeur ou un livreur change le statut, on met à jour :
// - le statut du colis dans la sous-commande
// - le document Expedition associé
// - la date de prise en charge ou de livraison
// - la note livreur si elle existe
//
// Donc, on peut résumer le rôle de cette fonction comme :
// "Je prends un colis, je le relie à sa sous-commande, puis j’alimente le suivi de livraison."
const synchroniserExpeditionDepuisColis = async ({ colisGroupId, statutCommande, livreurId = null, notesLivreur = null, session = null }) => {
    try {
        if (!colisGroupId) {
            return null;
        }

        const queryOptions = session ? { session } : {};//ici On prépare les options de requête pour inclure la session si elle est fournie, afin de garantir que toutes les opérations MongoDB se déroulent dans le même contexte transactionnel.

        // 1. Récupérer toutes les commandes du groupe de colis pour reconstruire l'expédition.
        const commandes = await recupererSousCommandesDuColis(colisGroupId, queryOptions);// On prend en charge à la fois la structure legacy et la nouvelle architecture parent/order.

        if (!commandes.length) {
            return null;
        }

        const commandeReference = commandes[0].parentOrder || commandes[0];// On prend la première commande comme référence pour les informations globales du colis (vendeur, client, adresse, etc.).
        const vendeurReference = commandes[0].vendeurId || (commandeReference.vendorsOrders || []).find(sub => sub.colisGroupId === colisGroupId)?.vendeurId || commandeReference.vendeurId;
        const statutExpedition = normaliserStatutExpedition(statutCommande) || 'prise en charge';

        // 2. Construire les produits à enregistrer dans le modèle Expedition.
        const produitsExpedition = (commandes[0].items && commandes[0].items.length > 0)
            ? commandes[0].items.map(item => ({
                produit: item.produitId,
                quantite: item.quantite || 1
            }))
            : commandes.map(commande => ({
                produit: commande.produitId,
                quantite: commande.quantite || 1
            }));

        // 3. Préparer les champs dynamiques à mettre à jour ($set).
        // On écrit d'abord le statut, puis la note livreur dans le même payload
        // pour rendre l'ordre de création plus stable dans MongoDB Compass.
        const updatePayload = {
            statut: statutExpedition
        };

        // On n'ajoute la note livreur que si elle existe vraiment.
        if (notesLivreur && notesLivreur.toString().trim() !== '') {
            updatePayload.notesLivreur = notesLivreur;
        }

        // On ne met à jour le livreur que s'il est renseigné.
        if (livreurId) {
            updatePayload.livreur = livreurId;
        }

        // 4. Créer ou mettre à jour le document Expedition.
        const expedition = await Expedition.findOneAndUpdate(
            { colisGroupId },
            {
                // Ces champs ne sont appliqués QUE lors de la CRÉATION du document
                $setOnInsert: {
                    colisGroupId,
                    commandeId: commandeReference._id,
                    sousCommandeId: commandes[0].sousCommandeId || null,
                    vendeur: vendeurReference,
                    client: commandeReference.acheteurId,
                    adresseLivraison: commandeReference.adresseLivraison || null,
                    produits: produitsExpedition,
                    horodatage: {
                        datePreparation: commandeReference.createdAt || new Date(),
                        datePriseEnCharge: null,
                        dateLivraison: null
                    }
                },
                // Seuls les champs évolutifs sont dans le $set.
                // L'ordre des clés ici est conservé autant que possible par l'opération MongoDB.
                $set: updatePayload
            },
            {
                upsert: true,
                returnDocument: 'after', // Remplacement moderne de new: true
                setDefaultsOnInsert: true,
                ...queryOptions
            }
        );

        // 5. Mettre à jour les horodatages spécifiques au workflow.
        const updateHorodatage = {};

        if (statutExpedition === 'prise en charge' && !expedition?.horodatage?.datePriseEnCharge) {
            updateHorodatage['horodatage.datePriseEnCharge'] = new Date();
        }

        if (statutExpedition === 'livrée' && !expedition?.horodatage?.dateLivraison) {
            updateHorodatage['horodatage.dateLivraison'] = new Date();
        }

        if (Object.keys(updateHorodatage).length > 0) {
            await Expedition.updateOne({ _id: expedition._id }, { $set: updateHorodatage }, queryOptions);
        }

        return expedition;
    } catch (error) {
        console.error('Erreur lors de la synchronisation de l\'expédition :', error);
        throw error;
    }
};

// =========================================================================
// 1. CRÉER UNE COMMANDE
// =========================================================================
// Ce bloc est le plus important pour la création d’une commande marketplace.
// Il fait 3 choses :
// 1) reçoit les produits du client
// 2) regroupe les produits par vendeur
// 3) crée une Order parent avec plusieurs sous-commandes dans vendorsOrders
//
// Exemple de logique :
// - le client achète 2 produits : un produit du vendeur A et un produit du vendeur B
// - on crée donc 2 sous-commandes distinctes
// - la commande globale contient les totaux globaux
// - chaque sous-commande contient ses produits, son total, son statut, son colis
//
// Ce système est nécessaire car un market-place n’est pas une commande simple
// d’un seul vendeur. Ici, on sépare les responsabilités pour éviter les bugs.
const createOrder = async (req, res, next) => {
    try {
        // 1) On récupère les produits envoyés par le front.
        // Le backend accepte deux formats :
        // - un tableau d’articles : req.body.articles
        // - ou un seul produit unique : req.body.produitId + req.body.quantite
        // Cela permet de garder la compatibilité avec les anciens appels front.
        const articlesToProcess = (Array.isArray(req.body.articles) && req.body.articles.length)
            ? req.body.articles
            : (req.body.produitId ? [{ produitId: req.body.produitId, quantite: req.body.quantite || 1 }] : []);

        if (articlesToProcess.length === 0) {
            return res.status(400).json({ error: 'Aucun article à traiter.' });
        }

        // 2) Vérification des informations de livraison obligatoire.
        // Sans commune, quartier, avenue ou téléphone, on refuse l’ordre.
        // C’est une sécurité métier : on ne veut pas enregistrer une commande sans adresse valide.
        const adresseLivraison = req.body.adresseLivraison;
        const champsObligatoires = ['commune', 'quartier', 'avenue', 'telephone'];
        const champsManquants = champsObligatoires.filter(champ => !adresseLivraison || !adresseLivraison[champ]);

        if (champsManquants.length > 0) {
            return res.status(400).json({
                error: `Champ(s) obligatoire(s) manquant(s) : ${champsManquants.join(', ')}`,
                champsManquants
            });
        }

        // 3) Regroupement par vendeur.
        // On crée une Map() pour faire un tri :
        // - clé : id du vendeur
        // - valeur : groupe contenant ses produits, son total, son colisGroupId
        //
        // Pourquoi c’est important ?
        // Parce qu’un client peut acheter plusieurs produits de vendeurs différents.
        // La commande globale doit rester unique, mais chaque vendeur doit avoir son propre colis.
        const groupesParVendeur = new Map();
        const normaliserIdVendeur = (vendeurId) => {
            if (vendeurId === undefined || vendeurId === null || vendeurId === '') {
                return 'sans-vendeur';
            }
            return typeof vendeurId === 'string' ? vendeurId : vendeurId.toString();
        };

        const getOrCreateGroupeVendeur = (vendeurId) => {
            const key = normaliserIdVendeur(vendeurId);
            if (!groupesParVendeur.has(key)) {
                groupesParVendeur.set(key, {
                    vendeurId: vendeurId || null,
                    colisGroupId: genererCodeColisPro(),
                    items: [],// Liste des articles pour ce vendeur les accollasde signifie que c'est un tableau vide pour stocker les articles de ce vendeur.
                    sousTotalHT: 0,
                    sousTotalTVA: 0,
                    sousTotalTTC: 0,
                    statutVendeur: 'en attente',
                    livreurAssignationId: null,
                    codeOtp: null
                });
            }
            return groupesParVendeur.get(key);
        };

        // 4) Totaux globaux de la commande parent.
        // Ces variables représentent le montant total de l’achat de l’acheteur,
        // indépendamment de la répartition par vendeur.
        let totalHTGlobal = 0;
        let totalTVAGlobal = 0;
        let totalTTCGlobal = 0;

        // 5) Pour chaque article, on vérifie le stock puis on le place dans le bon groupe vendeur.
        for (const art of articlesToProcess) {
            const quantite = art.quantite && Number(art.quantite) > 0 ? Number(art.quantite) : 1;

            const produit = await Thing.findOneAndUpdate(
                { _id: art.produitId, stock: { $gte: quantite } },
                { $inc: { stock: -quantite } },
                { returnDocument: 'after' }
            );

            if (!produit) {
                for (const [vendorKey, groupe] of groupesParVendeur.entries()) {
                    for (const item of groupe.items) {
                        await Thing.findByIdAndUpdate(item.produitId, { $inc: { stock: item.quantite } });
                    }
                }
                return res.status(400).json({ error: `Produit introuvable ou stock insuffisant pour ${art.produitId}.` });
            }

            const vendeurId = produit.vendeurId || produit.userId;
            const groupeVendeur = getOrCreateGroupeVendeur(vendeurId);
            const prixUnitaireTTC = produit.price || produit.prix || 0;
            const tauxTVA = 0.16;
            const totalTTC = prixUnitaireTTC * quantite;
            const totalHT = totalTTC / (1 + tauxTVA);
            const montantTVA = totalTTC - totalHT;
            const prixUnitaireHT = prixUnitaireTTC / (1 + tauxTVA);

            const itemCommande = {
                produitId: produit._id,
                quantite,
                prixUnitaire: prixUnitaireTTC,
                prixUnitaireHT: Number(prixUnitaireHT.toFixed(2)),
                totalHT: Number(totalHT.toFixed(2)),
                montantTVA: Number(montantTVA.toFixed(2)),
                totalTTC: Number(totalTTC.toFixed(2))
            };

            groupeVendeur.items.push(itemCommande);
            groupeVendeur.sousTotalHT += itemCommande.totalHT;
            groupeVendeur.sousTotalTVA += itemCommande.montantTVA;
            groupeVendeur.sousTotalTTC += itemCommande.totalTTC;

            totalHTGlobal += itemCommande.totalHT;
            totalTVAGlobal += itemCommande.montantTVA;
            totalTTCGlobal += itemCommande.totalTTC;
        }

        // 6) Création de la commande parent.
        // On ne met qu’une seule commande globale pour l’acheteur,
        // mais on stocke dans vendorsOrders autant de sous-commandes qu’il y a de vendeurs.
        //
        // Cela donne un schéma cohérent :
        // Commande parent = facture globale + achat global
        // vendorsOrders = détail fournisseur par fournisseur
        const parentOrder = new Order({
            idempotencyKey: req.headers.idempotencyKey || `CMD-${Date.now()}-${req.auth.userId}`,
            acheteurId: req.auth.userId,
            vendorsOrders: Array.from(groupesParVendeur.values()).map(groupe => ({
                vendeurId: groupe.vendeurId,
                colisGroupId: groupe.colisGroupId,
                items: groupe.items,
                statutVendeur: 'en attente',
                livreurAssignationId: null,
                codeOtp: null,
                subTotalHT: Number(groupe.sousTotalHT.toFixed(2)),
                subTotalTVA: Number(groupe.sousTotalTVA.toFixed(2)),
                subTotalTTC: Number(groupe.sousTotalTTC.toFixed(2))
            })),
            statutGlobal: 'en attente',
            totalHTGlobal: Number(totalHTGlobal.toFixed(2)),
            totalTVAGlobal: Number(totalTVAGlobal.toFixed(2)),
            totalTTCGlobal: Number(totalTTCGlobal.toFixed(2)),
            adresseLivraison: {
                commune: adresseLivraison.commune,
                quartier: adresseLivraison.quartier,
                avenue: adresseLivraison.avenue,
                reference: adresseLivraison.reference || '',
                numeroParcelle: adresseLivraison.numeroParcelle || '',
                telephone: adresseLivraison.telephone,
                latitude: adresseLivraison.latitude || null,
                longitude: adresseLivraison.longitude || null
            },
            colisGroupIds: Array.from(groupesParVendeur.values()).map(groupe => groupe.colisGroupId)
        });

        const savedOrder = await parentOrder.save();

        // 7) Après la création de la commande parent, on synchronise les colis de chaque vendeur
        // pour créer ou mettre à jour le document Expedition.
        const groupesColis = savedOrder.colisGroupIds || [];
        for (const groupeColis of groupesColis) {
            await synchroniserExpeditionDepuisColis({
                colisGroupId: groupeColis,
                statutCommande: 'prise en charge'
            });
        }

        return res.status(201).json({
            message: 'Commande enregistrée avec succès.',
            order: savedOrder,
            colisGroupId: groupesColis.length === 1 ? groupesColis[0] : groupesColis,
            colisGroupIds: groupesColis
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Erreur lors de la validation de la commande.' });
    }
};


// =========================================================================
// 2. RÉCUPÉRER LES COMMANDES REGROUPÉES PAR COLIS (Action du vendeur)
// =========================================================================
// Ce bloc sert au vendeur connecté.
// Il va chercher uniquement les sous-commandes qui lui appartiennent,
// puis les regroupe par colisGroupId pour que le vendeur voie un colis cohérent.
//
// Exemple : un vendeur A a 3 produits dans 2 colis différents.
// Cette fonction renverra seulement ces 2 colis, pas ceux des autres vendeurs.
const getVendeurOrders = async (req, res) => {
    try {
        const orders = await Order.find({ 'vendorsOrders.vendeurId': req.auth.userId })
            .populate('acheteurId', 'nom email prenom')
            .sort({ createdAt: -1 });

        const colisRegroupes = {};

        for (const parentOrder of orders) {
            const sousCommandesVendeur = (parentOrder.vendorsOrders || []).filter(sub => sub.vendeurId && sub.vendeurId.toString() === req.auth.userId.toString());

            for (const sousCommande of sousCommandesVendeur) {
                const idGroupe = sousCommande.colisGroupId || `SANS-COLIS-${parentOrder._id}`;

                if (!colisRegroupes[idGroupe]) {
                    colisRegroupes[idGroupe] = {
                        colisGroupId: idGroupe,
                        statutGlobal: '',
                        dateCommande: parentOrder.createdAt,
                        acheteur: parentOrder.acheteurId,
                        articles: []
                    };
                }

                for (const item of sousCommande.items || []) {
                    colisRegroupes[idGroupe].articles.push({
                        orderId: parentOrder._id,
                        produitInfo: item.produitId,
                        quantite: item.quantite,
                        prixUnitaire: item.prixUnitaire,
                        statutIndividuel: item.statut || sousCommande.statutVendeur,
                        totalTTC: item.totalTTC,
                        totalHT: item.totalHT,
                        montantTVA: item.montantTVA
                    });
                }
            }
        }

        Object.values(colisRegroupes).forEach(colis => {
            colis.statutGlobal = calculerStatutGlobalDepuisArticles(colis.articles);
        });

        return res.status(200).json(Object.values(colisRegroupes));

    } catch (error) {
        console.error(error);
        return res.status(400).json({ error: "Erreur lors de la récupération des colis vendeur." });
    }
};


// =========================================================================
// 3. METTRE À JOUR LE STATUT D’UN COLIS
// =========================================================================
// Cette fonction est cruciale pour le workflow logistique.
// Elle vérifie :
// - qui est connecté
// - quel est son rôle (vendeur, livreur, admin)
// - si l’action est autorisée
// - si le colis existe
// - si le livreur est bien assigné au bon colis
// - si le code OTP est valide pour la livraison
//
// C’est une zone sensible, donc on protège l’accès avec des conditions strictes.
const updateColisStatut = async (req, res, next) => {
    const session = await mongoose.startSession();

    try {
        const { colisGroupId } = req.params;
        const nouveauStatut = req.body.statut;
        const idUtilisateurConnecte = req.auth.userId;
        const roleUtilisateur = req.auth?.role;

        const statutNorm = (nouveauStatut || '').toLowerCase().trim();
        const estLivreur = roleUtilisateur === 'livreur' || roleUtilisateur === 'admin';
        const idUtilisateurConnecteString = idUtilisateurConnecte?.toString();
        const notesLivreur = (req.body?.notesLivreur || '').toString().trim();

        if (statutNorm === 'en cours' || statutNorm === 'encours' || statutNorm === 'en-cours') {
            if (roleUtilisateur !== 'vendeur') {
                return res.status(403).json({ error: "🛑 Sécurité : Seul le vendeur du colis peut le passer au statut 'en cours'." });
            }
        }

        if (statutNorm === 'expediee' || statutNorm === 'expédiée' || statutNorm === 'expedie') {
            if (roleUtilisateur !== 'vendeur') {
                return res.status(403).json({ error: "🛑 Sécurité : Seul le vendeur du colis peut le passer au statut 'expédiée'." });
            }
        }

        if (statutNorm === 'prise en charge' || statutNorm === 'prise-en-charge' || statutNorm === 'priseencharge') {
            if (!estLivreur) {
                return res.status(403).json({ error: "🛑 Sécurité : Seul un livreur peut passer un colis au statut 'prise en charge'." });
            }
        }

        if (statutNorm === 'echec de livraison' || statutNorm === 'échec de livraison' || statutNorm === 'echecdelivraison' || statutNorm === 'échecdelivraison') {
            if (!estLivreur) {
                return res.status(403).json({ error: "🛑 Sécurité : Seul un livreur peut passer un colis au statut 'échec de livraison'." });
            }
        }

        session.startTransaction();

        const parentOrder = await Order.findOne({ 'vendorsOrders.colisGroupId': colisGroupId }).session(session);
        if (!parentOrder) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ error: "Aucun colis correspondant trouvé." });
        }

        const sousCommande = (parentOrder.vendorsOrders || []).find(sub => sub.colisGroupId === colisGroupId);
        if (!sousCommande) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ error: "Sous-commande introuvable pour ce colis." });
        }

        const expedition = await Expedition.findOne({ colisGroupId }).session(session);
        const statutPriseEnCharge = statutNorm === 'prise en charge' || statutNorm === 'prise-en-charge' || statutNorm === 'priseencharge';
        const estPassageALivree = ['livree', 'livreee', 'livre', 'livrée'].includes(statutNorm);
        const statutLivree = estPassageALivree;
        const statutEchec = statutNorm === 'echec de livraison' || statutNorm === 'échec de livraison' || statutNorm === 'echecdelivraison' || statutNorm === 'échecdelivraison';
        const codeOtpColis = sousCommande.codeOtp || null;

        if (estPassageALivree) {
            if (!estLivreur) {
                await session.abortTransaction();
                session.endSession();
                return res.status(403).json({ error: "🛑 Sécurité : Seul un livreur peut passer un colis au statut 'livrée'." });
            }

            const otpEnvoyeParLivreur = (req.body.codeOtp || req.body.otpLivraison || '').toString().trim();
            if (!otpEnvoyeParLivreur || otpEnvoyeParLivreur !== codeOtpColis) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: "🔑 Code OTP invalide ou manquant ! Demandez le code au client." });
            }
        }

        if (statutPriseEnCharge) {
            const livreurDejaAffectue = expedition?.livreur?.toString();
            const autreLivreurADejaAssigné = Boolean(livreurDejaAffectue && livreurDejaAffectue !== idUtilisateurConnecteString);
            const ordreDejaReserveParUnAutreLivreur = Boolean(sousCommande.livreurAssignationId && sousCommande.livreurAssignationId.toString() !== idUtilisateurConnecteString);

            if (autreLivreurADejaAssigné || ordreDejaReserveParUnAutreLivreur) {
                await session.abortTransaction();
                session.endSession();
                return res.status(409).json({ error: "Ce colis a déjà été attribué à un autre livreur." });
            }
        }

        if (statutLivree || statutEchec) {
            const livreurDejaAffectue = expedition?.livreur?.toString();
            const estAssigneAuBonLivreur = Boolean(livreurDejaAffectue && livreurDejaAffectue === idUtilisateurConnecteString);
            const ordreEstAssigneAuBonLivreur = !sousCommande.livreurAssignationId || sousCommande.livreurAssignationId.toString() === idUtilisateurConnecteString;

            if (!estAssigneAuBonLivreur || !ordreEstAssigneAuBonLivreur) {
                await session.abortTransaction();
                session.endSession();
                return res.status(409).json({ error: "Ce colis n’est plus attribué à votre compte." });
            }
        }

        const updatePayload = { 'vendorsOrders.$[elem].statutVendeur': nouveauStatut };

        if (statutPriseEnCharge) {
            updatePayload['vendorsOrders.$[elem].livreurAssignationId'] = idUtilisateurConnecte;
            updatePayload['vendorsOrders.$[elem].codeOtp'] = Math.floor(100000 + Math.random() * 900000).toString();
        }

        if (statutLivree) {
            updatePayload['vendorsOrders.$[elem].codeOtp'] = null;
        }

        const result = await Order.updateOne(
            { _id: parentOrder._id, 'vendorsOrders.colisGroupId': colisGroupId },
            { $set: updatePayload },
            {
                arrayFilters: [{ 'elem.colisGroupId': colisGroupId }],
                session
            }
        );

        if (result.matchedCount === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(409).json({ error: "Ce colis a déjà été attribué à un autre livreur." });
        }

        await synchroniserExpeditionDepuisColis({
            colisGroupId,
            statutCommande: nouveauStatut,
            livreurId: estLivreur ? idUtilisateurConnecte : null,
            notesLivreur,
            session
        });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: `Le colis complet est passé au statut : ${nouveauStatut} !` });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error('Erreur lors de la mise à jour du statut du colis :', error);
        res.status(400).json({ error: error.message });
    }
};


// =========================================================================
// 4. FONCTION LEGACY DE MISE À JOUR DE STATUT UNIQUE
// =========================================================================
// Cette méthode est conservée pour éviter de casser les anciens boutons ou anciens
// appels front qui utilisent un routeur basé sur une commande unique.
//
// Elle fonctionne encore, mais on préfèrera désormais l’approche plus moderne
// updateColisStatut qui manipule les sous-commandes par colis.
const updateStatut = async (req, res, next) => {
    try {
        const nouveauStatut = req.body.statut;
        const idUtilisateurConnecte = req.auth.userId; // La personne qui clique actuellement
        const roleUtilisateur = req.auth?.role; // Le rôle de la personne qui clique actuellement

        const statutNorm = (nouveauStatut || '').toLowerCase().trim();
        const estLivreur = roleUtilisateur === 'livreur' || roleUtilisateur === 'admin';

        // 🛑 LE VERROU DE SÉCURITÉ ANTI-TRICHE POUR "EN COURS"
        if (statutNorm === 'en cours' || statutNorm === 'encours' || statutNorm === 'en-cours') {
            if (roleUtilisateur !== 'vendeur') {
                return res.status(403).json({
                    error: "🛑 Sécurité : Seul le vendeur de cette commande peut la passer au statut 'en cours'."
                });
            }

            const commande = await Order.findOne({ _id: req.params.id });
            if (!commande) {
                return res.status(404).json({ error: "Commande introuvable." });
            }

            const vendeurIdCommande = commande.vendeurId;
            if (!vendeurIdCommande || vendeurIdCommande.toString() !== idUtilisateurConnecte.toString()) {
                return res.status(403).json({
                    error: "🛑 Sécurité : Vous ne pouvez modifier que les commandes dont vous êtes le vendeur."
                });
            }
        }

        // 🛑 LE VERROU DE SÉCURITÉ ANTI-TRICHE POUR LA PRISE EN CHARGE
        if (statutNorm === 'prise en charge' || statutNorm === 'prise-en-charge' || statutNorm === 'priseencharge') {
            if (!estLivreur) {
                return res.status(403).json({
                    error: "🛑 Sécurité : Seul un livreur peut passer une commande au statut 'prise en charge'."
                });
            }
        }

        // 🛑 LE VERROU DE SÉCURITÉ ANTI-TRICHE POUR L'ÉCHEC DE LIVRAISON
        if (statutNorm === 'echec de livraison' || statutNorm === 'échec de livraison' || statutNorm === 'echecdelivraison' || statutNorm === 'échecdelivraison') {
            if (!estLivreur) {
                return res.status(403).json({
                    error: "🛑 Sécurité : Seul un livreur peut passer une commande au statut 'échec de livraison'."
                });
            }
        }

        // 🛑 LE VERROU DE SÉCURITÉ ANTI-TRICHE
        if (statutNorm === 'livrée' || statutNorm === 'livree' || statutNorm === 'livré' || statutNorm === 'livre') {
            if (!estLivreur) {
                return res.status(403).json({
                    error: "🛑 Sécurité : Seul un livreur peut passer une commande au statut 'livrée'."
                });
            }
        }

        // 🛑 LE VERROU DE SÉCURITÉ ANTI-TRICHE POUR LA RÉCEPTION
        if (statutNorm === 'reçue' || statutNorm === 'recue') {
            // On va chercher LA commande en question pour vérifier l'identité de l'acheteur
            const commande = await Order.findOne({ _id: req.params.id });

            if (!commande) {
                return res.status(404).json({ error: "Commande introuvable." });
            }

            // On vérifie si l'ID de la personne connectée correspond à l'acheteur
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

        // Même logique sur la route de statut par commande unique : on synchronise l'expédition
        // pour conserver une vue cohérente du workflow de livraison.
        const commandePourExpedition = await Order.findOne({ _id: req.params.id });
        const notesLivreur = (req.body?.notesLivreur || '').toString().trim();
        if (commandePourExpedition?.colisGroupId) {
            await synchroniserExpeditionDepuisColis({
                colisGroupId: commandePourExpedition.colisGroupId,
                statutCommande: nouveauStatut,
                livreurId: estLivreur ? idUtilisateurConnecte : null,
                notesLivreur: notesLivreur || null
            });
        }

        res.status(200).json({ message: `Statut mis à jour : ${nouveauStatut} !` });

    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// =========================================================================
// 5. AFFICHAGE DES ACHATS CLIENT
// =========================================================================
// Cette fonction sert à l’acheteur connecté pour voir toutes ses commandes.
// Elle ne renvoie pas les sous-commandes de vente, uniquement les commandes de son compte.
const getAcheteurOrders = async (req, res) => {
    try {
        const orders = await Order.find({ acheteurId: req.auth.userId })
            // Le frontend affiche les produits de chaque sous-commande vendeur.
            .populate('vendorsOrders.items.produitId')
            // Le nom de boutique est affiché dans l’en-tête de chaque colis vendeur.
            .populate('vendorsOrders.vendeurId', 'nom prenom boutique')
            // Conserver le populate du champ plat pour les anciennes commandes.
            .populate('produitId')
            .populate('acheteurId', 'nom prenom email')
            .sort({ createdAt: -1 });

        return res.status(200).json(orders);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
};


// =========================================================================
// 6. ANNULATION PAR LE VENDEUR
// =========================================================================
// Un vendeur peut annuler une commande seulement si elle n’est pas déjà engagée
// dans le workflow de livraison.
//
// Exemples de cas bloqués :
// - livraison déjà prise en charge
// - colis livré
// - colis déjà en cours de route
//
// Cette règle évite les annulations imprudentes et les incohérences de stock.
const annulerCommandeParVendeur = async (req, res, next) => {
    try {
        const commande = await Order.findOne({ _id: req.params.id });
        
        if (!commande) {
            return res.status(404).json({ error: "Commande introuvable !" });
        }

        const statutNettoye = (commande.statut || '').toLowerCase();
        if (
            statutNettoye === 'livrée' ||
            statutNettoye === 'annulée' ||
            statutNettoye === 'annulée par acheteur' ||
            statutNettoye === 'expédiée' ||
            statutNettoye === 'attribuéealivreur' ||
            statutNettoye === 'prise en charge' ||
            statutNettoye === 'reçue' ||
            statutNettoye === 'recue' ||
            statutNettoye === 'echec de livraison' ||
            statutNettoye === 'échec de livraison'
        ) {
            return res.status(400).json({ error: "Impossible d'annuler une commande déjà clôturée ou déjà engagée dans un workflow de livraison." });
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
// 7. ANNULATION PAR L’ACHETEUR
// =========================================================================
// L’acheteur peut seulement annuler une commande encore en attente.
// Autrement dit, s’il n’est pas encore en cours de préparation ou de livraison.
//
// Si la commande est déjà traitée ou livrée, il faut utiliser un autre flux.
const annulerCommandeParAcheteur = async (req, res, next) => {
    try {
        const commande = await Order.findOne({ _id: req.params.id });
        
        if (!commande) {
            return res.status(404).json({ error: "Commande introuvable !" });
        }

        if (commande.acheteurId.toString() !== req.auth.userId?.toString()) {
            return res.status(403).json({ error: "Vous n'êtes pas autorisé à annuler cette commande." });
        }

        // Dans le nouveau modèle, chaque article a son propre statut d’annulation,
        // tandis que le statut du colis vendeur continue de gérer le flux logistique.
        const colisGroupId = req.body?.colisGroupId;
        if (colisGroupId) {
            const sousCommande = (commande.vendorsOrders || []).find(
                sous => sous.colisGroupId === colisGroupId
            );

            if (!sousCommande) {
                return res.status(404).json({ error: 'Sous-commande introuvable.' });
            }

            if (sousCommande.statutVendeur !== 'en attente') {
                return res.status(400).json({
                    error: 'Impossible d’annuler cet article : le vendeur a déjà commencé le traitement du colis.'
                });
            }

            // L’interface envoie l’identifiant du sous-document d’article. Le fallback
            // produitId sert aux anciennes versions du frontend, en prenant le premier match.
            let article = req.body?.itemId
                ? sousCommande.items.id(req.body.itemId)
                : null;

            if (!article && req.body?.produitId) {
                article = sousCommande.items.find(item =>
                    item.produitId?.toString() === req.body.produitId.toString()
                    && !['annulée', 'annulée par acheteur'].includes(item.statut)
                );
            }

            if (!article) {
                return res.status(404).json({ error: 'Article introuvable dans ce colis.' });
            }

            if (article.statut && article.statut !== 'en attente') {
                return res.status(400).json({ error: 'Cet article ne peut plus être annulé.' });
            }

            article.statut = 'annulée par acheteur';
            await Thing.findByIdAndUpdate(article.produitId, {
                $inc: { stock: article.quantite || 1 }
            });

            const articlesActifs = sousCommande.items.filter(item =>
                !['annulée', 'annulée par acheteur'].includes(item.statut)
            );

            // Recalculer les totaux pour que la facture ne facture pas l’article annulé.
            sousCommande.subTotalHT = articlesActifs.reduce((total, item) => total + (Number(item.totalHT) || 0), 0);
            sousCommande.subTotalTVA = articlesActifs.reduce((total, item) => total + (Number(item.montantTVA) || 0), 0);
            sousCommande.subTotalTTC = articlesActifs.reduce((total, item) => total + (Number(item.totalTTC) || 0), 0);

            if (articlesActifs.length === 0) {
                sousCommande.statutVendeur = 'annulée par acheteur';
                sousCommande.codeOtp = null;
            }

            // Les totaux de la commande parent correspondent à la somme des articles
            // encore actifs de tous les vendeurs.
            const tousLesArticlesActifs = (commande.vendorsOrders || []).flatMap(sous =>
                (sous.items || []).filter(item => !['annulée', 'annulée par acheteur'].includes(item.statut))
            );
            commande.totalHTGlobal = tousLesArticlesActifs.reduce((total, item) => total + (Number(item.totalHT) || 0), 0);
            commande.totalTVAGlobal = tousLesArticlesActifs.reduce((total, item) => total + (Number(item.montantTVA) || 0), 0);
            commande.totalTTCGlobal = tousLesArticlesActifs.reduce((total, item) => total + (Number(item.totalTTC) || 0), 0);

            await commande.save();

            // L’expédition ne doit plus lister l’article dont le stock vient d’être remis.
            await Expedition.updateOne(
                { colisGroupId },
                { $set: { produits: articlesActifs.map(item => ({ produit: item.produitId, quantite: item.quantite || 1 })) } }
            );

            return res.status(200).json({ message: 'Article annulé et stock restitué.' });
        }

        // Ancien format : une commande plate correspond à un seul produit.
        if (!commande.statut || commande.statut.toLowerCase() !== 'en attente') {
            return res.status(400).json({
                error: 'Impossible d’annuler cette commande. Elle a déjà été traitée ou engagée dans le workflow de livraison.'
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
// 8. GÉNÉRATION DE LA FACTURE PDF
// =========================================================================
// Cette fonction crée un PDF à partir d’une commande de livraison.
//
// Rôle du système :
// - le colisGroupId sélectionne une seule sous-commande vendeur
// - l’acheteur peut télécharger la facture de ce colis
// - le vendeur ne peut télécharger que la facture de son propre colis
// - les articles annulés sont exclus du PDF et de ses totaux
//
// C’est important pour la confidentialité et l’organisation des données.
const downloadInvoice = async (req, res) => {
    try {
        const userIdConnecte = req.auth.userId.toString();
        const roleDemande = req.query.role === 'vendeur' ? 'vendeur' : 'client';

        // Le colisGroupId identifie la sous-commande d’un vendeur. L’acheteur
        // et le vendeur obtiennent donc le PDF du même colis, jamais le panier complet.
        const parentOrder = await Order.findOne({ 'vendorsOrders.colisGroupId': req.params.colisGroupId })
            .populate('acheteurId', 'nom prenom email')
            .populate('vendorsOrders.items.produitId');

        if (!parentOrder) {
            return res.status(404).json({ error: 'Facture introuvable.' });
        }

        const vendorSubOrders = (parentOrder.vendorsOrders || [])
            .filter(sub => sub.colisGroupId === req.params.colisGroupId);
        if (!vendorSubOrders.length) {
            return res.status(404).json({ error: 'Facture introuvable.' });
        }

        const estAcheteur = parentOrder.acheteurId && parentOrder.acheteurId._id?.toString() === userIdConnecte;
        const estUnDesVendeurs = vendorSubOrders.some(sub => sub.vendeurId && sub.vendeurId.toString() === userIdConnecte);

        if (!estAcheteur && !estUnDesVendeurs) {
            return res.status(403).json({ error: 'Accès refusé. Vous n\'avez aucun droit sur ce colis.' });
        }

        let ordersAFFICHEES = [];
        if (roleDemande === 'client' && estAcheteur) {
            ordersAFFICHEES = vendorSubOrders.map(sub => ({
                ...sub.toObject ? sub.toObject() : sub,
                acheteurId: parentOrder.acheteurId,
                createdAt: parentOrder.createdAt
            }));
        } else {
            ordersAFFICHEES = vendorSubOrders.filter(sub => sub.vendeurId && sub.vendeurId.toString() === userIdConnecte)
                .map(sub => ({
                    ...sub.toObject ? sub.toObject() : sub,
                    acheteurId: parentOrder.acheteurId,
                    createdAt: parentOrder.createdAt
                }));
        }

        if (!ordersAFFICHEES.length) {
            return res.status(403).json({ error: 'Aucun produit ne vous appartient dans cette facture.' });
        }

        const client = parentOrder.acheteurId;
        const nomAcheteur = client
            ? `${client.prenom || ''} ${client.nom || ''}`.trim().toUpperCase()
            : `CLIENT (ID: #${userIdConnecte.substring(0, 6)}...)`;

        const groupeParVendeur = {};
        for (const item of ordersAFFICHEES) {
            const vId = item.vendeurId ? item.vendeurId.toString() : 'INCONNU';
            if (!groupeParVendeur[vId]) {
                let nomV = `BOUTIQUE (ID: #${vId.substring(0, 6)})`;
                const vendeurDoc = item.vendeurId && mongoose.isValidObjectId(item.vendeurId)
                    ? await User.findById(item.vendeurId)
                    : null;

                if (vendeurDoc) {
                    nomV = `${vendeurDoc.prenom || ''} ${vendeurDoc.nom || ''}`.trim().toUpperCase();
                }

                groupeParVendeur[vId] = { nom: nomV, articles: [] };
            }
            groupeParVendeur[vId].articles.push(item);
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Facture-${req.params.colisGroupId}.pdf`);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.pipe(res);

        doc.fillColor('#1a365d').fontSize(24).text('SHOPYCLOTH', 50, 50, { bold: true });
        doc.fillColor('#718096').fontSize(10).text('Plateforme de Marketplace sécurisée', 50, 80);

        doc.fillColor('#1a365d').fontSize(20).text('FACTURE', 400, 50, { align: 'right' });
        doc.fillColor('#2d3748').fontSize(10)
            .text(`N° Colis : #${req.params.colisGroupId}`, 400, 75, { align: 'right' })
            .text(`Date : ${new Date(parentOrder.createdAt).toLocaleDateString('fr-FR')}`, 400, 90, { align: 'right' });

        doc.moveTo(50, 120).lineTo(550, 120).strokeColor('#e2e8f0').lineWidth(1).stroke();

        let infoY = 140;
        doc.fillColor('#4a5568').fontSize(10, { bold: true }).text('FACTURÉ À (Acheteur) :', 50, infoY);
        doc.fillColor('#2d3748').fontSize(10, { bold: false })
            .text(nomAcheteur, 50, infoY + 15)
            .text(`Email : ${client?.email || 'Non renseigné'}`, 50, infoY + 30);

        doc.moveTo(50, 195).lineTo(550, 195).strokeColor('#e2e8f0').stroke();

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
                const articlesFacturables = (item.items || []).filter(article =>
                    !['annulée', 'annulée par acheteur'].includes(article.statut)
                );

                articlesFacturables.forEach(article => {
                    const produit = article.produitId || {};
                    const produitId = produit._id?.toString() || produit.toString();
                    const nomDuProduit = produit.nom || `Produit ${produitId.slice(-6)}`;
                    const quantite = Number(article.quantite) || 1;
                    const prixU = Number(article.prixUnitaire) || 0;
                    const totalTTC = Number(article.totalTTC) || 0;
                    const totalHT = Number(article.totalHT) || 0;
                    const montantTVA = Number(article.montantTVA) || 0;

                    doc.text(nomDuProduit.substring(0, 38), 50, moveY);
                    doc.text(`${quantite}`, 300, moveY, { width: 30, align: 'center' });
                    doc.text(`${prixU.toFixed(2)} €`, 350, moveY, { width: 90, align: 'right' });
                    doc.text(`${totalTTC.toFixed(2)} €`, 460, moveY, { width: 90, align: 'right' });

                    cumulHT += totalHT;
                    cumulTVA += montantTVA;
                    cumulTTC += totalTTC;
                    moveY += 18;
                });
            });

            moveY += 10;
        });

        doc.moveTo(50, moveY).lineTo(550, moveY).strokeColor('#e2e8f0').lineWidth(1).stroke();
        moveY += 15;

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
        console.error('Erreur génération PDF multi-vendeurs', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur lors de la génération de la facture.' });
        }
    }
};



// =============================================================
// EXPORT DES FONCTIONS DE CE CONTRÔLEUR
// =============================================================
// Ce bloc permet d’exposer les fonctions aux routes définies dans routes/order.js.
// Les routes appellent directement ces fonctions.
//
// Exemple :
// - POST /orders => createOrder
// - GET /orders/vendeur => getVendeurOrders
// - PATCH /orders/colis/:colisGroupId => updateColisStatut
// - GET /orders/invoice/:colisGroupId => downloadInvoice
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