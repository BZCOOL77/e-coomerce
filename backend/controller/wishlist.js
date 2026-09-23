// controllers/wishlist.js
const User = require('../models/user');

/**
 * 1. AJOUTER / RETIRER UN PRODUIT DES FAVORIS (Toggle)
 */
exports.toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.auth.userId; // Récupéré du token JWT par le middleware auth

    // Récupérer l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Vérifier si le produit est DÉJÀ dans ses favoris
    const isFavorite = user.wishlist.includes(productId);

    if (isFavorite) {
      // ❌ S'il y est déjà -> On le retire ($pull)
      await User.findByIdAndUpdate(userId, {
        $pull: { wishlist: productId }
      });

      return res.status(200).json({ 
        message: "Produit retiré des favoris.", 
        isFavorite: false 
      });

    } else {
      // 💖 S'il n'y est pas -> On l'ajoute ($addToSet évite les doublons)
      await User.findByIdAndUpdate(userId, {
        $addToSet: { wishlist: productId }
      });

      return res.status(200).json({ 
        message: "Produit ajouté aux favoris !", 
        isFavorite: true 
      });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 2. RÉCUPÉRER TOUS LES PRODUITS FAVORIS DE L'UTILISATEUR (Pour la page "Mes Favoris")
 */
exports.getUserWishlist = async (req, res) => {
  try {
    const userId = req.auth.userId;

    // On remplace les IDs par les produits, ET pour chaque produit on peuple son vendeurId !
    const user = await User.findById(userId).populate({
      path: 'wishlist',
      populate: {
        path: 'vendeurId',
        select: 'nom prenom boutique' // On récupère la boutique et le nom du vendeur
      }
    });

    res.status(200).json({ 
      wishlist: user ? user.wishlist : [] 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 3. RÉCUPÉRER UNIQUEMENT LE TABLEAU DES IDs FAVORIS (Optimisation chargement rapide)
 * Remplace l'ancien 'checkIfFavorite' pour éviter les requêtes HTTP en boucle.
 */
exports.getUserWishlistIds = async (req, res) => {
  try {
    const userId = req.auth.userId;

    // .select('wishlist') permet de charger UNIQUEMENT le champ wishlist (très léger et rapide)
    const user = await User.findById(userId).select('wishlist');

    res.status(200).json({ 
      wishlistIds: user ? user.wishlist : [] 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};