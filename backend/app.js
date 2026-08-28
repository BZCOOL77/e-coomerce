const express = require('express');
const app = express();
const mongoose = require('mongoose');
const Thing = require('./models/Thing');

const productsroutes = require('./routes/products');// Importer les routes des produits
const userroutes = require('./routes/user');// Importer les routes client d'authentification
const orderroutes = require('./routes/order');// Importer les routes des commandes
const livreurroutes = require('./routes/livreurroute'); // Routes pour les livreurs



const cors = require('cors');
app.use(cors());

// Connexion à MongoDB
const url = "mongodb://testeur:NsvDugXZW5QoOMt7@ac-pyfpuo7-shard-00-00.iyzm2ae.mongodb.net:27017,ac-pyfpuo7-shard-00-01.iyzm2ae.mongodb.net:27017,ac-pyfpuo7-shard-00-02.iyzm2ae.mongodb.net:27017/?ssl=true&replicaSet=atlas-wuk8pq-shard-0&authSource=admin&appName=Cluster0&retryWrites=true&w=majority";

mongoose.connect(url, {
  // Évite qu'une sauvegarde reste en attente si MongoDB n'est pas joignable.
  serverSelectionTimeoutMS: 10000,
  bufferTimeoutMS: 10000
})
  .then(() => console.log('Connexion à MongoDB réussie ! 🔥'))
  .catch((err) => console.log('Le bébé boude encore : ', err));

app.use(express.json());// Middleware pour parser les requêtes JSON



// Middleware pour gérer les routes des produits
app.use('/api/products', productsroutes);


// Middleware pour gérer les routes des utilisateurs
app.use('/api/auth', userroutes);

// Middleware pour gérer les routes des commandes
app.use('/api/orders', orderroutes);

// Middleware pour gérer les routes spécifiques aux livreurs
app.use('/api/livreur', livreurroutes);



console.log("Routes d'authentification chargées !");


module.exports = app;