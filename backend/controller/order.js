const Order = require('../models/Order');

// 1. Créer une commande (Action du client/acheteur)
exports.createOrder = (req, res) => {
    const order = new Order({
        ...req.body,
        // On récupère l'ID de l'acheteur directement depuis le middleware auth !
        acheteurId: req.auth.userId 
    });

    order.save()
        .then(() => res.status(201).json({ message: 'Commande enregistrée avec succès ! 🛒' }))
        .catch(error => res.status(400).json({ error: error.message }));
};

// 2. Récupérer les commandes d'un vendeur (Action du vendeur)pour le mettre dans son interface de gestion des commandes
exports.getVendeurOrders = (req, res) => {
    // On filtre : "Donne-moi les commandes où le vendeurId est MOI (le vendeur connecté)"
    Order.find({ vendeurId: req.auth.userId })
        .populate('produitId') // Remplit les infos du produit (nom, image) au lieu de juste l'ID
        //populate pour info acheteur
        .populate('acheteurId', 'nom email') // Remplit les infos de l'acheteur (nom, email)
        .then(orders => res.status(200).json(orders))
        .catch(error => res.status(400).json({ error }));
};


//gerer les staut des des commandes
exports.updateStatut = (req, res, next) => {
    // 1. On prépare le nouveau statut reçu du frontend
    const nouveauStatut = req.body.statut;

    // 2. On met à jour la commande qui correspond à l'ID passé dans l'URL (:id)
    Order.updateOne(
        { _id: req.params.id }, 
        { statut: nouveauStatut }
    )
    .then((result) => {
        // Si aucun document n'a été modifié, c'est que l'ID n'existait pas
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Commande introuvable." });
        }
        res.status(200).json({ message: `Statut mis à jour : ${nouveauStatut} !` });
    })
    .catch(error => res.status(400).json({ error }));
};