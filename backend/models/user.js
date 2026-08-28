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
    required: true,
    enum: ['acheteur', 'vendeur', 'admin', 'livreur'], 
    default: 'acheteur' 
  },

  //info boutique (pour les vendeurs)
  // 📍 Ce champ est optionnel : il ne concerne QUE les vendeurs
  boutique: {
        nomBoutique: { type: String, default: null, required: function() { return this.role === 'vendeur'; } },// Le nom de la boutique est requis uniquement si le rôle est "vendeur"
        descriptionBoutique: { type: String, default: null, required: function() { return this.role === 'vendeur'; } },// La description de la boutique est requise uniquement si le rôle est "vendeur"
        categorieBoutique: { type: String, default: null, required: function() { return this.role === 'vendeur'; } },

        solutionPaiement: { type: String, required: function() { return this.role === 'vendeur'; } },
        moyenPaiement: { type: String, enum:['MOBILE_MONEY','IBAN'], default: null, required: function() { return this.role === 'vendeur'; } },
        coordonneesPaiement: { type: String, default: null, required: function() { return this.role === 'vendeur'; } },

        villeBoutique: { type: String, default: null, enum:['LUBUMBASHI',], required: function() { return this.role === 'vendeur'; } },
        communeBoutique: { type: String,enum:['LUBUMBASHI', 'KENYA', 'KAMALONDO', 'RUASHI','KAMPEMBA', 'ANNEXE', 'KATUBA' ], default: null,
           required: function() { return this.role === 'vendeur'; } },
        quartierBoutique: { type: String, default: null, required: function() { return this.role === 'vendeur'; } },
        avenueBoutique: { type: String, default: null, required: function() { return this.role === 'vendeur'; } },
        numeroadresseBoutique: { type: String, default: null, required: function() { return this.role === 'vendeur'; } },
        telephoneBoutique: { type: String, default: null, required: function() { return this.role === 'vendeur'; } },
        typeLocalBoutique: { type: String, enum: ['boutique', 'entrepot', 'domicile'], default: null, required: function() { return this.role === 'vendeur'; } },
        latitudeBoutique: { type: Number, default: null},
        longitudeBoutique: { type: Number, default: null },
        photoBoutique: { type: String, default: null }
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
  },

 //zone géographique de livraison (pour les livreurs)
  // 📍 Ce champ est optionnel : il ne concerne QUE les livreurs
  zoneAssignee: {
    communes: [{ type: String,
      enum:['LUBUMBAHI', 'KENYA', 'KAMALONDO', 'RUASHI','KAMPEMBA', 'ANNEXE', 'KATUBA' ]
     }], 
    capaciteMaxColis: { type: Number, default: 30 }
  },

}, { timestamps: true }
);



// On applique le plugin de validation d'unicité
userSchema.plugin(uniqueValidator.default);

// Empêche l'erreur OverwriteModelError quand le modèle est défini plusieurs fois
module.exports = mongoose.models.User || mongoose.model('User', userSchema);