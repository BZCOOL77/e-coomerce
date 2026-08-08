const Order = require('../models/Order');
const User = require('../models/user');

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

        // Étape A : vérifier si ce livreur a déjà des colis dans sa tournée actuelle.
        // Si oui, on les renvoie pour qu'il puisse continuer à les livrer.
        // Le statut est filtré avec une expression régulière pour accepter les variantes de casse
        // et éviter que des écritures mineures bloquent la logique métier.
        let orders = await Order.find({
            statut: { $regex: /^(attribu(?:ée|ee|e)alivreur|prise(?: |-)en(?: |-)charge)$/i },
            livreurAssignationId: userId
        })
            .populate('produitId')                      // informations du produit
            .populate('acheteurId', 'nom prenom email') // nom, prénom et email de l'acheteur
            .populate('vendeurId', 'nom prenom email')  // nom, prénom et email du vendeur
            .sort({ createdAt: 1 })                     // plus anciens d'abord pour une tournée cohérente
            .limit(maxColisLivraison)                   // max 2 colis pour ce livreur
            .lean();                                    // renvoie des objets JavaScript purs

        // Étape B : si la tournée du livreur est vide, on recharge avec des colis libres
        // qui sont encore au statut "expédiée" dans ses communes. Ces colis sont ensuite
        // attribués atomiquement à ce livreur pour éviter toute double répartition.
        if (orders.length === 0) {
            // Expression régulière insensible à la casse pour chaque commune
            const communesRegex = communesLivraison.map(c => new RegExp(`^${c}$`, 'i'));

            const colisDisponibles = await Order.find({
                statut: { $regex: /^exp(?:e|é)di(?:e|é)e?$/i },
                livreurAssignationId: null,
                'adresseLivraison.commune': { $in: communesRegex }
            })
                .limit(maxColisLivraison)
                .select('_id')
                .lean();

            const idsAAssigner = colisDisponibles.map(c => c._id);

            if (idsAAssigner.length > 0) {
                const updateResult = await Order.updateMany(
                    {
                        _id: { $in: idsAAssigner },
                        livreurAssignationId: null
                    },
                    {
                        $set: {
                            livreurAssignationId: userId,
                            statut: 'attribuéeAlivreur'
                        }
                    }
                );

                // On ne récupère que les colis réellement attribués à ce livreur après l'update.
                // La requête de confirmation évite de relire un document qu'un autre livreur aurait déjà pris entre-temps.
                orders = updateResult.modifiedCount > 0
                    ? await Order.find({
                        _id: { $in: idsAAssigner },
                        livreurAssignationId: userId,
                        statut: { $regex: /^(attribu(?:ée|ee|e)alivreur|prise(?: |-)en(?: |-)charge)$/i }
                    })
                        .populate('produitId')
                        .populate('acheteurId', 'nom prenom email')
                        .populate('vendeurId', 'nom prenom email')
                        .sort({ createdAt: 1 })
                        .lean()
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

        return res.status(200).json({
            success: true,
            count: history.length,
            commandes: history
        });
    } catch (error) {
        return res.status(500).json({ error: 'Erreur lors de la récupération de l’historique.' });
    }
};







module.exports = {
    getExpedieesOrders,
    getLivreurHistory
};