const express = require('express');
const router = express.Router();
const Thing = require('../models/Thing');
const productsctrl = require('../controller/products');
const auth = require('../middleware/auth');


// Middleware pour créer une nouvelle marchandise
router.post('/',auth, productsctrl.createProduct);


//middleware pour la barre de recherche
router.get('/search', productsctrl.searchProducts);

// Middleware pour envoyer les marchandises au frontend
router.get('/:id', productsctrl.getOneProduct);


//middleware pour preremplire les champs du formulaire de modification
router.get('/:id',auth, productsctrl.getProductForEdit);

// Middleware pour envoyer toutes les marchandises au frontend
router.get( '/', productsctrl.getAllProducts);





//middleware pour modifier une marchandise
router.put('/:id',auth, productsctrl.updateProduct);




// Middleware pour supprimer un produit
router.delete('/:id', auth, productsctrl.deleteProduct);


//on exporte notres router
module.exports = router;