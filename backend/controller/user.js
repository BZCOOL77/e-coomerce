const User = require("../models/user");//on importe le modèle User pour interagir avec la base de données
const UserHistory = require("../models/userhistorique");//on importe le modèle UserHistory pour interagir avec la base de données
const bcrypt = require("bcryptjs");//on importe bcrypt pour le hachage des mots de passe
const jwt = require("jsonwebtoken");//on importe jsonwebtoken pour la création de tokens d'authentification


// Inscription d'un nouvel utilisateur
exports.inscrire = (req, res, next) => {
    bcrypt.hash(req.body.password, 10)
    .then(hash => {
        const user = new User({
            email: req.body.email,
            password: hash,// on enregistre le mot de passe hashé pour la sécurité
            nom: req.body.nom,
            prenom: req.body.prenom,
            role: 'acheteur', //on force le rôle à "acheteur" pour tous les nouveaux inscrits, même si le frontend envoie autre chose
        
           
            });
            user.save()
            .then(() => res.status(201).json({
                        message: 'Utilisateur créé et connecté !',
                        userId: user._id,
                        role: user.role,// on génère un token dès l'inscription pour connecter directement l'utilisateur après la création de son compte
                        token: jwt.sign(
                            { userId: user._id, role: user.role }, // on inclut aussi le rôle dans le token pour pouvoir l'utiliser dans les middlewares de contrôle d'accès
                            'RANDOM_TOKEN_SECRET',
                            { expiresIn: '24h' }
                        )
                    }))
            .catch(error => res.status(400).json({ error }));
    })
    .catch(error => res.status(500).json({ error }));

};


// Connexion d'un utilisateur existant
exports.seconnecter = (req, res, next) => {
    User.findOne({ email: req.body.email })
    .then(user => {
        if (user === null) {
            return res.status(401).json({ error: 'Utilisateur non trouvé !' });
        }
        bcrypt.compare(req.body.password, user.password)
        .then(valid => {
            if (!valid) {
                return res.status(401).json({ error: 'Mot de passe incorrect !' });
            }
            res.status(200).json({
                userId: user._id,
                role: user.role,// on renvoie aussi le rôle de l'utilisateur pour que le frontend puisse adapter l'interface
                token: jwt.sign(
                    { userId: user._id, role: user.role }, // on inclut aussi le rôle dans le token pour pouvoir l'utiliser dans les middlewares de contrôle d'accès        
                    'RANDOM_TOKEN_SECRET',
                    { expiresIn: '24h' }
                )
            });
        })
        .catch(error => res.status(500).json({ error }));
    })
    .catch(error => res.status(500).json({ error }));
};


// Déconnexion d'un utilisateur
exports.sedeconnecter = (req, res, next) => {};




//recuperer tout les vendeurs


exports.getAllVendeurs = (req, res, next) => {
    // On cherche tous les utilisateurs ayant le rôle 'vendeur'
    User.find({ role: 'vendeur' }, 'nom email boutique') // On renvoie aussi les informations de la boutique
        .then(vendeurs => res.status(200).json(vendeurs))
        .catch(error => res.status(400).json({ error }));
};


// 🟢 Fonction pour récupérer le profil de l'utilisateur connecté pour affichage en cliquant sur le bouton "profile"
exports.getProfile = async (req, res, next) => {
    try {
        // req.auth.userId a été injecté au préalable par ton middleware "auth" !
        // Le ".select('-password')" permet de ne JAMAIS renvoyer le mot de passe sur le réseau.
        const user = await User.findById(req.auth.userId).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: "Utilisateur introuvable dans la base de données !" });
        }

        // On renvoie les infos de l'utilisateur (id, email, etc.)
        res.status(200).json(user);
    } catch (error) {
        console.error("Erreur dans getProfile Controller :", error);
        res.status(500).json({ error: "Une erreur est survenue lors de la récupération du profil." });
    }
};




// FONCTION POUR CHANGER LES INFOS DU PROFIL UTILISATEUR (nom, prenom, email, boutique) ET ENREGISTRER L'HISTORIQUE
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.auth.userId; // ID sécurisé via le token JWT

        // 1. Chercher l'utilisateur actuel en BDD
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({ message: "Utilisateur introuvable !" });
        }

        const isVendeur = currentUser.role === 'vendeur';

        // 2. Définition dynamique des champs autorisés selon le rôle
        const allowedUserFields = ["prenom", "nom", "email"];
        const allowedBoutiqueFields = isVendeur ? [
            "nomBoutique", "descriptionBoutique", "categorieBoutique", 
            "solutionPaiement", "moyenPaiement", "typePaiement", "coordonneesPaiement", "communeBoutique", "quartierBoutique", 
            "avenueBoutique", "numeroadresseBoutique", "telephoneBoutique",
            "villeBoutique", "typeLocalBoutique", "latitudeBoutique",
            "longitudeBoutique", "photoBoutique"
        ] : [];

        const allowedFields = [...allowedUserFields, ...allowedBoutiqueFields];
        const requestedFields = Object.keys(req.body).filter((key) => allowedFields.includes(key));
        const hasRequestedFields = requestedFields.length > 0;

        // 3. Préparation des objets pour l'historique
        const oldValues = {};
        const newValues = {};
        let hasChanges = false;

        // --- ANALYSE DES CHAMPS UTILISATEUR DE BASE ---
        const { prenom, nom, email } = req.body;

        if (prenom && prenom !== currentUser.prenom) {
            oldValues.prenom = currentUser.prenom;
            newValues.prenom = prenom;
            currentUser.prenom = prenom;
            hasChanges = true;
        }

        if (nom && nom !== currentUser.nom) {
            oldValues.nom = currentUser.nom;
            newValues.nom = nom;
            currentUser.nom = nom;
            hasChanges = true;
        }

        if (email && email !== currentUser.email) {
            const emailExists = await User.findOne({ email: email });
            if (emailExists) {
                return res.status(400).json({ error: "Cette adresse email est déjà utilisée par un autre compte ! 🛑" });
            }
            oldValues.email = currentUser.email;
            newValues.email = email;
            currentUser.email = email;
            hasChanges = true;
        }

        // --- ANALYSE DES CHAMPS BOUTIQUE (SI VENDEUR) ---
        if (isVendeur) {
            // Initialiser l'objet boutique si absurde/vide en BDD
            if (!currentUser.boutique) {
                currentUser.boutique = {};
            }

            allowedBoutiqueFields.forEach((field) => {
                if (req.body[field] !== undefined) {// On vérifie que le champ est bien présent dans la requête
                    let newValue = req.body[field];

                    if (field === 'moyenPaiement' && typeof newValue === 'string') {
                        newValue = newValue.split(':', 1)[0].trim().toUpperCase();
                    }

                    // 🎯 Normalisation pour l'enum commune (majuscules + retrait des espaces)
                    if (field === 'communeBoutique' && typeof newValue === 'string') {
                        newValue = newValue.toUpperCase().trim();
                    }

                    const oldValue = currentUser.boutique[field] || null;

                    if (newValue !== oldValue) {
                        oldValues[`boutique.${field}`] = oldValue;
                        newValues[`boutique.${field}`] = newValue;
                        currentUser.boutique[field] = newValue;
                        hasChanges = true;
                    }
                }
            });
        }

        // --- ÉTAPE 4 : ENREGISTREMENT & LOG ---
        if (hasChanges) {
            const historyLog = new UserHistory({
                userId: currentUser._id,
                modifierId: req.auth.userId,
                modifierName: `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim(),
                oldValues: oldValues,
                newValues: newValues
            });

            await historyLog.save();
            await currentUser.save();

            // Construction de la réponse propre
            const responseData = {
                prenom: currentUser.prenom,
                nom: currentUser.nom,
                email: currentUser.email,
                role: currentUser.role
            };

            if (isVendeur) {
                responseData.boutique = currentUser.boutique;
            }

            return res.status(200).json({ 
                message: "Profil et boutique mis à jour avec succès ! 📑",
                user: responseData
            });
        }

        if (hasRequestedFields) {
            return res.status(400).json({ message: "Aucune modification détectée. Les valeurs envoyées sont identiques à celles déjà enregistrées." });
        }

        return res.status(400).json({ message: "Aucune donnée de profil à mettre à jour n'a été fournie." });

    } catch (error) {
        console.error("Erreur lors de la mise à jour du profil :", error);
        res.status(500).json({ error: error.message || "Une erreur est survenue lors de la mise à jour." });
    }
};


//FONCTION POUR CHANGER LE MOT DE PASSE DU PROFILE UTILISATEUR ET ENREGISTRER L'HISTORIQUE DES MODIFICATIONS
exports.updatePassword = async (req, res) => {
    try {
        const userId = req.auth.userId;
        // 📥 On récupère la confirmation envoyée par le frontend
        const { oldPassword, newPassword, confirmPassword } = req.body;

        // --- 🛡️ ÉTAPE 1 : LES VÉRIFICATIONS EXPRESS EN TEXTE BRUT ---

        // 🛑 NOUVELLE SÉCURITÉ : Est-ce que les deux nouveaux mots de passe correspondent ?
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ 
                error: "Le nouveau mot de passe et sa confirmation ne sont pas identiques ! ❌" 
            });
        }

        // 🛑 Sécurité de base : On évite les champs vides
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: "Tous les champs sont obligatoires !" });
        }

        // --- 🔍 ÉTAPE 2 : VÉRIFICATION DU COMPTE EN BDD ---

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "Utilisateur introuvable !" });
        }

        // 🛑 Sécurité fournisseur tiers (Google, Apple...)
        if (user.authProvider && user.authProvider !== 'local') {
            return res.status(400).json({ 
                error: `Votre compte étant géré par ${user.authProvider}, vous ne pouvez pas modifier ce mot de passe ici.` 
            });
        }

        // --- 🔑 ÉTAPE 3 : LES SÉCURITÉS BCRYPT (HASH) ---

        // 🛑 L'ancien mot de passe est-il le bon ?
        const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Le mot de passe actuel est incorrect. Modification refusée ! 🛡️" });
        }

        // 🛑 Le nouveau est-il identique à l'ancien ?
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ error: "Le nouveau mot de passe doit être différent de l'ancien !" });
        }

        // --- 📑 ÉTAPE 4 : ARCHIVAGE & ENREGISTREMENT ---

        // On crée le log (sans stocker de mot de passe)
        const historyLog = new UserHistory({
            userId: user._id,
            modifierId: req.auth.userId,
            modifierName: `${user.prenom} ${user.nom}`.trim(),
            oldValues: { passwordChanged: true },
            newValues: { passwordChanged: true }
        });
        await historyLog.save();

        // Hachage et mise à jour
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({ message: "Votre mot de passe a été modifié avec succès ! 🔒" });

    } catch (error) {
        console.error("Erreur changement mot de passe :", error);
        res.status(500).json({ error: "Impossible de modifier le mot de passe." });
    }
};


// devenir vendeur (Mise à jour PUT)
exports.devenirVendeur = async (req, res, next) => {
    try {
        const userId = req.auth.userId;

        // 1. Extraire les données du body
        const {
            nomBoutique,
            descriptionBoutique,
            categorieBoutique,
            moyenPaiement,
            solutionPaiement,
            coordonneesPaiement,
            communeBoutique,
            quartierBoutique,
            avenueBoutique,
            numeroadresseBoutique,
            telephoneBoutique,
            villeBoutique,
            typeLocalBoutique,
            latitudeBoutique,
            longitudeBoutique,
            photoBoutique
        } = req.body;

        // 🔒 2. Validation "manuelle" AVANT toute modification :
        // On vérifie que tous les champs requis sont bien transmis dans la requête
        if (
            !nomBoutique || !descriptionBoutique || !categorieBoutique || 
            !moyenPaiement || !communeBoutique || !quartierBoutique || 
            !avenueBoutique || !numeroadresseBoutique || !telephoneBoutique
        ) {
            return res.status(400).json({ 
                error: "Tous les champs de la boutique sont obligatoires pour devenir vendeur." 
            });
        }

        // 3. Récupérer l'utilisateur existant en BDD
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "Utilisateur non trouvé." });
        }

        // 4. Mettre à jour son rôle et affecter le sous-objet boutique
        user.role = 'vendeur';
        user.boutique = {
            
            nomBoutique: String(nomBoutique || '').trim(),
            descriptionBoutique: String(descriptionBoutique || '').trim(),
            categorieBoutique: String(categorieBoutique || '').trim(),
            moyenPaiement: String(moyenPaiement || '').trim(),
            solutionPaiement: String(solutionPaiement || '').trim(),
            coordonneesPaiement: String(coordonneesPaiement || '').trim(),
            villeBoutique: String(villeBoutique || '').trim().toUpperCase(),
            communeBoutique: String(communeBoutique || '').trim().toUpperCase(),
            quartierBoutique: String(quartierBoutique || '').trim(),
            avenueBoutique: String(avenueBoutique || '').trim(),
            numeroadresseBoutique: String(numeroadresseBoutique || '').trim(),
            telephoneBoutique: String(telephoneBoutique || '').trim(),
            typeLocalBoutique: String(typeLocalBoutique || '').trim(),
            latitudeBoutique: latitudeBoutique !== undefined ? Number(latitudeBoutique) : null,// On convertit en Number si défini, sinon null
            longitudeBoutique: longitudeBoutique !== undefined ? Number(longitudeBoutique) : null,
            photoBoutique: String(photoBoutique || '').trim()
            
        };

        console.log("Données reçues :", req.body);

        // Traces temporaires pour vérifier si le blocage se produit pendant la sauvegarde MongoDB.
        console.log('Début sauvegarde vendeur :', user._id);
        await user.save();
        console.log('Sauvegarde vendeur terminée :', user._id);

        // 6. Générer le nouveau Token JWT rafraîchi avec role: 'vendeur'
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET || 'RANDOM_TOKEN_SECRET',
            { expiresIn: '24h' }
        );

        // 7. Renvoyer la réponse
        return res.status(200).json({
            message: 'Félicitations ! Vous êtes maintenant un vendeur sur notre plateforme ! 🎉',
            userId: user._id,
            role: user.role,
            token: token
        });

    } catch (error) {
        console.error("Erreur devenir vendeur :", error);
        return res.status(500).json({ error: error.message || "Impossible de devenir vendeur." });
    }
};