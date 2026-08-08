const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');

const userSchema = mongoose.Schema({// Identifiants de connexion
  //ON VERIFIE LE FOURNISSEUR DE L'AUTH 
  authProvider: {
    type: String,
    enum: ['local', 'google', 'apple'], // Limite les valeurs possibles
    default: 'local'
  },
  // On utilise l'email comme identifiant unique pour la connexion
  email: { 
    type: String, 
    required: true, 
    unique: true, // Empêche les doublons
    lowercase: true, // Force l'email en minuscules pour éviter les erreurs
    trim: true // Supprime les espaces inutiles avant/après
  },
  password: { 
    type: String, 
    required: true 
  },

  // Informations personnelles
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  
  // Gestion des Rôles
  role: { 
    type: String, 
    enum: ['client', 'vendeur', 'admin', 'livreur'], 
    default: 'client' 
  },

  //zone géographique de livraison (pour les livreurs)
  // 📍 Ce champ est optionnel : il ne concerne QUE les livreurs
  zoneAssignee: {
    communes: [{ type: String,
      enum:['LUBUMBAHI', 'KENYA', 'KAMALONDO', 'RUASHI','KAMPEMBA', 'ANNEXE', 'KATUBA' ]
     }], 
    capaciteMaxColis: { type: Number, default: 30 }
  },

  // Système de licence (Prévu pour le plan à 20€)
  isLicenseActive: { 
    type: Boolean, 
    default: false 
  },
  dateFinLicence: { 
    type: Date 
  },

  // Date de création du compte
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// On applique le plugin de validation d'unicité
userSchema.plugin(uniqueValidator.default);

// Empêche l'erreur OverwriteModelError quand le modèle est défini plusieurs fois
module.exports = mongoose.models.User || mongoose.model('User', userSchema);