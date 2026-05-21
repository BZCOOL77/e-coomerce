const express = require('express');
const router = express.Router();
const Thing = require('../models/Thing');
const productsctrl = require('../controller/products');
const auth = require('../middleware/auth');
const vendeurOnly = require('../middleware/vendeuronly');

//middleware pour la barre de recherche
router.get('/search', productsctrl.searchProducts);


// middleware pour récupérer les produits du vendeur connecté
router.get('/me', auth, productsctrl.getMyProducts);


// Middleware pour créer une nouvelle marchandise
router.post('/',auth,vendeurOnly, productsctrl.createProduct);





// Middleware pour envoyer toutes les marchandises au frontend
router.get( '/', productsctrl.getAllProducts);



// Middleware pour envoyer les marchandises au frontend
router.get('/:id', productsctrl.getOneProduct);


//middleware pour preremplire les champs du formulaire de modification
router.get('/:id',auth,vendeurOnly, productsctrl.getProductForEdit);


//middleware pour modifier une marchandise
router.put('/:id',auth,vendeurOnly, productsctrl.updateProduct);




// Middleware pour supprimer un produit
router.delete('/:id', auth,vendeurOnly, productsctrl.deleteProduct);




//on exporte notres router
module.exports = router;