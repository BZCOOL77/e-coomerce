const Order = require('../models/Order');
const User = require('../models/user');
const Expedition = require('../models/expedition'); // Importe les expéditions pour récupérer le motif d'échec du colis.

// =========================================================================
// Récupère toutes les commandes dont le statut est "expédiée"
// Cette fonction est prévue pour l'interface livreur.
// Elle charge les commandes expédiées de la commune du livreur,
// limite à 10 colis maximum et renvoie des objets JavaScript purs.
// À chaque appel, le livreur peut donc recevoir une nouvelle tournée
// de jusqu'à 10 colis correspondant à sa zone de livraison.
// =========================================================================
const getExpedieesOrders = async (req, res, next) => {
    try {
        const userId = req.auth && req.auth.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Utilisateur non authentifié.' });
        }

        // On récupère le profil du livreur pour connaître ses communes autorisées.
        const livreur = await User.findById(userId).lean();
        if (!livreur) {
            return res.status(404).json({ error: 'Livreur introuvable.' });
        }

        const communesLivraison = livreur.zoneAssignee?.communes || [];
        if (!Array.isArray(communesLivraison) || communesLivraison.length === 0) {
            return res.status(400).json({
                error: 'Aucune zone de livraison configurée pour ce livreur. Merci de renseigner les communes.'
            });
        }

        // On limite la liste à 2 colis au maximum pour tester la logique de tournée.
        // La tournée d'un livreur ne doit contenir que les colis qui lui ont été attribués
        // de façon explicite. Cela évite tout conflit entre tournées de plusieurs livreurs.
        const maxColisLivraison = Math.min(2, livreur.zoneAssignee?.capaciteMaxColis || 2);

        // =====================================================================
        // FLUX MODERNE : une commande parent contient plusieurs vendorsOrders
        // =====================================================================
        // Dans le nouveau modèle, le statut et le livreur sont stockés dans
        // vendorsOrders[]. L'ancien code ci-dessous cherche ces champs à la
        // racine de Order et ne peut donc pas trouver les commandes modernes.
        const communesRegex = communesLivraison.map(commune => {
            const communeEchappee = String(commune).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`^${communeEchappee}$`, 'i');
        });

        const groupesSelectionnes = new Map();

        const ajouterGroupe = (commande, sousCommande) => {
            if (!sousCommande?.colisGroupId || groupesSelectionnes.size >= maxColisLivraison) {
                return;
            }

            if (!groupesSelectionnes.has(sousCommande.colisGroupId)) {
                groupesSelectionnes.set(sousCommande.colisGroupId, {
                    orderId: commande._id,
                    colisGroupId: sousCommande.colisGroupId
                });
            }
        };

        // 1) Un livreur retrouve d'abord ses colis déjà attribués.
        const commandesDejaAttribuees = await Order.find({
            vendorsOrders: {
                $elemMatch: {
                    livreurAssignationId: userId,
                    statutVendeur: { $in: ['attribuéeAlivreur', 'prise en charge'] }
                }
            }
        }).sort({ createdAt: 1 }).lean();

        for (const commande of commandesDejaAttribuees) {
            const sousCommandes = (commande.vendorsOrders || []).filter(sousCommande =>
                sousCommande.livreurAssignationId?.toString() === userId.toString()
                && ['attribuéeAlivreur', 'prise en charge'].includes(sousCommande.statutVendeur)
            );
            sousCommandes.forEach(sousCommande => ajouterGroupe(commande, sousCommande));
        }

        // 2) Si la tournée n'est pas pleine, on sélectionne les colis expédiés
        // de la commune du livreur qui n'ont encore aucun livreur assigné.
        if (groupesSelectionnes.size < maxColisLivraison) {
            const commandesDisponiblesModernes = await Order.find({
                'adresseLivraison.commune': { $in: communesRegex },
                vendorsOrders: {
                    $elemMatch: {
                        statutVendeur: 'expédiée',
                        livreurAssignationId: null
                    }
                }
            }).sort({ createdAt: 1 }).lean();

            for (const commande of commandesDisponiblesModernes) {
                const sousCommandes = (commande.vendorsOrders || []).filter(sousCommande =>
                    sousCommande.statutVendeur === 'expédiée'
                    && !sousCommande.livreurAssignationId
                );
                sousCommandes.forEach(sousCommande => ajouterGroupe(commande, sousCommande));
                if (groupesSelectionnes.size >= maxColisLivraison) break;
            }
        }

        // 3) Réservation atomique : deux livreurs ne peuvent pas obtenir le
        // même colis entre la sélection et l'écriture en base.
        const groupesReserves = [];
        for (const groupe of groupesSelectionnes.values()) {
            const sousCommandeReservee = await Order.findOneAndUpdate(
                {
                    _id: groupe.orderId,
                    vendorsOrders: {
                        $elemMatch: {
                            colisGroupId: groupe.colisGroupId,
                            statutVendeur: 'expédiée',
                            livreurAssignationId: null
                        }
                    }
                },
                {
                    $set: {
                        'vendorsOrders.$[sousCommande].livreurAssignationId': userId,
                        'vendorsOrders.$[sousCommande].statutVendeur': 'attribuéeAlivreur'
                    }
                },
                {
                    arrayFilters: [{
                        'sousCommande.colisGroupId': groupe.colisGroupId,
                        'sousCommande.statutVendeur': 'expédiée',
                        'sousCommande.livreurAssignationId': null
                    }],
                    returnDocument: 'after'
                }
            );

            if (sousCommandeReservee) {
                await Expedition.findOneAndUpdate(
                    { colisGroupId: groupe.colisGroupId, livreur: null },
                    { $set: { livreur: userId, statut: 'attribuéeAlivreur' } },
                    { returnDocument: 'after' }
                );
                groupesReserves.push(groupe);
            } else {
                // Le colis peut déjà appartenir à ce même livreur. Dans ce
                // cas, il ne faut pas le réattribuer : on le recharge simplement
                // pour qu'il reste visible après un rafraîchissement de page.
                const colisDejaAttribue = await Order.exists({
                    _id: groupe.orderId,
                    vendorsOrders: {
                        $elemMatch: {
                            colisGroupId: groupe.colisGroupId,
                            livreurAssignationId: userId,
                            statutVendeur: { $in: ['attribuéeAlivreur', 'prise en charge'] }
                        }
                    }
                });

                if (colisDejaAttribue) {
                    groupesReserves.push(groupe);
                }
            }
        }

        // 4) Charger les commandes parent et les transformer en lignes simples,
        // format attendu par grouperCommandesParColis() côté frontend.
        if (groupesReserves.length > 0) {
            const commandesModernes = await Order.find({
                _id: { $in: groupesReserves.map(groupe => groupe.orderId) }
            })
                .populate('vendorsOrders.items.produitId')
                .populate('vendorsOrders.vendeurId', 'nom prenom email boutique')
                .populate('acheteurId', 'nom prenom email')
                .lean();

            const groupesParId = new Map(groupesReserves.map(groupe => [groupe.colisGroupId, groupe]));
            const commandesModernesFormatees = [];

            for (const commande of commandesModernes) {
                for (const sousCommande of commande.vendorsOrders || []) {
                    const groupe = groupesParId.get(sousCommande.colisGroupId);
                    if (!groupe || groupe.orderId.toString() !== commande._id.toString()) continue;

                    const vendeur = sousCommande.vendeurId || {};
                    const boutique = vendeur.boutique || {};
                    const adresseRecuperation = {
                        commune: boutique.communeBoutique || null,
                        quartier: boutique.quartierBoutique || null,
                        avenue: boutique.avenueBoutique || null,
                        numeroParcelle: boutique.numeroadresseBoutique || null,
                        telephone: boutique.telephoneBoutique || null,
                        nomBoutique: boutique.nomBoutique || `${vendeur.prenom || ''} ${vendeur.nom || ''}`.trim() || null,
                        longitude: boutique.longitudeBoutique ?? null,
                        latitude: boutique.latitudeBoutique ?? null
                    };

                    for (const item of sousCommande.items || []) {
                        commandesModernesFormatees.push({
                            _id: commande._id,
                            id: commande._id,
                            acheteurId: commande.acheteurId || null,
                            vendeurId: vendeur,
                            produitId: item.produitId || null,
                            quantite: item.quantite || 1,
                            statut: sousCommande.statutVendeur,
                            devise: item.devise || 'FC',
                            prixUnitaire: item.prixUnitaire || null,
                            prixUnitaireFC: item.prixUnitaireFC ?? null,
                            deviseCalcul: item.deviseCalcul || 'FC',
                            prixUnitaireHT: item.prixUnitaireHT || null,
                            totalHT: item.totalHT || null,
                            montantTVA: item.montantTVA || null,
                            totalTTC: item.totalTTC || null,
                            dateCommande: commande.dateCommande || commande.createdAt || null,
                            createdAt: commande.createdAt || null,
                            updatedAt: commande.updatedAt || null,
                            adresseLivraison: commande.adresseLivraison || null,
                            longitude: commande.adresseLivraison?.longitude || null,
                            latitude: commande.adresseLivraison?.latitude || null,
                            adresseRecuperation,
                            longitudeRecuperation: adresseRecuperation.longitude,
                            latitudeRecuperation: adresseRecuperation.latitude,
                            colisGroupId: sousCommande.colisGroupId
                        });
                    }
                }
            }

            return res.status(200).json({
                message: 'Tournée du livreur chargée avec succès.',
                communesLivreur: communesLivraison,
                maxColisLivraison,
                commandes: commandesModernesFormatees,
                hasOrders: commandesModernesFormatees.length > 0,
                status: commandesModernesFormatees.length > 0 ? 'success' : 'empty'
            });
        }

        return res.status(200).json({
            message: 'Aucune livraison n’est actuellement disponible pour votre zone de livraison.',
            communesLivreur: communesLivraison,
            maxColisLivraison,
            commandes: [],
            hasOrders: false,
            status: 'empty'
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des commandes expédiées :', error);
        return res.status(500).json({ error: 'Erreur serveur lors de la récupération des commandes expédiées.' });
    }
};





// =========================================================================
// Récupère l'historique des commandes livrées ou échouées par ce livreur
// =========================================================================
const getLivreurHistory = async (req, res, next) => {
    try {
        const userId = req.auth && req.auth.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Utilisateur non authentifié.' });
        }

        const statutsHistorique = ['livrée', 'echec de livraison', 'échec de livraison', 'annulée'];

        // -----------------------------------------------------------------
        // 1. Commandes modernes : une ligne par article et par colis vendeur
        // -----------------------------------------------------------------
        const commandesModernes = await Order.find({
            vendorsOrders: {
                $elemMatch: {
                    livreurAssignationId: userId,
                    statutVendeur: { $in: statutsHistorique }
                }
            }
        })
            .populate('vendorsOrders.items.produitId', 'nom prix image')
            .populate('acheteurId', 'nom prenom email')
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean();

        const groupesModernes = commandesModernes.flatMap(commande =>
            (commande.vendorsOrders || [])
                .filter(sousCommande =>
                    sousCommande.livreurAssignationId?.toString() === userId.toString()
                    && statutsHistorique.includes(sousCommande.statutVendeur)
                )
                .map(sousCommande => ({ commande, sousCommande }))
        );

        const colisModernes = groupesModernes
            .map(({ sousCommande }) => sousCommande.colisGroupId)
            .filter(Boolean);
        const expeditionsModernes = await Expedition.find({
            colisGroupId: { $in: colisModernes }
        }).select('colisGroupId notesLivreur').lean();
        const motifsModernes = new Map(expeditionsModernes.map(expedition => [
            expedition.colisGroupId,
            expedition.notesLivreur
        ]));

        const historiqueModerne = groupesModernes.flatMap(({ commande, sousCommande }) => {
            const items = sousCommande.items || [];
            const itemsActifs = items.length > 0 ? items : [{
                produitId: null,
                quantite: 1,
                totalTTC: sousCommande.subTotalTTC || 0
            }];

            return itemsActifs.map(item => ({
                _id: item._id || commande._id,
                id: item._id || commande._id,
                acheteurId: commande.acheteurId || null,
                vendeurId: sousCommande.vendeurId || null,
                produitId: item.produitId || null,
                quantite: item.quantite || 1,
                devise: item.devise || 'FC',
                prixUnitaire: item.prixUnitaire || null,
                prixUnitaireFC: item.prixUnitaireFC ?? null,
                deviseCalcul: item.deviseCalcul || 'FC',
                totalTTC: item.totalTTC || 0,
                statut: sousCommande.statutVendeur,
                dateCommande: commande.dateCommande || commande.createdAt || null,
                createdAt: commande.createdAt || null,
                updatedAt: commande.updatedAt || null,
                adresseLivraison: commande.adresseLivraison || null,
                colisGroupId: sousCommande.colisGroupId || null,
                motifEchec: motifsModernes.get(sousCommande.colisGroupId) || null
            }));
        });

        const historyAvecMotifs = historiqueModerne
            .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
            .slice(0, 100);

        return res.status(200).json({
            success: true,
            count: historyAvecMotifs.length,
            commandes: historyAvecMotifs
        });
    } catch (error) {
        return res.status(500).json({ error: 'Erreur lors de la récupération de l’historique.' });
    }
};







module.exports = {
    getExpedieesOrders,
    getLivreurHistory
};