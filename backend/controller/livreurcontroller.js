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

        const statutsActifsLivreur = {
            statut: { $regex: /^(attribu(?:ée|ee|e)alivreur|prise(?: |-)en(?: |-)charge)$/i },
            livreurAssignationId: userId
        };

        const selectionnerColis = (commandes, limite) => {
            const groupesVus = new Set();
            const groupesAvecIdentifiant = [];
            const idsSansIdentifiant = [];

            for (const commande of commandes) {
                const groupeKey = commande.colisGroupId || commande._id.toString();
                if (groupesVus.has(groupeKey)) continue;

                groupesVus.add(groupeKey);
                if (commande.colisGroupId) {
                    groupesAvecIdentifiant.push(commande.colisGroupId);
                } else {
                    idsSansIdentifiant.push(commande._id);
                }

                if (groupesVus.size === limite) break;
            }

            return { groupesAvecIdentifiant, idsSansIdentifiant };
        };

        const construireFiltreColis = selection => {
            const filtres = [];

            if (selection.groupesAvecIdentifiant.length > 0) {
                filtres.push({ colisGroupId: { $in: selection.groupesAvecIdentifiant } });
            }
            if (selection.idsSansIdentifiant.length > 0) {
                filtres.push({ _id: { $in: selection.idsSansIdentifiant } });
            }

            return filtres.length > 0 ? { $or: filtres } : { _id: { $in: [] } };
        };

        const chargerSelectionComplete = async (selection, filtreSupplementaire) => {
            return Order.find({
                ...filtreSupplementaire,
                ...construireFiltreColis(selection)
            })
                .populate('produitId')
                .populate('acheteurId', 'nom prenom email')
                // On charge les informations boutique nécessaires à l'adresse de retrait chez le vendeur.
                .populate('vendeurId', 'nom prenom email boutique')
                .sort({ createdAt: 1 })
                .lean();
        };

        // Étape A : sélectionner 2 colis distincts, puis charger toutes leurs lignes.
        const commandesActives = await Order.find(statutsActifsLivreur)
            .sort({ createdAt: 1 })
            .lean();
        const selectionActuelle = selectionnerColis(commandesActives, maxColisLivraison);
        let orders = await chargerSelectionComplete(selectionActuelle, statutsActifsLivreur);

        // Étape B : si la tournée du livreur est vide, on recharge avec des colis libres
        // qui sont encore au statut "expédiée" dans ses communes. Ces colis sont ensuite
        // attribués atomiquement à ce livreur pour éviter toute double répartition.
        if (orders.length === 0) {
            // Expression régulière insensible à la casse pour chaque commune
            const communesRegex = communesLivraison.map(c => new RegExp(`^${c}$`, 'i'));

            const commandesDisponibles = await Order.find({
                statut: { $regex: /^exp(?:e|é)di(?:e|é)e?$/i },
                livreurAssignationId: null,
                'adresseLivraison.commune': { $in: communesRegex }
            })
                .sort({ createdAt: 1 })
                .select('_id colisGroupId')
                .lean();

            const selectionDisponible = selectionnerColis(commandesDisponibles, maxColisLivraison);

            if (selectionDisponible.groupesAvecIdentifiant.length > 0 || selectionDisponible.idsSansIdentifiant.length > 0) {
                const updateResult = await Order.updateMany(
                    {
                        ...construireFiltreColis(selectionDisponible),
                        livreurAssignationId: null
                    },
                    {
                        $set: {
                            livreurAssignationId: userId,
                            statut: 'attribuéeAlivreur'
                        }
                    }
                );

                // On recharge toutes les lignes des colis réellement attribués à ce livreur.
                orders = updateResult.modifiedCount > 0
                    ? await chargerSelectionComplete(selectionDisponible, statutsActifsLivreur)
                    : [];
            }
        }

        // On transforme les commandes MongoDB en objets JavaScript simples exploités par le frontend.
        const commandes = orders.map(order => {
            return {
                _id: order._id,
                id: order._id,
                acheteurId: order.acheteurId || null,
                vendeurId: order.vendeurId || null,
                produitId: order.produitId || null,
                quantite: order.quantite || null,
                statut: order.statut || null,
                prixUnitaire: order.prixUnitaire || null,
                prixUnitaireHT: order.prixUnitaireHT || null,
                totalHT: order.totalHT || null,
                montantTVA: order.montantTVA || null,
                totalTTC: order.totalTTC || null,
                dateCommande: order.dateCommande || order.createdAt || null,
                createdAt: order.createdAt || null,
                updatedAt: order.updatedAt || null,
                adresseLivraison: order.adresseLivraison || null,
                longitude: order.adresseLivraison?.longitude || null,
                latitude: order.adresseLivraison?.latitude || null,
                
                // On expose l'adresse boutique uniquement pour un colis attribué au livreur.
                adresseRecuperation: order.statut === 'attribuéeAlivreur' && order.vendeurId?.boutique
                    // On transforme les champs boutique en adresse lisible par le frontend.
                    ? {
                        // On transmet la commune de la boutique comme lieu de retrait.
                        commune: order.vendeurId.boutique.communeBoutique || null,
                        // On transmet le quartier de la boutique comme lieu de retrait.
                        quartier: order.vendeurId.boutique.quartierBoutique || null,
                        // On transmet l'avenue de la boutique comme lieu de retrait.
                        avenue: order.vendeurId.boutique.avenueBoutique || null,
                        // On transmet le numéro d'adresse de la boutique comme lieu de retrait.
                        numeroParcelle: order.vendeurId.boutique.numeroadresseBoutique || null,
                        // On transmet le téléphone de la boutique pour faciliter le contact.
                        telephone: order.vendeurId.boutique.telephoneBoutique || null,
                        // On transmet le nom de la boutique pour identifier le lieu de retrait.
                        nomBoutique: order.vendeurId.boutique.nomBoutique || null,
                        //on transmet la longitude de la boutique pour le géocodage
                        longitude: order.vendeurId.boutique.longitudeBoutique || null,
                        //on transmet la latitude de la boutique pour le géocodage
                        latitude: order.vendeurId.boutique.latitudeBoutique || null
                    }
                    // On évite d'afficher une adresse de retrait pour les autres statuts.
                    : null,
                colisGroupId: order.colisGroupId || null
            };
        });

        // Si aucune commande n'est disponible pour la zone du livreur, on envoie un message
        // explicite au frontend pour afficher une information claire à l'utilisateur.
        const hasOrders = commandes.length > 0;

        return res.status(200).json({
            message: hasOrders
                ? 'Tournée du livreur chargée avec succès.'
                : 'Aucune livraison n’est actuellement disponible pour votre zone de livraison. Votre tournée sera rechargée dès qu’un nouveau colis correspondant à vos communes sera prêt.',
            communesLivreur: communesLivraison,
            maxColisLivraison,
            commandes,
            hasOrders,
            status: hasOrders ? 'success' : 'empty'
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

        // On cherche les commandes terminées assignées à CE livreur
        const history = await Order.find({
            livreurAssignationId: userId,
            statut: { $regex: /^(livr(?:ée|ee|e)|annul(?:ée|ee|e)|(?:e|é)chec(?: de livraison)?)$/i } // Statuts finaux
        })
            .populate('produitId', 'nom prix image')
            .populate('acheteurId', 'nom prenom adresse telephone')
            .sort({ updatedAt: -1 }) // Les plus récentes d'abord
            .limit(50) // On limite pour éviter de surcharger
            .lean();

        const colisGroupIds = [...new Set(history.map(commande => commande.colisGroupId).filter(Boolean))]; // Extrait les identifiants uniques des colis présents dans l'historique.
        const expeditions = await Expedition.find({ colisGroupId: { $in: colisGroupIds } }).select('colisGroupId notesLivreur').lean(); // Récupère uniquement le motif associé à chaque colis.
        const motifsParColis = new Map(expeditions.map(expedition => [expedition.colisGroupId, expedition.notesLivreur])); // Indexe les motifs pour les retrouver rapidement.
        const historyAvecMotifs = history.map(commande => ({ ...commande, motifEchec: motifsParColis.get(commande.colisGroupId) || null })); // Ajoute le motif correspondant à chaque ligne de commande.

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