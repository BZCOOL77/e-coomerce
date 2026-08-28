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

// Middleware pour envoyer les marchandises au frontend
exports.getOneProduct =  (req, res, next) => {
  Thing.findOne({ _id: req.params.id })
    .populate('vendeurId', 'nom')
    .then((thing) => {
      if (!thing) {
        return res.status(404).json({ message: 'Objet non trouvé !' });
      }
      res.status(200).json(thing);
    })
    .catch((error) => {
      res.status(500).json({ error });
    });
} 

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
exports.updateProduct =  (req, res, next) => {
  Thing.updateOne({ _id: req.params.id }, { ...req.body, _id: req.params.id })
    .then(() => res.status(200).json({ message: 'Objet mis à jour !' }))
    .catch((error) => res.status(400).json({ error }));
}

// Middleware pour preremplir les champs du formulaire de modification
exports.getProductForEdit =  (req, res, next) => {
  Thing.findOne({ _id: req.params.id })
    .then(product => {
        if (!product) return res.status(404).json({ message: "Produit non trouvé" });
        res.status(200).json(product);
    })
    .catch(error => res.status(404).json({ error }));
} 

// Middleware pour supprimer un produit
exports.deleteProduct = (req, res, next) => {
  Thing.deleteOne({ _id: req.params.id })
    .then(() => res.status(200).json({ message: 'Objet supprimé ! 🗑️' }))
    .catch(error => res.status(400).json({ error }));
}

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