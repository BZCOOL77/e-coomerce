const Thing = require('../models/Thing');// Importer le modèle de données pour les produits

exports.createProduct = (req, res, next) => {// Middleware pour créer une nouvelle marchandise
  delete req.body._id; // Supprimer l'ID généré par le client
  
    const thing = new Thing({
        ...req.body
    });
    thing.save()
        .then(() => res.status(201).json({ message: 'Objet enregistré !' }))
        .catch(error => res.status(400).json({ error }));
}

// Middleware pour envoyer les marchandises au frontend
exports.getOneProduct =  (req, res, next) => {
  Thing.findOne({ _id: req.params.id })
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

// Middleware pour envoyer toutes les marchandises au frontend
exports.getAllProducts = (req, res, next) => {
  Thing.find()
    .then((things) => res.status(200).json(things))
    .catch((error) => res.status(400).json({ error }));
}

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
exports.searchProducts =  async (req, res) => {
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




//on exporte nos fonctions de contrôle pour les produits
module.exports = {
  createProduct: exports.createProduct,
  getOneProduct: exports.getOneProduct,
  getAllProducts: exports.getAllProducts,
  updateProduct: exports.updateProduct,
  getProductForEdit: exports.getProductForEdit,
  deleteProduct: exports.deleteProduct,
  searchProducts: exports.searchProducts

};