const express = require('express');
const app = express();
const mongoose = require('mongoose');

const productsroutes = require('./routes/products');

const cors = require('cors');
app.use(cors());

// Connexion à MongoDB
const url = "mongodb://testeur:NsvDugXZW5QoOMt7@ac-pyfpuo7-shard-00-00.iyzm2ae.mongodb.net:27017,ac-pyfpuo7-shard-00-01.iyzm2ae.mongodb.net:27017,ac-pyfpuo7-shard-00-02.iyzm2ae.mongodb.net:27017/?ssl=true&replicaSet=atlas-wuk8pq-shard-0&authSource=admin&appName=Cluster0&retryWrites=true&w=majority";

mongoose.connect(url)
  .then(() => console.log('Connexion à MongoDB réussie ! 🔥'))
  .catch((err) => console.log('Le bébé boude encore : ', err));

app.use(express.json());// Middleware pour parser les requêtes JSON








// Middleware pour gérer les routes des produits
app.use('/api/products', productsroutes);

module.exports = app;