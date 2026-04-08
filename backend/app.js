const express = require('express');
const app = express();
const mongoose = require('mongoose');
const Thing = require('./models/Thing');
const cors = require('cors');
app.use(cors());

// Connexion à MongoDB
const url = "mongodb://testeur:NsvDugXZW5QoOMt7@ac-pyfpuo7-shard-00-00.iyzm2ae.mongodb.net:27017,ac-pyfpuo7-shard-00-01.iyzm2ae.mongodb.net:27017,ac-pyfpuo7-shard-00-02.iyzm2ae.mongodb.net:27017/?ssl=true&replicaSet=atlas-wuk8pq-shard-0&authSource=admin&appName=Cluster0&retryWrites=true&w=majority";

mongoose.connect(url)
  .then(() => console.log('Connexion à MongoDB réussie ! 🔥'))
  .catch((err) => console.log('Le bébé boude encore : ', err));

app.use(express.json());// Middleware pour parser les requêtes JSON


app.post('/api/products', (req, res) => {// Middleware pour créer une nouvelle marchandise
  delete req.body._id; // Supprimer l'ID généré par le client
  
    const thing = new Thing({
        ...req.body
    });
    thing.save()
        .then(() => res.status(201).json({ message: 'Objet enregistré !' }))
        .catch(error => res.status(400).json({ error }));
});

// Middleware pour envoyer les marchandises au frontend
app.get('/api/products/:id', (req, res, next) => {
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
});

app.get( '/api/products', (req, res, next) => {
  Thing.find()
    .then((things) => res.status(200).json(things))
    .catch((error) => res.status(400).json({ error }));
});



//middleware pour modifier une marchandise
app.put('/api/products/:id', (req, res, next) => {
  Thing.updateOne({ _id: req.params.id }, { ...req.body, _id: req.params.id })
    .then(() => res.status(200).json({ message: 'Objet mis à jour !' }))
    .catch((error) => res.status(400).json({ error }));
});

//middleware pour preremplire les champs du formulaire de modification
app.get('/api/products/:id', (req, res, next) => {
  Thing.findOne({ _id: req.params.id })
    .then(product => {
        if (!product) return res.status(404).json({ message: "Produit non trouvé" });
        res.status(200).json(product);
    })
    .catch(error => res.status(404).json({ error }));
});


// Middleware pour supprimer un produit
app.delete('/api/products/:id', (req, res, next) => {
  Thing.deleteOne({ _id: req.params.id })
    .then(() => res.status(200).json({ message: 'Objet supprimé ! 🗑️' }))
    .catch(error => res.status(400).json({ error }));
});








module.exports = app;