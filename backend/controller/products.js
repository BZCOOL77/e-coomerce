const mongoose = require('mongoose');
const Thing = require('../models/Thing');// Importer le modèle de données pour les produits



// Middleware pour créer une nouvelle marchandise
exports.createProduct = (req, res, next) => {
  delete req.body._id; // Supprimer l'ID généré par le client

  // 1. Validation : Vérifier que la catégorie est bien présente
  if (!req.body.categorie) {
    return res.status(400).json({ error: 'La catégorie est obligatoire.' });
  }
  
    const thing = new Thing({
        ...req.body,
        vendeurId: req.auth.userId // Associer le vendeurId à l'utilisateur authentifié qui crée le produit
    });
    thing.save()
        .then(() => res.status(201).json({ message: 'Objet enregistré !' }))
        .catch(error =>// On log l'erreur et on envoie UNE SEULE réponse d'erreur
            console.error("ERREUR MONGOOSE :", error) || res.status(400).json({ error: error.message || error })
        );
};

// Middleware pour envoyer une seule marchandise au frontend et aussi
//pour preremplir les champs du formulaire de modification
exports.getOneProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        // 1. Vérification du format de l'ID pour éviter les erreurs CastError
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Format d\'identifiant produit invalide.' });
        }

        // 2. Recherche du produit + sélection précise des infos vendeur
        const thing = await Thing.findById(id).populate('vendeurId', 'nom prenom boutique');

        // 3. Vérification si le produit existe
        if (!thing) {
            return res.status(404).json({ message: 'Produit non trouvé !' });
        }

        // 4. Succès
        return res.status(200).json(thing);

    } catch (error) {
        return res.status(500).json({ error: error.message || 'Erreur serveur lors de la récupération du produit.' });
    }
};

// MIDDLEWARE POUR ENVOYER TOUTES LES MARCHANDISES AU FRONTEND (avec filtres optionnels)
exports.getAllProducts = (req, res, next) => {
    // 1. On extrait les paramètres de filtrage depuis l'URL (ex: ?vendeurId=65f...&categorie=Électronique)
    const { vendeurId, categorie } = req.query;

    // 2. On construit un objet de recherche MongoDB dynamique
    const conditionDeRecherche = {};

    // 3. Si un vendeurId est présent, on l'ajoute à la condition
    if (vendeurId) {
        conditionDeRecherche.vendeurId = vendeurId;
    }

    // 4. Si une catégorie est présente, on l'ajoute à la condition (avec regex pour être insensible à la casse)
    if (categorie) {
        conditionDeRecherche.categorie = { $regex: new RegExp(`^${categorie.trim()}$`, 'i') };
    }

    // 5. Exécution de la recherche en BDD avec l'ensemble des filtres appliqués
    Thing.find(conditionDeRecherche)
        .then((things) => res.status(200).json(things))
        .catch((error) => res.status(400).json({ error }));
};

// Middleware pour modifier une marchandise
exports.updateProduct = async (req, res, next) => {
  // Refuser les identifiants mal formés avant toute requête MongoDB.
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Format d’identifiant produit invalide.' });
  }

  // Copier les données pour empêcher le client de changer l’ID ou le propriétaire du produit.
  const productData = { ...req.body };
  delete productData._id;
  delete productData.vendeurId;

  try {
    // Limiter la mise à jour au produit appartenant au vendeur connecté et valider les champs.
    const result = await Thing.updateOne(
      { _id: req.params.id, vendeurId: req.auth.userId },
      { $set: productData },
      { runValidators: true }
    );

    // Répondre 404 si le produit n’existe pas ou appartient à un autre vendeur.
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Produit non trouvé !' });
    }

    return res.status(200).json({ message: 'Objet mis à jour !' });
  } catch (error) {
    // Signaler explicitement une erreur survenue pendant la mise à jour.
    return res.status(400).json({ error: error.message || error });
  }
};




// Middleware pour supprimer un produit
exports.deleteProduct = async (req, res, next) => {
  // Refuser les identifiants mal formés avant toute requête MongoDB.
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Format d’identifiant produit invalide.' });
  }

  try {
    // Ne supprimer que le produit appartenant au vendeur connecté.
    const result = await Thing.deleteOne({
      _id: req.params.id,
      vendeurId: req.auth.userId
    });

    // Répondre 404 si le produit n’existe pas ou appartient à un autre vendeur.
    if (result.deletedCount === 0) {//deletedCount est une propriété de l'objet result qui indique combien de documents ont été supprimés. Si aucun document n'a été supprimé, cela signifie que le produit n'existait pas ou n'appartenait pas au vendeur connecté.
      return res.status(404).json({ message: 'Produit non trouvé !' });
    }

    return res.status(200).json({ message: 'Objet supprimé ! 🗑️' });
  } catch (error) {
    // Signaler explicitement une erreur survenue pendant la suppression.
    return res.status(400).json({ error: error.message || error });
  }
};

// Middleware pour la barre de recherche
exports.searchProducts =  async (req, res, next) => {
    const query = req.query.q; // On récupère ce que l'utilisateur a tapé
    try {
        const produits = await Thing.find({
            nom: { $regex: query, $options: 'i' } // 'i' veut dire qu'on ignore la casse (Maj/Min)
        });
        res.json(produits);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// 2. Pour ne récupérer que MES produits (la boutique du vendeur)
exports.getMyProducts = (req, res, next) => {
    // On ne cherche que les produits correspondants à l'ID du token
    Thing.find({ vendeurId: req.auth.userId }) 
        .then(products => res.status(200).json(products))
        .catch(error => res.status(400).json({ error }));
};



//on exporte nos fonctions de contrôle pour les produits
module.exports = {
  createProduct: exports.createProduct,
  getOneProduct: exports.getOneProduct,
  getAllProducts: exports.getAllProducts,
  updateProduct: exports.updateProduct,
  getProductForEdit: exports.getProductForEdit,
  deleteProduct: exports.deleteProduct,
  searchProducts: exports.searchProducts,
  getMyProducts: exports.getMyProducts

};